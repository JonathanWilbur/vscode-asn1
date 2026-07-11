import * as vscode from 'vscode';
import {
    type NameAndOrNumber,
} from '@wildboar/asn1-parser';
import { type Scope, getModulesForScope } from "./scope.js";

interface GetExportedSymbolsParameters {
    /** If omitted, the whole workspace is read. */
    readonly scope?: Scope;
}

interface ModuleExports {
    fileURI: string;
    name: string;
    oid?: NameAndOrNumber[];
    iri?: string;
    exports: string[];
}

interface GetExportedSymbolsResult {
    modules: ModuleExports[];
}

export class GetExportedSymbolsTool implements vscode.LanguageModelTool<GetExportedSymbolsParameters> {
    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<GetExportedSymbolsParameters>,
        token: vscode.CancellationToken
    ) {
        const ret: GetExportedSymbolsResult = {
            modules: [],
        };
        for await (const [doc, mod] of getModulesForScope(options.input.scope, token)) {
            const retModule: ModuleExports = {
                fileURI: doc.uri.toString(),
                name: mod.name,
                iri: mod.iri,
                oid: mod.oid?.map((oid) => {
                    delete oid.production;
                    delete oid.productionType;
                    delete oid.text;
                    return oid;
                }),
                exports: mod.exports?.exportedSymbols
                    ? Object.keys(mod.exports.exportedSymbols)
                    : Object.keys(mod.assignments),
            };
            ret.modules.push(retModule);
        }

        const json = JSON.stringify(ret);

        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`Here is a JSON export of modules and their exported symbols: \n\n${json}`),
        ]);
    }

    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<GetExportedSymbolsParameters>,
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
                "Getting exported symbols"
                + moduleScope
                + " from "
                + breadth
            )
        };
    }
}
