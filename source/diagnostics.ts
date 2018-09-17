import { Diagnostic, DiagnosticSeverity, Position, Range } from "vscode";
import * as regexes from "./regexes";
import { ObjectIdentifierNode as OIDNode } from "./types/oidnode";
import { Enumeration } from "./types/enumerated";

export
function diagnoseBadString (needle : RegExp, errorMessage : string, line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        match = needle.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        const startPosition : Position = new Position(lineNumber, match.index);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        const diag : Diagnostic = new Diagnostic(range, errorMessage, DiagnosticSeverity.Error);
        diagnostics.push(diag);
    } while (i < line.length);
}

export
function diagnoseSize (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        match = /SIZE\s*\((-?\d+)\.\.(-?\d+)\)/g.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        const startPosition : Position = new Position(lineNumber, match.index);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        diagnoseUnsignedNumber(match[1], range, diagnostics);
        diagnoseUnsignedNumber(match[2], range, diagnostics);
        const lowerBoundary : number = Number(match[1]);
        const upperBoundary : number = Number(match[2]);
        // REVIEW: Any way I can assert(0) if either number is NaN?
        if (lowerBoundary > upperBoundary) {
            const diag : Diagnostic = new Diagnostic(range, "Minimum boundary is greater than maximum boundary.", DiagnosticSeverity.Error);
            diagnostics.push(diag);
        } else if (lowerBoundary === upperBoundary) {
            const diag : Diagnostic = new Diagnostic(range, "Minimum boundary is equal to the maximum boundary. A constant could be used instead.", DiagnosticSeverity.Warning);
            diagnostics.push(diag);
        }
    } while (i < line.length);
}

export
function diagnoseRange (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        match = /\((-?\d+)\.\.(-?\d+)\)/g.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        const startPosition : Position = new Position(lineNumber, match.index);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        diagnoseSignedNumber(match[1], range, diagnostics);
        diagnoseSignedNumber(match[2], range, diagnostics);
        const lowerBoundary : number = Number(match[1]);
        const upperBoundary : number = Number(match[2]);
        // REVIEW: Any way I can assert(0) if either number is NaN?
        if (lowerBoundary > upperBoundary) {
            const diag : Diagnostic = new Diagnostic(range, "Minimum boundary is greater than maximum boundary.", DiagnosticSeverity.Error);
            diagnostics.push(diag);
        } else if (lowerBoundary === upperBoundary) {
            const diag : Diagnostic = new Diagnostic(range, "Minimum boundary is equal to the maximum boundary. A constant could be used instead.", DiagnosticSeverity.Warning);
            diagnostics.push(diag);
        }
    } while (i < line.length);
}

