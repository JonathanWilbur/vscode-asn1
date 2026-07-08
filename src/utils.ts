import * as vscode from "vscode";
import {
    type Production,
    type Location,
    type NameAndOrNumber,
    builtinRootArcNamesToNumber,
    TypeType,
    type Module,
} from "@wildboar/asn1-parser";
import { log } from "./logging.js";
import type { ASN1ModuleName, ASN1Reference } from "./types.js";

/**
 * Tokens that _could_ be an ASN.1 module name.
 */
export const moduleReferenceTokens: Set<string> = new Set([
    "objectclassreference",
    "modulereference",
    "typereference",
]);

/**
 * ASN.1 type types that could refer to any other type.
 */
export const typeTypesThatCouldBeAnything: Set<TypeType> = new Set([
    TypeType.AnyType,
    TypeType.DefinedType,
    TypeType.ObjectClassFieldType,
    TypeType.TypeFromObject,
    TypeType.SelectionType,
]);

/**
 * @summary Determine if a cursor position falls within a particular CST node
 * @param document The text document to which the position applies
 * @param position The position within the text document
 * @param cstnode The Concrete Syntax Tree (CST) node
 * @returns `true` if the position falls within the Concrete Syntax
 *  Tree Node, `cstnode`
 * @function
 */
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

/**
 * @summary Find a `Defined*` or other reference-like production within the CST at the position
 * @param cancel The cancellation token
 * @param document The current document
 * @param position The current cursor position
 * @param cstnode The Concrete Syntax Tree (CST) node
 * @param recursionTTL The recursion time-to-live (TTL)
 * @param definedOnly If `true`, only `Defined*` resolves, not `identifier`,
 *  `typereference` or other similar lexical production types.
 * @returns Another CST node, or `undefined` if no `Defined*` or other
 *  reference-like production could not be discerned at the given position.
 * @function
 */
