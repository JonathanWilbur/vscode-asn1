import * as vscode from "vscode";
import {
    type Production,
    NonTerminalProductionType,
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

/**
 * The production types in the CST for which to produce a selection range.
 */
const productionsOfInterest: Set<NonTerminalProductionType> = new Set([
    NonTerminalProductionType.Value,
    NonTerminalProductionType.XMLValue,
    NonTerminalProductionType.Type,
    NonTerminalProductionType.Object,
    NonTerminalProductionType.ObjectSet,
    NonTerminalProductionType.ValueSet,
    NonTerminalProductionType.ObjectClass,
    NonTerminalProductionType.ComponentType,
    NonTerminalProductionType.NamedType,
    NonTerminalProductionType.DefinitiveIdentification,
    NonTerminalProductionType.DefinitiveObjIdComponent,
    NonTerminalProductionType.SymbolsFromModule,
    NonTerminalProductionType.AssignedIdentifier,
    NonTerminalProductionType.NamedNumber,
    NonTerminalProductionType.NamedBit,
    NonTerminalProductionType.XMLObjIdComponent,
    NonTerminalProductionType.FirstArcIdentifier,
    NonTerminalProductionType.SubsequentArcIdentifier,
    NonTerminalProductionType.Quadruple,
    NonTerminalProductionType.Tuple,
    NonTerminalProductionType.CharsDefn,
    NonTerminalProductionType.Constraint,
    NonTerminalProductionType.TypeWithConstraint,
    NonTerminalProductionType.Elements,
    NonTerminalProductionType.EncodingControlSection,
    NonTerminalProductionType.EncodingControlSections,
    NonTerminalProductionType.FieldSpec,
    NonTerminalProductionType.WithSyntaxSpec,
    NonTerminalProductionType.FieldName,
    NonTerminalProductionType.AtNotation,
    NonTerminalProductionType.ComponentIdList,
    NonTerminalProductionType.Level,
    NonTerminalProductionType.ActualParameterList,
    NonTerminalProductionType.Exports,
    NonTerminalProductionType.Imports,
    NonTerminalProductionType.AssignmentList,
]);

/**
 * @summary Return selection ranges for a given cursor position
 * @param cancel The cancellation token
 * @param document The text document
 * @param position The cursor position
 * @param cstnode The Concrete Syntax Tree (CST) node
 * @param recursionTTL The recursion Time-to-Live (TTL)
 * @returns A selection range as a `vscode.SelectionRange`, or `undefined` if
 *  recursion was exceeded or in other error cases.
 * @function
 */
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
                || productionsOfInterest.has(child.type as NonTerminalProductionType)
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
    // Somehow we got here, but none of the child CST nodes contained the position.
    return undefined;
}

/**
 * @summary Provide selection ranges for cursor positions in a document
 * @param document The current text document
 * @param positions The current cursor positions
 * @param token The cancellation token
 * @returns A promise that resolves to an array of selection ranges for each
 *  cursor position
 * @async
 * @function
 */
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