export
function diagnoseObjectIdentifier (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        match = /\b(OBJECT IDENTIFIER\s+::=\s+)\{([^\{\}]*)\}/g.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        const nodes : OIDNode[] | null = convertObjectIdentifierTokensToNodes(match[2], range, diagnostics);
        if (!nodes) return;

        if (nodes.length < 2) {
            const diag : Diagnostic = new Diagnostic(range, "An OBJECT IDENTIFIER may not be shorter than two nodes.", DiagnosticSeverity.Error);
            diagnostics.push(diag);
            break;
        }

        if (typeof nodes[0].numberForm !== "undefined") {
            if (nodes[0].numberForm > 2) {
                const diag : Diagnostic = new Diagnostic(range, "First node of an OBJECT IDENTIFIER may not exceed 2.", DiagnosticSeverity.Error);
                diagnostics.push(diag);
            } else {
                if (typeof nodes[1].numberForm !== "undefined") {
                    switch (nodes[0].numberForm) {
                        case 0: {
                            if (
                                typeof nodes[0].nameForm !== "undefined" && 
                                !(["itu-t", "ccitt", "itu-r"].includes(nodes[0].nameForm))
                            ) {
                                const diag : Diagnostic = new Diagnostic(range, `${nodes[0].numberForm} is not the correct root arc for ${nodes[0].nameForm}.`, DiagnosticSeverity.Error);
                                diagnostics.push(diag);
                            }
                            if (nodes[1].numberForm > 39) {
                                const diag : Diagnostic = new Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 39 if the first node is 0.", DiagnosticSeverity.Error);
                                diagnostics.push(diag);
                            }
                            break;
                        }
                        case 1: {
                            if (
                                typeof nodes[0].nameForm !== "undefined" && 
                                !(["iso"].includes(nodes[0].nameForm))
                            ) {
                                const diag : Diagnostic = new Diagnostic(range, `${nodes[0].numberForm} is not the correct root arc for ${nodes[0].nameForm}.`, DiagnosticSeverity.Error);
                                diagnostics.push(diag);
                            }
                            if (nodes[1].numberForm > 39) {
                                const diag : Diagnostic = new Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 39 if the first node is 1.", DiagnosticSeverity.Error);
                                diagnostics.push(diag);
                            }
                            break;
                        }
                        case 2: {
                            if (
                                typeof nodes[0].nameForm !== "undefined" && 
                                !(["joint-iso-itu-t", "joint-iso-ccitt"].includes(nodes[0].nameForm))
                            ) {
                                const diag : Diagnostic = new Diagnostic(range, `${nodes[0].numberForm} is not the correct root arc for ${nodes[0].nameForm}.`, DiagnosticSeverity.Error);
                                diagnostics.push(diag);
                            }
                            if (nodes[1].numberForm > 175) {
                                const diag : Diagnostic = new Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 175 if the first node is 2.", DiagnosticSeverity.Error);
                                diagnostics.push(diag);
                            }
                            break;
                        }
                        default: return; // REVIEW
                    }
                }
            }
        } else {
            if (!["itu-t", "ccitt", "itu-r", "iso", "joint-iso-itu-t", "joint-iso-ccitt"].includes(nodes[0].nameForm)) {
                const diag : Diagnostic = new Diagnostic(range, `Invalid first OBJECT IDENTIFIER node: ${nodes[0].nameForm}.`, DiagnosticSeverity.Error);
                diagnostics.push(diag);
            } else {
                if (typeof nodes[1].numberForm !== "undefined") {
                    switch (nodes[0].nameForm) {
                        case "itu-t":
                        case "ccitt":
                        case "itu-r": {
                            if (nodes[1].numberForm > 39) {
                                const diag : Diagnostic = new Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 39 if the first node is 0 or 1.", DiagnosticSeverity.Error);
                                diagnostics.push(diag);
                            }
                            break;
                        }
                        case "iso": {
                            if (nodes[1].numberForm > 39) {
                                const diag : Diagnostic = new Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 39 if the first node is 0 or 1.", DiagnosticSeverity.Error);
                                diagnostics.push(diag);
                            }
                            break;
                        }
                        case "joint-iso-itu-t":
                        case "joint-iso-ccitt": {
                            if (nodes[1].numberForm > 175) {
                                const diag : Diagnostic = new Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 175 if the first node is 2.", DiagnosticSeverity.Error);
                                diagnostics.push(diag);
                            }
                            break;
                        }
                        default: return; // REVIEW
                    }
                }
            }
        }
    } while (i < line.length);
}

export
function diagnoseBinaryStringLiterals (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        match = /'([^']+)'B\b/g.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        const innerMatch : RegExpExecArray | null = /^[01\s]+$/g.exec(match[1]);
        if (innerMatch !== null) break;
        const startPosition : Position = new Position(lineNumber, match.index);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        const diag : Diagnostic = new Diagnostic(range, "Invalid binary string.", DiagnosticSeverity.Error);
        diagnostics.push(diag);
    } while (i < line.length);
}

export
function diagnoseHexadecimalStringLiterals (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        match = /'([^']+)'H\b/g.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        const innerMatch : RegExpExecArray | null = /^[0-9A-F\s]+$/g.exec(match[1]);
        if (innerMatch !== null) break;
        const startPosition : Position = new Position(lineNumber, match.index);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        const diag : Diagnostic = new Diagnostic(range, "Invalid hexadecimal string.", DiagnosticSeverity.Error);
        diagnostics.push(diag);
    } while (i < line.length);
}

export
function diagnoseMultipleContextSpecificTagsNextToEachOther (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        const matcher : RegExp = new RegExp(`(\\s+)((?:\\[\\d+\\]\\s+){2,})\\b`);
        match = matcher.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        const diag : Diagnostic = new Diagnostic(range, `Duplicated context-specific tags.`, DiagnosticSeverity.Error);
        diagnostics.push(diag);
    } while (i < line.length);
}

