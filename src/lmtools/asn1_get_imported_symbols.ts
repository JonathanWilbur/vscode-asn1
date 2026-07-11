import * as vscode from 'vscode';
import { getOidNodesFromModuleIdentifier } from '../utils.js';
import type { FileURIStr } from '../types.js';
import { getParserOutputsWithLogging } from '../parsing.js';
import { asn1ModuleOidMatch, SelectionOption, type Module, type NameAndOrNumber, type ObjectIdentifierValue } from '@wildboar/asn1-parser';

interface Scope {
	readonly uris?: string[];
	readonly includeGlobs?: string[];
	readonly excludeGlob?: string;
	readonly moduleName?: string;
	readonly moduleOid?: number[];
	readonly selectionOption?: "successors" | "descendants";
}

// TODO: Replace getAsn1Files with this
async function* getAsn1Files2(): AsyncIterableIterator<vscode.Uri, void> {
	const config = vscode.workspace.getConfiguration("asn1");
	const includeFiles = config.get<string>("includeFiles", "**/*.{asn,asn1}");
	const excludeFiles: string | undefined = config.get<string>("excludeFiles");
	for (const document of vscode.workspace.textDocuments) {
		if (document.languageId === "asn1") {
			yield document.uri;
		}
	}
	yield *await vscode.workspace.findFiles(includeFiles, excludeFiles);
}

async function* getFilesForScope(scope?: Scope): AsyncIterableIterator<vscode.Uri, void> {
	if (!scope) {
		yield *getAsn1Files2();
		return;
	}
	for (const uristr of scope.uris ?? []) {
		try {
			const uri = vscode.Uri.parse(uristr, true);
			yield uri;
		} catch {
			continue;
		}
	}
	for (const includeGlob of scope.includeGlobs ?? []) {
		const workspaceUris = await vscode.workspace.findFiles(
			includeGlob,
			scope.excludeGlob,
		);
		yield* workspaceUris;
	}
}

async function* getDedupedFilesForScope(scope?: Scope): AsyncIterableIterator<vscode.Uri, void> {
	const encounteredFiles = new Set<FileURIStr>();
	for await (const uri of getFilesForScope(scope)) {
		const key = uri.toString();
		const existing = encounteredFiles.has(key);
		if (existing) {
			continue;
		}
		yield uri;
		encounteredFiles.add(key);
	}
} 

async function* getModulesForScope(
	scope?: Scope,
	token?: vscode.CancellationToken,
): AsyncIterableIterator<[vscode.TextDocument, Module], void> {
	const selopt = scope?.selectionOption
		? ((scope.selectionOption === "successors")
			? SelectionOption.WITH_SUCCESSORS
			: SelectionOption.WITH_DESCENDANTS)
		: undefined;
	for await (const uri of getDedupedFilesForScope(scope)) {
		try {
			const doc = await vscode.workspace.openTextDocument(uri);
			const p = await getParserOutputsWithLogging(uri, token);
			if (!p) {
				continue;
			}
			for (const mod of p.parsedModules) {
				if (scope?.moduleName && scope.moduleName !== mod.name) {
					continue;
				}
				if (!scope?.moduleOid !== !mod.oid) {
					continue;
				} else if (scope?.moduleOid && mod.oid) {
				 	const hasoid = getOidNodesFromModuleIdentifier(mod.oid);
					if (!hasoid || !asn1ModuleOidMatch(hasoid, scope.moduleOid, selopt)) {
						continue;
					}
				}
				yield [doc, mod];
			}
		} catch {
			continue;
		}
	}
} 

interface GetImportedSymbolsParameters {
	// If omitted, the whole workspace is read.
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

export class GetImportedSymbolsTool implements vscode.LanguageModelTool<GetImportedSymbolsParameters> {
	async invoke(
		options: vscode.LanguageModelToolInvocationOptions<GetImportedSymbolsParameters>,
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
		options: vscode.LanguageModelToolInvocationPrepareOptions<GetImportedSymbolsParameters>,
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
