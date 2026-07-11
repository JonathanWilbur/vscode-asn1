import * as vscode from 'vscode';
import {
    TaggingMode,
    type NameAndOrNumber,
} from '@wildboar/asn1-parser';
import { type Scope, getModulesForScope } from "./scope.js";

interface GetModulesParameters {
    /** If omitted, the whole workspace is read. */
    readonly scope?: Scope;
}

interface ModuleInfo {
    fileURI: string;
    name: string;
    oid?: NameAndOrNumber[];
    iri?: string;
    taggingMode: TaggingMode;
    extensibilityImplied: boolean;
    encodingReference?: string;
    exportsAll: boolean;
    assignmentsCount: number;
    importedModulesCount: number;
    importedSymbolsCount: number;
}

interface GetModulesResult {
    modules: ModuleInfo[];
}

export class GetModulesTool implements vscode.LanguageModelTool<GetModulesParameters> {
    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<GetModulesParameters>,
        token: vscode.CancellationToken
    ) {
        const ret: GetModulesResult = {
            modules: [],
        };
        for await (const [doc, mod] of getModulesForScope(options.input.scope, token)) {
            const retModule: ModuleInfo = {
                fileURI: doc.uri.toString(),
                name: mod.name,
                iri: mod.iri,
                oid: mod.oid?.map((oid) => {
                    delete oid.production;
                    delete oid.productionType;
                    delete oid.text;
                    return oid;
                }),
                taggingMode: mod.taggingMode,
                exportsAll: !(mod.exports),
                extensibilityImplied: mod.extensibilityImplied,
                encodingReference: mod.encodingReference,
                assignmentsCount: Object.keys(mod.assignments).length,
                importedModulesCount: Object.keys(mod.imports.modules).length,
                importedSymbolsCount: Object.values(mod.imports.modules)
                    .map((sfm) => Object.keys(sfm.symbolList).length)
                    .reduce((prev, curr) => prev + curr, 0),
            };
            ret.modules.push(retModule);
        }
        const json = JSON.stringify(ret);
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`Here is a JSON export of ASN.1 modules: \n\n${json}`),
        ]);
    }

    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<GetModulesParameters>,
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
                "Getting modules"
                + moduleScope
                + " from "
                + breadth
            )
        };
    }
}