export
function diagnoseTwoContradictoryWordsNextToEachOther (word1 : string, word2: string, line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        const matcher : RegExp = new RegExp(`\\b((?:${word1}\\s+${word2})|(?:${word2}\\s+${word1}))\\b`);
        match = matcher.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        const startPosition : Position = new Position(lineNumber, match.index);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        const diag : Diagnostic = new Diagnostic(range, `Contradictory ${word1} and ${word2}.`, DiagnosticSeverity.Error);
        diagnostics.push(diag);
    } while (i < line.length);
}

export
function diagnoseTwoDuplicatedWordsNextToEachOther (word1 : string, line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        const matcher : RegExp = new RegExp(`\\b${word1}\\s+${word1}\\b`);
        match = matcher.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        const startPosition : Position = new Position(lineNumber, match.index);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        const diag : Diagnostic = new Diagnostic(range, `Duplicated ${word1}.`, DiagnosticSeverity.Error);
        diagnostics.push(diag);
    } while (i < line.length);
}

export
function diagnoseUnsignedNumber (numberString : string, range : Range, diagnostics : Diagnostic[]) : void {
    if (numberString.length === 0) return;
    if (numberString.charAt(0) === "-") {
        const diag : Diagnostic = new Diagnostic(range, "Number may not be negative", DiagnosticSeverity.Error);
        diagnostics.push(diag);
    }
    if (numberString.length > 1 && numberString.charAt(0) === "0") {
        const diag : Diagnostic = new Diagnostic(range, "Number may not start with a leading 0 if it is not 0.", DiagnosticSeverity.Error);
        diagnostics.push(diag);
    }
    const numberInQuestion : number = Number(numberString);
    if (numberInQuestion > 2147483647) {
        const diag : Diagnostic = new Diagnostic(range, "Number is too big to encode as a signed integer on 32-bits.", DiagnosticSeverity.Warning);
        diagnostics.push(diag);
    }
}

export
function diagnoseSignedNumber (numberString : string, range : Range, diagnostics : Diagnostic[]) : void {
    if (numberString.length === 0) return;
    if (numberString.length > 1 && (numberString.slice(0, 2) === "-0" || numberString.charAt(0) === "0")) {
        const diag : Diagnostic = new Diagnostic(range, "Number may not start with a leading 0 if it is not 0.", DiagnosticSeverity.Error);
        diagnostics.push(diag);
    }
    const numberInQuestion : number = Number(numberString);
    if (numberInQuestion > 2147483647) {
        const diag : Diagnostic = new Diagnostic(range, "Number is too big to encode as a signed integer on 32-bits.", DiagnosticSeverity.Warning);
        diagnostics.push(diag);
    } else if (numberInQuestion < -2147483648) {
        const diag : Diagnostic = new Diagnostic(range, "Number is too negative to encode as a signed integer on 32-bits.", DiagnosticSeverity.Warning);
        diagnostics.push(diag);
    }
}

// The OID string this receives should not contain "{" or "}"
// identifier, number, identifier(number), valuereference, modulereference.typereference
function convertObjectIdentifierTokensToNodes (objIdComponentList : string, range : Range, diagnostics : Diagnostic[]) : OIDNode[] | null {
    const tokens : string[] = objIdComponentList.replace(/\s*\(\s*(\d+)\s*\)/, "($1)").split(/\s+/g);
    let nodes : OIDNode[] = [];
    for (const token of tokens) {
        if (token === "") continue;
        if (regexes.number.test(token)) {
            diagnoseUnsignedNumber(token, range, diagnostics);
            nodes.push(new OIDNode(Number(token)));
        } else if (regexes.identifier.test(token)) {
            nodes.push(new OIDNode(undefined, token));
        } else if (token.split(".").length === 2) { 
            const [moduleReference, typeReference] = token.split(".");
            if (regexes.modulereference.test(moduleReference)) {
                const diag : Diagnostic = new Diagnostic(range, "Malformed ModuleReference.", DiagnosticSeverity.Error);
                diagnostics.push(diag);
                return null;
            }
            if (regexes.typereference.test(typeReference)) {
                const diag : Diagnostic = new Diagnostic(range, "Malformed TypeReference.", DiagnosticSeverity.Error);
                diagnostics.push(diag);
                return null;
            }
            nodes.push(new OIDNode(undefined, token));
        } else {
            const match : RegExpExecArray = /^([a-z][A-Za-z0-9\-]*[A-Za-z0-9])\((\d+)\)$/g.exec(token);
            if (!match) {
                const diag : Diagnostic = new Diagnostic(range, "Malformed OBJECT IDENTIFIER literal.", DiagnosticSeverity.Error);
                diagnostics.push(diag);
                return null;
            }
            diagnoseUnsignedNumber(match[2], range, diagnostics);
            nodes.push(new OIDNode(Number(match[2]), match[1]));
        }
    };
    return nodes;
}

