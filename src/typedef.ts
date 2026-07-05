import * as vscode from "vscode";
import { getDefinedThingAtPosition, getRangeFromLocation, positionFallsWithin } from "./utils.js";
import { getParserOutputsWithLogging } from "./parsing.js";
import { resolveDefined } from "./resolve.js";
import {
    AssignmentType,
    type Defined,
    TypeType,
    type Module,
} from "@wildboar/asn1-parser";

function isTypeLikeAssignment(assntype: AssignmentType): boolean {
    return (
        assntype === AssignmentType.TypeAssignment
        || assntype === AssignmentType.ObjectClassAssignment
        || assntype === AssignmentType.ValueSetTypeAssignment
    );
}

async function typeDefFromDefinedThing(
    cancel: vscode.CancellationToken,
    def: Defined,
    currentModule: Module,
    uri: vscode.Uri,
    objClassExpected: boolean,
): Promise<vscode.Definition> {
    const resolve2 = await resolveDefined(
        cancel,
        def.module,
        def.reference,
        currentModule,
        uri,
    );
    if (!resolve2) {
        return Promise.reject(null);
    }
    const [ assn2, , uri2 ] = resolve2;
    if (!assn2.production) {
        return Promise.reject(null);
    }
    if (objClassExpected) {
        if (assn2.assignmentType !== AssignmentType.ObjectClassAssignment) {
            return Promise.reject(null);
        }
    } else {
        if (
            (assn2.assignmentType !== AssignmentType.TypeAssignment)
            && (assn2.assignmentType !== AssignmentType.ValueSetTypeAssignment)
        ) {
            return Promise.reject(null);
        }
    }
    const doc2 = await vscode.workspace.openTextDocument(uri2);
    const range = getRangeFromLocation(doc2, assn2.production.location);
    return new vscode.Location(uri2, range);
}

async function provideTypeDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    cancel: vscode.CancellationToken,
): Promise<vscode.Definition | vscode.DefinitionLink[]> {
    const p = await getParserOutputsWithLogging(document.uri, cancel);
    if (!p) {
        return Promise.reject(null);
    }
    const modules = p.parsedModules;
    const cst = p.parserEndState.cst;
    const currentModule = modules
        .find((mod) => (
            mod.production
            && positionFallsWithin(document, position, mod.production)
        ));
    if (!currentModule) {
        // User selected a position that does not fall within a module
        return Promise.reject(null);
    }

    const defined = getDefinedThingAtPosition(cancel, document, position, cst, undefined, true);
    if (!defined) {
        return Promise.reject(null);
    }
    const [ modref, ident ] = defined;
    const resolve1 = await resolveDefined(
        cancel,
        modref,
        ident,
        currentModule,
        document.uri,
    );
    if (!resolve1) {
        return Promise.reject(null);
    }
    const [ assn1, mod1, uri1 ] = resolve1;

    // If the symbol refers directly to a type assignment or object class
    // assignment, return the location of that assignment.
    if (isTypeLikeAssignment(assn1.assignmentType)) {
        if (!assn1.production) {
            return Promise.reject(null);
        }
        const doc1 = await vscode.workspace.openTextDocument(uri1);
        const range = getRangeFromLocation(doc1, assn1.production.location);
        return new vscode.Location(uri1, range);
    }

    if (assn1.assignmentType === AssignmentType.ObjectAssignment) {
        const def = assn1.definedObjectClass;
        return typeDefFromDefinedThing(cancel, def, mod1, uri1, true);
    }

    if (assn1.assignmentType !== AssignmentType.ValueAssignment) {
        return Promise.reject(null);
    }

    const t = assn1.type;
    if (t.typeType === TypeType.DefinedType) {
        const def = t.type;
        return typeDefFromDefinedThing(cancel, def, mod1, uri1, false);
    }
    return Promise.reject(null);
}

export class Asn1TypeDefinitionProvider implements vscode.TypeDefinitionProvider {
    provideTypeDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.Definition | vscode.DefinitionLink[]> {
        return provideTypeDefinition(document, position, token);
    }
}
