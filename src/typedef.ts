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

/**
 * @summary Determine if an assignment is a type assignment or type like it
 * @param assntype The ASN.1 assignment type
 * @returns `true` if the assignment is "type-like" for type definition resolution
 * @function
 */
function isTypeLikeAssignment(assntype: AssignmentType): boolean {
    return (
        assntype === AssignmentType.TypeAssignment
        || assntype === AssignmentType.ObjectClassAssignment
        || assntype === AssignmentType.ValueSetTypeAssignment
    );
}

/**
 * @summary Provide a type definition for a given `Defined*` reference
 * @param cancel The cancellation token
 * @param def The `Defined*`, such as a `DefinedValue`
 * @param currentModule The current ASN.1 module
 * @param uri The current text document URI
 * @param objClassExpected Whether an object class assignment is expected
 * @returns A promise that resolves ot a definition as a `vscode.Definition`
 * @async
 * @function
 */
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

/**
 * @summary Provides type definitions for a given ASN.1 value or information object
 * @param document The text document within which to provide type definition resolution
 * @param position The cursor position within the document
 * @param cancel The cancellation token
 * @returns A promise resolving to a definition as a `vscode.Definition`
 * @async
 * @function
 */
async function provideTypeDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    cancel: vscode.CancellationToken,
): Promise<vscode.Definition> {
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

    // If the user clicks on the identifier of a value or object assignment,
    // go to the corresponding type.
    const wordRange = document.getWordRangeAtPosition(position);
    const wordText = wordRange && document.getText(wordRange);
    const assn = currentModule.assignments[wordText ?? "-"];
    if (
        assn?.production?.children[0]
        // Position falls within the identifier
        && positionFallsWithin(document, position, assn.production.children[0])
    ) {
        if (
            (assn.assignmentType === AssignmentType.ValueAssignment)
            || (assn.assignmentType === AssignmentType.ValueSetTypeAssignment)
        ) {
            const t = assn.type;
            if (t.typeType === TypeType.DefinedType) {
                const def = t.type;
                return typeDefFromDefinedThing(cancel, def, currentModule, document.uri, false);
            }
        } else if (
            (assn.assignmentType === AssignmentType.ObjectAssignment)
            || (assn.assignmentType === AssignmentType.ObjectSetAssignment)
        ) {
            const def = assn.definedObjectClass;
            return typeDefFromDefinedThing(cancel, def, currentModule, document.uri, true);
        }
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

    if (
        (assn1.assignmentType === AssignmentType.ObjectAssignment)
        || (assn1.assignmentType === AssignmentType.ObjectSetAssignment)
    ) {
        const def = assn1.definedObjectClass;
        return typeDefFromDefinedThing(cancel, def, mod1, uri1, true);
    }

    if (
        (assn1.assignmentType !== AssignmentType.ValueAssignment)
        && (assn1.assignmentType !== AssignmentType.ValueSetTypeAssignment)
    ) {
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