export
function diagnoseTags (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        const matcher : RegExp = /\[\s*([A-Z][A-Za-z0-9\-]*[A-Za-z0-9]:\s+)?((UNIVERSAL|APPLICATION|PRIVATE)\s+)?([^\s\]]+)\s*\]/;
        match = matcher.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        const startPosition : Position = new Position(lineNumber, match.index);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        if (/^\-?\d+$/.test(match[(match.length - 1)]))
            diagnoseUnsignedNumber(match[(match.length - 1)], range, diagnostics);
    } while (i < line.length);
}

export
function diagnoseCharacterStringType (typeName : string, stringRegex : RegExp, line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    const matcher : RegExp = new RegExp(`\\b(${typeName}\\s+::=\\s+)"([^"]+)"`);
    do {
        match = matcher.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        if (!stringRegex.test(match[2])) {
            const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
            const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, `Invalid ${typeName}.`, DiagnosticSeverity.Error);
            diagnostics.push(diag);
        }
    } while (i < line.length);
}

export
function diagnoseIntegerLiteral (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        match = /\b(INTEGER\s+::=\s+)(\-?\d+)/.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        diagnoseSignedNumber(match[2], range, diagnostics);
    } while (i < line.length);
}

export
function diagnoseEnumerated (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        match = /\b(ENUMERATED\s+::=\s+)\{([^\{\}]*)\}/g.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        const enums : Enumeration[] | null = enumerate(match[2], range, diagnostics);
        if (!enums) {
            const diag : Diagnostic = new Diagnostic(range, "Malformed ENUMERATED.", DiagnosticSeverity.Error);
            diagnostics.push(diag);
        } else {
            // TODO: Validate that there are no duplicated numbers.
        }
    } while (i < line.length);
}

export
function enumerate (enumString : string, range : Range, diagnostics : Diagnostic[]) : Enumeration[] | null {
    const tokens : string[] = enumString.trim().replace(/\s*\(\s*(\d+)\s*\)/, "($1)").split(/\s*,\s*/g);
    let enums : Enumeration[] = [];
    for (const token of tokens) {
        if (token === "") continue;
        if (token.startsWith("...")) continue; // REVIEW: You could perform more validation here.
        let match : RegExpExecArray | null;
        match = /^([a-z][A-Za-z0-9\-]*[A-Za-z0-9])(?:\(([^\)+]+)\))?$/.exec(token);
        if (!match) return null;
        if (match[2]) {
            if (/^\-?\d+$/.exec(match[2]))
                diagnoseSignedNumber(match[2], range, diagnostics);
            enums.push(new Enumeration(match[1], Number(match[2])));
        } else {
            enums.push(new Enumeration(match[1]));
        }
    };
    return enums;
}

export
function diagnoseStructuredLabeledReal (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        match = /\b(REAL\s+::=\s+)\{\s*mantissa\s*(\-?\d+)\s*,\s*base\s*(\d+)\s*,\s*exponent\s*(\-?\d+)\s*\}/g.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        diagnoseSignedNumber(match[2], range, diagnostics);
        diagnoseUnsignedNumber(match[3], range, diagnostics);
        const base : number = Number(match[3]);
        if (base !== 2 && base !== 10) {
            const diag : Diagnostic = new Diagnostic(range, "Base must be 2 or 10.", DiagnosticSeverity.Error);
            diagnostics.push(diag);
        }
        diagnoseSignedNumber(match[4], range, diagnostics);
    } while (i < line.length);
}

export
function diagnoseStructuredUnlabeledReal (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        match = /\b(REAL\s+::=\s+)\{\s*(\-?\d+)\s*,\s*(\d+)\s*,\s*(\-?\d+)\s*\}/g.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        diagnoseSignedNumber(match[2], range, diagnostics);
        diagnoseUnsignedNumber(match[3], range, diagnostics);
        const base : number = Number(match[3]);
        if (base !== 2 && base !== 10) {
            const diag : Diagnostic = new Diagnostic(range, "Base must be 2 or 10.", DiagnosticSeverity.Error);
            diagnostics.push(diag);
        }
        diagnoseSignedNumber(match[4], range, diagnostics);
    } while (i < line.length);
}

