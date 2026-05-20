import * as vscode from "vscode";
import {
    SelectionOption,
    type Production,
    type Location,
    type Module,
    type SymbolsFromModule,
    type Assignment,
    type NameAndOrNumber,
} from "@wildboar/asn1-parser";

export
function positionFallsWithin(
    document: vscode.TextDocument,
    position: vscode.Position,
    cstnode: Production,
): boolean {
    const nodeloc = cstnode.location;
    const start = document.positionAt(nodeloc.startIndex);
    const end = document.positionAt(nodeloc.endIndex);
    return (start.isBeforeOrEqual(position) && end.isAfterOrEqual(position));
}

export
function drillIntoDefinedInCST(
    document: vscode.TextDocument,
    position: vscode.Position,
    cstnode: Production,
    recursionTTL = 1000,
): Production | undefined {
    // TODO: Eliminate tail recursion
    if (recursionTTL <= 0) {
        return undefined;
    }
    // All productions that are a symbol referring to some other assignment
    // are "Defined," such as `DefinedValue`, `DefinedType`, etc.
    if (cstnode.type.startsWith('Defined')) {
        return cstnode;
    }
    for (const child of cstnode.children) {
        if (positionFallsWithin(document, position, child)) {
            return drillIntoDefinedInCST(
                document,
                position,
                child,
                recursionTTL - 1,
            );
        }
    }
    return undefined;
}

export function getRangeFromLocation(
    document: vscode.TextDocument,
    loc: Location,
): vscode.Range {
    const start = document.positionAt(loc.startIndex);
    const end = document.positionAt(loc.endIndex);
    return new vscode.Range(start, end);
}

export const builtinRootArcNamesToNumber: Map<string, number> = new Map([
    ["itu-t", 0],
    ["ccitt", 0],
    ["iso", 1],
    ["joint-iso-itu-t", 2],
    ["joint-iso-ccitt", 2],
]);

export
function getOidNodesFromModuleIdentifier(mid: NameAndOrNumber[]): number[] | null {
	if (!(mid.slice(1).every((m) => "number" in m))) {
		return null;
	}
	const first = mid[0];
	if ("number" in first) {
		return mid.map((m) => ("number" in m) ? m.number : -1);
	} else if ("name" in first) {
		const num = builtinRootArcNamesToNumber.get(first.name);
		if (typeof num === "undefined") {
			return null;
		}
		return [
			num,
			...mid.map((m) => ("number" in m) ? m.number : -1),
		];
	}
	return null;
}

// TODO: Test this.
export
function asn1ModuleMatch(
    modoid: number[],
    asserted: number[],
    selopt?: SelectionOption,
): boolean {
    if (selopt === SelectionOption.WITH_DESCENDANTS) {
        if (asserted.length > modoid.length) {
            return false;
        }
        return asserted.every((arc, i) => arc === modoid[i]);
    }
    // Otherwise the lengths must be the same
    if (asserted.length !== modoid.length) {
        return false;
    }
    const len = asserted.length;
    if (selopt === SelectionOption.WITH_SUCCESSORS) {
        return (
            asserted
                .slice(0, -1)
                .every((arc, i) => arc === modoid[i])
            && (modoid[len - 1] >= asserted[len - 1])
        );
    }
    return asserted.every((arc, i) => arc === modoid[i]);
}
