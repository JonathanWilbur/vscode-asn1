import * as vscode from "vscode";
import {
    type Production,
} from "@wildboar/asn1-parser";
import { getRangeFromLocation, isInECN, positionFallsWithin } from "./utils.js";
import { getParserOutputsWithLogging } from "./parsing.js";

function addParent(sr: vscode.SelectionRange, parent: vscode.SelectionRange): void {
    let curr = sr;
    while (curr.parent) {
        curr = curr.parent;
    }
    curr.parent = parent;
}

const productionsOfInterest: Set<string> = new Set([
    "Value",
    "XMLValue",
    "Type",
    "Object",
    "ObjectSet",
    "ValueSet",
    "ObjectClass",
    "ComponentType",
    "NamedType",
    "DefinitiveIdentification",
    "DefinitiveObjIdComponent",
    "SymbolsFromModule",
    "AssignedIdentifier",
    "NamedNumber",
    "NamedBit",
    "XMLObjIdComponent",
    "FirstArcIdentifier",
    "SubsequentArcIdentifier",
    "Quadruple",
    "Tuple",
    "CharsDefn",
    "Constraint",
    "TypeWithConstraint",
    "Elements",
    "EncodingControlSection",
    "EncodingControlSections",
    "FieldSpec",
    "WithSyntaxSpec",
    "FieldName",
    "AtNotation",
    "ComponentIdList",
    "Level",
    "ActualParameterList",
    "Exports",
    "Imports",
    "AssignmentList",
]);

function drillSelectionRangesForPosition(
    cancel: vscode.CancellationToken,
    document: vscode.TextDocument,
    position: vscode.Position,
    cstnode: Production,
    recursionTTL: number = 1000,
): vscode.SelectionRange | undefined {
    if (recursionTTL <= 0) {
        return undefined;
    }
    if (cstnode.children.length === 0) {
        // If we hit a terminal production, return it as a range.
        const range = getRangeFromLocation(document, cstnode.location);
        return new vscode.SelectionRange(range);
    }
    for (const child of cstnode.children) {
        if (cancel.isCancellationRequested) {
            break;
        }
        if (positionFallsWithin(document, position, child)) {
            const ret = drillSelectionRangesForPosition(
                cancel,
                document,
                position,
                child,
                recursionTTL - 1,
            );
            if (!ret) {
                return undefined;
            }
            const isChildNewRange = (
                child.type.startsWith("Defined")
                || child.type.startsWith("Parameterized")
                || child.type.endsWith("Assignment")
                || child.type.endsWith("FromObject")
                || child.type.endsWith("FromObjects")
                || productionsOfInterest.has(child.type)
            );
            if (!isChildNewRange) {
                return ret;
            }
            const childRange = getRangeFromLocation(document, child.location);
            if (childRange.isEqual(ret.range)) {
                return ret;
            }
            // I know, the variable naming is confusing:
            // The child CST node becomes the parent of what was
            // returned from a subordinate invocation.
            const parent = new vscode.SelectionRange(childRange);
            addParent(ret, parent);
            return ret;
        }
    }
    return undefined;
}

async function provideSelectionRanges(
    document: vscode.TextDocument, 
    positions: readonly vscode.Position[],
    token: vscode.CancellationToken,
): Promise<vscode.SelectionRange[]> {
    const p = await getParserOutputsWithLogging(document.uri, token);
    if (!p) {
        return [];
    }
    const modules = p.parsedModules;
    const ranges: vscode.SelectionRange[] = [];
    for (const position of positions) {
        if (token.isCancellationRequested) {
            break;
        }
        const currentModule = modules
            .find((mod) => (
                mod.production
                && positionFallsWithin(document, position, mod.production)
            ));
        if (!currentModule) {
            return []; // User isn't even within an ASN.1 module.
        }
        if (isInECN(document, currentModule, position)) {
            return []; // User is in an ECN section.
        }
        const range = drillSelectionRangesForPosition(
            token,
            document,
            position,
            currentModule.production!,
        );
        range && ranges.push(range);
    }
    return ranges;
}

export class Asn1SelectionRangeProvider implements vscode.SelectionRangeProvider {
    provideSelectionRanges(
        document: vscode.TextDocument, 
        positions: readonly vscode.Position[],
        token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.SelectionRange[]> {
        return provideSelectionRanges(document, positions, token);
    }
}
