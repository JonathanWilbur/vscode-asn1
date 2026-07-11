import * as vscode from 'vscode';
import {
    AssignmentType,
    ValueType,
    type NameAndOrNumber,
} from '@wildboar/asn1-parser';
import { type Scope, getModulesForScope } from "./scope.js";
import { getOidNodesFromModuleIdentifier } from '../utils.js';
import { resolveOidValue } from '../resolve.js';

interface GetObjectIdentifiersParameters {
    /** If omitted, the whole workspace is read. */
    readonly scope?: Scope;
}

interface ObjectIdentifierInfo {
    fileURI: string;
    moduleName: string;
    moduleOID?: NameAndOrNumber[];
    moduleIRI?: string;
    source: "module" | "assignment";
    arcs: NameAndOrNumber[];
    numbers?: number[];
}

interface GetObjectIdentifiersResult {
    objectIdentifiers: ObjectIdentifierInfo[];
}

export class GetObjectIdentifiersTool implements vscode.LanguageModelTool<GetObjectIdentifiersParameters> {
    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<GetObjectIdentifiersParameters>,
        token: vscode.CancellationToken
    ) {
        const ret: GetObjectIdentifiersResult = {
            objectIdentifiers: [],
        };
        for await (const [doc, mod] of getModulesForScope(options.input.scope, token)) {
            const moduleOID = mod.oid?.map((oid) => {
                delete oid.production;
                delete oid.productionType;
                delete oid.text;
                return oid;
            });
            if (mod.oid) {
                const numbers = getOidNodesFromModuleIdentifier(mod.oid);
                const info: ObjectIdentifierInfo = {
                    fileURI: doc.uri.toString(),
                    moduleName: mod.name,
                    moduleIRI: mod.iri,
                    moduleOID,
                    arcs: mod.oid,
                    source: "module",
                    numbers: numbers ?? undefined,
                };
                ret.objectIdentifiers.push(info);
            }
            for (const assn of Object.values(mod.assignments)) {
                if (assn.assignmentType !== AssignmentType.ValueAssignment) {
                    continue;
                }
                const v = assn.value;
                if (v.valueType !== ValueType.ObjectIdentifierValue) {
                    continue;
                }
                const arcs = await resolveOidValue(doc, v.value, token, mod);
                if (!arcs) {
                    continue;
                }
                const numbers = getOidNodesFromModuleIdentifier(arcs);
                const info: ObjectIdentifierInfo = {
                    fileURI: doc.uri.toString(),
                    moduleName: mod.name,
                    moduleIRI: mod.iri,
                    moduleOID,
                    arcs,
                    source: "assignment",
                    numbers: numbers ?? undefined,
                };
                ret.objectIdentifiers.push(info);
            }
        }
        const json = JSON.stringify(ret);
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`Here is a JSON export of object identifiers: \n\n${json}`),
        ]);
    }

    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<GetObjectIdentifiersParameters>,
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
                "Getting object identifiers"
                + moduleScope
                + " from "
                + breadth
            )
        };
    }
}
