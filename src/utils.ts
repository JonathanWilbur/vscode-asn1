import * as vscode from "vscode";
import {
    SelectionOption,
    type Production,
    type Location,
    type NameAndOrNumber,
    builtinRootArcNamesToNumber,
    TypeType,
    type Module,
} from "@wildboar/asn1-parser";
import { log } from "./logging.js";
import type { ASN1ModuleName, ASN1Reference } from "./types.js";

// TODO: Move to @wildboar/asn1-parser
/**
 * Tokens that _could_ be an ASN.1 module name.
 */
export const moduleReferenceTokens: Set<string> = new Set([
    "objectclassreference",
    "modulereference",
    "typereference",
]);

export const typeTypesThatCouldBeAnything: Set<TypeType> = new Set([
    TypeType.AnyType,
    TypeType.DefinedType,
    TypeType.ObjectClassFieldType,
    TypeType.TypeFromObject,
    TypeType.SelectionType,
]);

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

// TODO: Use getDefinedThingAtPosition instead of this. (This will fix some failures with go-to-definition.)
export
function drillIntoDefinedInCST(
    cancel: vscode.CancellationToken,
    document: vscode.TextDocument,
    position: vscode.Position,
    cstnode: Production,
    recursionTTL: number = 1000,
    definedOnly: boolean = false,
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
    /* I think identifiers were supported because I also wanted to find
    matching assignments, imports, module identifiers, etc. when implementing
    Find All References. But, this feature is not desirable in other cases
    like providing hovers, because this will provide hovers over the
    identifiers that are assigned in an assignment, the field names in 
    information objects, the component names in `SET` and `SEQUENCE` types,
    and `CHOICE` alternative names. Hence, I added the `definedOnly` flag
    so this could be turned on or off as needed. */
    if (
        (cstnode.type === "identifier")
        || (cstnode.type === "typereference")
        || (cstnode.type === "objectclassreference")
    ) {
        return definedOnly ? undefined : cstnode;
    }
    for (const child of cstnode.children) {
        if (cancel.isCancellationRequested) {
            break;
        }
        if (positionFallsWithin(document, position, child)) {
            return drillIntoDefinedInCST(
                cancel,
                document,
                position,
                child,
                recursionTTL - 1,
                definedOnly,
            );
        }
    }
    return undefined;
}

export
function getDefinedThingAtPosition(
    cancel: vscode.CancellationToken,
    document: vscode.TextDocument,
    position: vscode.Position,
    cstnode: Production,
    recursionTTL = 1000,
    definedOnly: boolean = false,
): [ ASN1ModuleName | undefined, ASN1Reference, Production ] | undefined {
    const defined = drillIntoDefinedInCST(
        cancel,
        document,
        position,
        cstnode,
        recursionTTL,
        definedOnly,
    );
    if (!defined) {
        return undefined;
    }
    const text = document.getText();
    const definedText = text
        .slice(defined.location.startIndex, defined.location.endIndex);
    const parts = definedText.split(".");
    let identifier = parts.pop()?.trim();
    const moduleref = parts.pop()?.trim();
    if (!identifier || parts.pop()) {
        log.appendLine(`malformed defined text ${definedText}`);
        return undefined;
    }
    // Remove parameters (e.g. chained{read} becomes chained)
    const paramStart = identifier.indexOf("{");
    if (paramStart > -1) {
        identifier = identifier.slice(0, paramStart);
    }
    if (!/[A-Za-z0-9-]+/.test(identifier)) {
        return undefined;
    }
    if (moduleref && !/[A-Z0-9-]+/.test(moduleref)) {
        return undefined;
    }
    return [ moduleref, identifier, defined ];
}

export function getRangeFromLocation(
    document: vscode.TextDocument,
    loc: Location,
): vscode.Range {
    const start = document.positionAt(loc.startIndex);
    const end = document.positionAt(loc.endIndex);
    return new vscode.Range(start, end);
}

// TODO: Move to @wildboar/asn1-parser
export
function getOidNodesFromModuleIdentifier(mid: NameAndOrNumber[]): number[] | null {
	if (!(mid.slice(1).every((m) => "number" in m))) {
		return null;
	}
	const first = mid[0];
	if ("number" in first && (typeof first.number === "number")) {
		return mid.map((m) => ("number" in m) ? m.number : -1);
	} else if ("name" in first && (typeof first.name === "string")) {
		const num = builtinRootArcNamesToNumber.get(first.name);
		if (typeof num === "undefined") {
			return null;
		}
		return [
			num,
			...mid.slice(1).map((m) => ("number" in m) ? m.number : -1),
		];
	}
	return null;
}

// TODO: Test this.
// TODO: Move to @wildboar/asn1-parser
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

export
function startsWithCapitalLetter(s: string): boolean {
    return (s.slice(0, 1).toUpperCase() === s.slice(0, 1));
}

export
function inOpenSyntaxRegion (lineBeforeCursor: string) {
    return /(--|\/\*|"|')/.test(lineBeforeCursor);
    // const lineCommentIndex = lineBeforeCursor.indexOf("--");
    // if (lineCommentIndex > -1 || token.isCancellationRequested) {
    //     return []; // Assume that we are in a comment.
    // }
    // const blockCommentIndex = lineBeforeCursor.indexOf("/*");
    // if (blockCommentIndex > -1 || token.isCancellationRequested) {
    //     return []; // Assume that we are in a comment.
    // }
    // const doubleQuoteIndex = lineBeforeCursor.indexOf('"');
    // if (doubleQuoteIndex > -1 || token.isCancellationRequested) {
    //     return []; // Assume that we are in a string.
    // }
    // const singleQuoteIndex = lineBeforeCursor.indexOf("'");
    // if (singleQuoteIndex > -1 || token.isCancellationRequested) {
    //     return []; // Assume that we are in a string.
    // }
}

// TODO: Import from `@wildboar/asn1-parser` when next version is published.
export function isDefinedOrImported(mod: Module, ident: string): boolean {
    return (
        (ident in mod.assignments)
        || Object.values(mod.imports.modules).some((sfm) => ident in sfm.symbolList)
        || (ident === "TYPE-IDENTIFIER")
        || (ident === "ABSTRACT-SYNTAX")
    );
}

// TODO: Move to @wildboar/asn1-parser
export
function nameAndOrNumberToString(nn: NameAndOrNumber): string {
    if ("name" in nn && typeof nn.name === "string") {
        let ret: string = nn.name;
        if ("number" in nn) {
            ret += `(${nn.number})`;
        }
        return ret;
    } else if ("number" in nn) {
        return nn.number.toString();
    } else {
        return "?";
    }
}

// TODO: Move to @wildboar/asn1-parser
export
function nameAndOrNumberToIriString(nn: NameAndOrNumber): string {
    if (("name" in nn) && (typeof nn.name === "string") && nn.name.length) {
        return nn.name;
    } else if ("number" in nn) {
        return nn.number.toString();
    }
    return "?";
}
