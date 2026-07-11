import * as vscode from 'vscode';
import {
	type NameAndOrNumber,
	type ObjectIdentifierValue,
} from '@wildboar/asn1-parser';
import { type Scope, getModulesForScope } from "./scope.js";

interface GetImportsParameters {
	/** If omitted, the whole workspace is read. */
	readonly scope?: Scope;
}

interface ImportedModule {
	name: string;
	oid?: NameAndOrNumber[];
	symbolList: string[];
	selectionOption?: string;
}

interface ModuleImports {
	fileURI: string;
	name: string;
	oid?: NameAndOrNumber[];
	iri?: string;
	imports: ImportedModule[];
}

interface GetImportedSymbolsResult {
	modules: ModuleImports[];
}

export class GetImportsTool implements vscode.LanguageModelTool<GetImportsParameters> {
	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<GetImportsParameters>,
		token: vscode.CancellationToken
	) {

		const ret: GetImportedSymbolsResult = {
			modules: [],
		};
		for await (const [doc, mod] of getModulesForScope(options.input.scope, token)) {
			const retModule: ModuleImports = {
				fileURI: doc.uri.toString(),
				name: mod.name,
				iri: mod.iri,
				oid: mod.oid?.map((oid) => {
					delete oid.production;
					delete oid.productionType;
					delete oid.text;
					return oid;
				}),
				imports: [],
			};
			for (const sfm of Object.values(mod.imports.modules)) {
				let oid: NameAndOrNumber[] | undefined;
				if (sfm.assignedIdentifier && ("components" in sfm.assignedIdentifier)) {
					const assid: ObjectIdentifierValue = sfm.assignedIdentifier;
					const referring = assid
						.components
						.some((c) => (
							("reference" in c)
							|| ("number" in c && c.number && typeof c.number !== "number")
						));
					if (!referring) {
						// Other than DefinedValue, all other variants can be translated.
						oid = assid
							.components
							.map((c): NameAndOrNumber => {
								const name = (("name" in c) && c.name)
									? c.name
									: undefined;
								const num = (("number" in c) && (typeof c.number === "number"))
									? c.number
									: undefined;
								if (name) {
									return {
										name,
										number: num,
									};
								} else if (typeof num !== "undefined") {
									return {
										name,
										number: num,
									};
								} else {
									return {
										name: "MALFORMED",
										number: -1,
									};
								}
							});
					}
				}
				const retImport: ImportedModule = {
					name: sfm.identifier,
					oid,
					symbolList: Object.keys(sfm.symbolList),
					selectionOption: sfm.selectionOption,
				};
				retModule.imports.push(retImport);
			}
			ret.modules.push(retModule);
		}

		const json = JSON.stringify(ret);

        return new vscode.LanguageModelToolResult([
			new vscode.LanguageModelTextPart(`Here is a JSON export of modules and their imports: \n\n${json}`),
		]);
	}

	async prepareInvocation(
		options: vscode.LanguageModelToolInvocationPrepareOptions<GetImportsParameters>,
		_token: vscode.CancellationToken
	) {
		const scope = options.input.scope;
		let breadth: string = "the entire workspace";
		let moduleScope: string = "";
		if (scope) {
			if (scope.uris?.length && scope.includeGlobs?.length) {
				breadth = "selected files";
			} else if (scope.uris?.length === 1) {
				const parsed = vscode.Uri.parse(scope.uris[0], true);
				const relpath = vscode.workspace.asRelativePath(parsed);
				breadth = relpath;
			} else if (scope.includeGlobs?.length === 1) {
				breadth = "files matching " + scope.includeGlobs[0];
			} else if (scope.includeGlobs?.length || scope.uris?.length) {
				breadth = "selected files";
			}
			if (scope.moduleName) {
				moduleScope = scope.moduleOid
					? (" in selected versions of module " + scope.moduleName)
					: (" in module " + scope.moduleName)
					;
			}
		}
		return {
			invocationMessage: (
				"Getting imported symbols"
				+ moduleScope
				+ " from "
				+ breadth
			)
		};
	}
}