export
function diagnoseBoolean (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        match = /\b(BOOLEAN\s+::=\s+)(\w+)/g.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        if (match[2] !== "TRUE" && match[2] !== "FALSE") {
            const diag : Diagnostic = new Diagnostic(range, "Invalid BOOLEAN. BOOLEAN must be TRUE or FALSE. (Case Sensitive)", DiagnosticSeverity.Error);
            diagnostics.push(diag);
        }
    } while (i < line.length);
}

export
function diagnoseBitString (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        match = /\b(BIT STRING\s+::=\s+)"([^"]+)"B/g.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        if (regexes.bstring.test(match[2])) {
            const diag : Diagnostic = new Diagnostic(range, "Invalid BIT STRING.", DiagnosticSeverity.Error);
            diagnostics.push(diag);
        }
    } while (i < line.length);
}

export
function diagnoseOctetString (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        match = /\b(OCTET STRING\s+::=\s+)"([^"]+)"H/g.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        if (regexes.hstring.test(match[2])) {
            const diag : Diagnostic = new Diagnostic(range, "Invalid OCTET STRING.", DiagnosticSeverity.Error);
            diagnostics.push(diag);
        }
    } while (i < line.length);
}

export
function diagnoseRelativeObjectIdentifier (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        match = /\b(RELATIVE-OID\s+::=\s+)\{([^\{\}]*)\}/g.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        const nodes : OIDNode[] | null = convertObjectIdentifierTokensToNodes(match[2], range, diagnostics);
        if (!nodes) return;
    } while (i < line.length);
}

export
function suggestGeneralizedTime (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    do {
        let indexOfMinMax : number = line.indexOf("UTCTime", i);
        if (indexOfMinMax !== -1) {
            const startPosition : Position = new Position(lineNumber, indexOfMinMax);
            const endPosition : Position = new Position(lineNumber, indexOfMinMax + "UTCTime".length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, "Consider using GeneralizedTime instead of UTCTime", DiagnosticSeverity.Hint);
            diagnostics.push(diag);
            i = (indexOfMinMax + 1);
        } else break;
    } while (i < line.length);
}

export
function findMinMax (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    do {
        let indexOfMinMax : number = line.indexOf("(MIN..MAX)", i);
        if (indexOfMinMax !== -1) {
            const startPosition : Position = new Position(lineNumber, indexOfMinMax);
            const endPosition : Position = new Position(lineNumber, indexOfMinMax + "(MIN..MAX)".length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, "(MIN..MAX) is unnecessary", DiagnosticSeverity.Warning);
            diagnostics.push(diag);
            i = (indexOfMinMax + 1);
        } else break;
    } while (i < line.length);
}

export
function findGeneralString (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    do {
        let index : number = line.indexOf("GeneralString", i);
        if (index !== -1) {
            const startPosition : Position = new Position(lineNumber, index);
            const endPosition : Position = new Position(lineNumber, index + "GeneralString".length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, "GeneralString is discouraged", DiagnosticSeverity.Warning);
            diagnostics.push(diag);
            i = (index + 1);
        } else break;
    } while (i < line.length);
}

export
function findGraphicString (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    do {
        let index : number = line.indexOf("GraphicString", i);
        if (index !== -1) {
            const startPosition : Position = new Position(lineNumber, index);
            const endPosition : Position = new Position(lineNumber, index + "GraphicString".length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, "GraphicString is discouraged", DiagnosticSeverity.Warning);
            diagnostics.push(diag);
            i = (index + 1);
        } else break;
    } while (i < line.length);
}

export
function findIntegerTooBigFor32Bits (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        // Leading \b omitted here, because '-' is not counted as a "word" in Regex.
        match = /(\s+)(\-?\d+)\b/g.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        const numberInQuestion : number = Number(match[2]);
        if (numberInQuestion > 2147483647) {
            const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
            const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, "This number is too big to encode as a signed integer on 32-bits.", DiagnosticSeverity.Warning);
            diagnostics.push(diag);
        } else if (numberInQuestion < -2147483648) {
            const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
            const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, "This number is too negative to encode as a signed integer on 32-bits.", DiagnosticSeverity.Warning);
            diagnostics.push(diag);
        }
    } while (i < line.length);
}