export
function drillIntoDefinedInCST(
    cancel: vscode.CancellationToken,
    document: vscode.TextDocument,
    position: vscode.Position,
    cstnode: Production,
    recursionTTL: number = 1000,
    definedOnly: boolean = false,
): Production | undefined {
    if (recursionTTL <= 0) {
        return undefined;
    }
    // All productions that are a symbol referring to some other assignment
    // are "Defined," such as `DefinedValue`, `DefinedType`, etc.
    if (isDefinedThing(cstnode)) {
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

/**
 * @summary Get whatever `Defined*` can be found at the current `position`
 * @param cancel The cancellation token
 * @param document The current text document
 * @param position The position within the text document
 * @param cstnode The Concrete Syntax Tree (CST) node into which to recurse
 * @param recursionTTL The recursion time-to-live (TTL)
 * @param definedOnly If `true`, only `Defined*` resolves, not `identifier`,
 *  `typereference` or other similar lexical production types.
 * @returns `undefined` if there is no reference-like production at `position`,
 *  or a tuple of an ASN.1 module name (optional), identifier, and CST node
 *  otherwise.
 * @function
 */
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

/**
 * @summary Convert a CST node location to an equivalent VS Code range
 * @param document The current text document
 * @param loc The ASN.1 production location
 * @returns A `vscode.Range` derived from the CST node location
 * @function
 */
export function getRangeFromLocation(
    document: vscode.TextDocument,
    loc: Location,
): vscode.Range {
    const start = document.positionAt(loc.startIndex);
    const end = document.positionAt(loc.endIndex);
    return new vscode.Range(start, end);
}

/**
 * @summary Convert name-and-number arcs of an object identifier to just numbers
 * @param mid The module identifier
 * @returns The numbers of the object identifier as an array, or `null`
 *  if they could not be resolved from the given arcs.
 * @function
 */
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

/**
 * @summary Determine if a string `s` starts with an upper-cased letter
 * @param s A string
 * @returns `true` if the string starts with a capital letter
 * @function
 */
export
function startsWithCapitalLetter(s: string): boolean {
    return (s.slice(0, 1).toUpperCase() === s.slice(0, 1));
}

/**
 * @summary Determine if the cursor position probably falls within open-syntax
 * @description
 * 
 * Certain regions of ASN.1 text, such as in comments or strings, may contain
 * arbitrary or near-arbitrary text. This function checks the line of text
 * before the cursor for signs of being in one of these regions.
 * 
 * This is a sloppy heuristic. I don't have a good, fast algorithm for
 * determining if the user is within a block comment, other than by iterating
 * over all lexical tokens for a document and checking if the user falls within
 * them. This also does not bother to check if the line comment is closed off
 * by another `--` or if the quotations are closed off. This is used for low
 * sensitivity situations anyway.
 * 
 * TODO: _Maybe_ I could do a bisecting search for the user position within the
 * lexical token stream. This should be pretty fast.
 * 
 * @param lineBeforeCursor The line before the cursor
 * @returns `true` if the line before suggests the user is in an open-syntax
 *  region of the document
 * @function
 */
export
function inOpenSyntaxRegion (lineBeforeCursor: string): boolean {
    return /(--|\/\*|"|')/.test(lineBeforeCursor);
}

/**
 * @summary Convert a `NameAndOrNumber`, such as an OID arc, to a string
 * @description
 * 
 * This produces a string that looks like ASN.1 syntax for an OID arc,
 * such as `name(123)`, or `?` if no name or number is present.
 * 
 * @param nn The name and or number
 * @returns A string
 * @function
 */
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

/**
 * @summary Convert a `NameAndOrNumber`, such as an OID arc, to an IRI component string
 * @description
 * 
 * This produces a string that looks like ASN.1 syntax for an OID-IRI arc,
 * such as `name` or `123`, or `?` if no name or number is present.
 * 
 * These do **NOT** include the leading forward slash.
 * 
 * @param nn The name and or number
 * @returns A string
 * @function
 */
export
function nameAndOrNumberToIriString(nn: NameAndOrNumber): string {
    if (("name" in nn) && (typeof nn.name === "string") && nn.name.length) {
        return nn.name;
    } else if ("number" in nn) {
        return nn.number.toString();
    }
    return "?";
}

/**
 * @summary Get URIs of all ASN.1 files in the workspace
 * @description
 * 
 * This uses the user's configuration of what are file globs are considered
 * ASN.1 files, as configured by the `includeFiles` and `excludeFiles`
 * settings.
 * 
 * @returns A `Thenable` that resolves to file URIs for all ASN.1 files in the
 *  workspace.
 */
export function getAsn1Files(): Thenable<vscode.Uri[]> {
    const config = vscode.workspace.getConfiguration("asn1");
    const includeFiles = config.get<string>("includeFiles", "**/*.{asn,asn1}");
    // TODO: I think you should let this default to `undefined`, because I think VS code uses some built-in defaults.
    const excludeFiles = config.get<string>("excludeFiles", "**/{node_modules,dist,out,build,.git}/**");
    return vscode.workspace.findFiles(includeFiles, excludeFiles);
}

/**
 * @summary Determine if the cursor position falls within an Encoding Control Notation (ECN) section
 * @description
 * 
 * This is important because ECN has a basically open syntax. Anything can
 * appear anywhere, so some language features, like inline completions,
 * probably should not apply when a user is typing within an ECN section.
 * 
 * @param document A text document
 * @param currentModule The current module within the text document
 * @param position The cursor position within the document
 * @returns `true` if the cursor falls within the Encoding Control Notation
 *  (ECN) section of the ASN.1 module.
 * @function
 */
export function isInECN(
    document: vscode.TextDocument,
    currentModule: Module,
    position: vscode.Position,
): boolean {
    const ecnprod = currentModule.production!.children
        .find((child) => child.type === 'EncodingControlSections');
    if (!ecnprod) {
        return false;
    }
    return positionFallsWithin(document, position, ecnprod);
}

/**
 * @summary Determine if `cstnode` is a `Defined*` thing, such as a `DefinedValue`
 * @param cstnode The Concrete Syntax Tree (CST) node
 * @returns `true` if it is a `Defined*` thing, such as a `DefinedValue`
 * @function
 */
export function isDefinedThing(cstnode: Production) {
    return (
        cstnode.type.startsWith('Defined')
        && !cstnode.type.startsWith('DefinedSyntax')
    );
}
