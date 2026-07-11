import * as vscode from 'vscode';
import {
    AssignmentType,
    TypeType,
    ValueType,
    type NameAndOrNumber,
} from '@wildboar/asn1-parser';
import { type Scope, getModulesForScope } from "./scope.js";

interface GetAssignmentsParameters {
    /** If omitted, the whole workspace is read. */
    readonly scope?: Scope;
}

interface Assignment {
    name: string;
    assignmentType: AssignmentType;
    parametersCount: number;
    typeType?: TypeType;
    typeName?: string;
    valueType?: ValueType;
    infoObjectClass?: string;
}

interface ModuleAssignments {
    fileURI: string;
    name: string;
    oid?: NameAndOrNumber[];
    iri?: string;
    assignments: Assignment[];
}

interface GetAssignmentsResult {
    modules: ModuleAssignments[];
}

export class GetAssignmentsTool implements vscode.LanguageModelTool<GetAssignmentsParameters> {
    async invoke(
        options: vscode.LanguageModelToolInvocationOptions<GetAssignmentsParameters>,
        token: vscode.CancellationToken
    ) {
        const ret: GetAssignmentsResult = {
            modules: [],
        };
        for await (const [doc, mod] of getModulesForScope(options.input.scope, token)) {
            const retModule: ModuleAssignments = {
                fileURI: doc.uri.toString(),
                name: mod.name,
                iri: mod.iri,
                oid: mod.oid?.map((oid) => {
                    delete oid.production;
                    delete oid.productionType;
                    delete oid.text;
                    return oid;
                }),
                assignments: [],
            };
            for (const assn of Object.values(mod.assignments)) {
                const json: Assignment = {
                    name: assn.identifier,
                    assignmentType: assn.assignmentType,
                    parametersCount: assn.parameters?.length ?? 0,
                };
                if (assn.assignmentType === AssignmentType.ValueAssignment) {
                    json.valueType = assn.value.valueType;
                }
                switch (assn.assignmentType) {
                    case (AssignmentType.ValueAssignment):
                    case (AssignmentType.ValueSetTypeAssignment):
                    case (AssignmentType.TypeAssignment):
                        json.typeType = assn.type.typeType;
                        if (
                            (assn.type.typeType === TypeType.DefinedType)
                            && !assn.type.type.module
                            && !assn.type.type.parameters?.length
                        ) {
                            json.typeName = assn.type.type.reference;
                        }
                        break;
                    case (AssignmentType.ObjectAssignment):
                    case (AssignmentType.ObjectSetAssignment):
                        const def = assn.definedObjectClass;
                        if (!def.module && !def.parameters?.length) {
                            json.infoObjectClass = assn.definedObjectClass.reference;
                        }
                }
                retModule.assignments.push(json);
            }
            ret.modules.push(retModule);
        }

        const json = JSON.stringify(ret);

        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(`Here is a JSON export of modules and their assignments: \n\n${json}`),
        ]);
    }

    async prepareInvocation(
        options: vscode.LanguageModelToolInvocationPrepareOptions<GetAssignmentsParameters>,
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
                "Getting assignments"
                + moduleScope
                + " from "
                + breadth
            )
        };
    }
}
