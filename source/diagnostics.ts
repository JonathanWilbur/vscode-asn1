import { Diagnostic, DiagnosticSeverity, Position, Range } from "vscode";
import * as regexes from "./regexes";
import { ObjectIdentifierNode as OIDNode } from "./oidnodes";

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
                        case 0:
                        case 1: {
                            if (nodes[1].numberForm > 39) {
                                const diag : Diagnostic = new Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 39 if the first node is 0 or 1.", DiagnosticSeverity.Error);
                                diagnostics.push(diag);
                            }
                            break;
                        }
                        case 2: {
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
                        case "itu-r": 
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

// export
// function diagnoseShortObjectIdentifier (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
//     let i : number = 0;
//     let match : RegExpExecArray | null;
//     do {
//         match = /\b(OBJECT IDENTIFIER\s+::=\s+)\{\s*(\d+\s*)?\}/g.exec(line.slice(i));
//         if (match === null) break;
//         i += (match.index + 1); // "+ match[0].length" does not work for some reason.
//         // REVIEW: Any way I can assert(0) if either number is NaN?
//         const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
//         const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
//         const range : Range = new Range(startPosition, endPosition);
//         const diag : Diagnostic = new Diagnostic(range, "An OBJECT IDENTIFIER must have at least two nodes.", DiagnosticSeverity.Error);
//         diagnostics.push(diag);
//     } while (i < line.length);
// }

// export
// function diagnoseCompleteObjectIdentifier (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
//     let i : number = 0;
//     let match : RegExpExecArray | null;
//     do {
//         match = /\b(OBJECT IDENTIFIER\s+::=\s+)\{\s+(\d+)\s+(\d+)(?:\s+(\d+))*\s+\}/g.exec(line.slice(i));
//         if (match === null) break;
//         i += (match.index + 1); // "+ match[0].length" does not work for some reason.
//         const firstNode : number = Number(match[2]);
//         const secondNode : number = Number(match[3]);
//         // REVIEW: Any way I can assert(0) if either number is NaN?
//         const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
//         const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
//         const range : Range = new Range(startPosition, endPosition);
//         if (firstNode > 2) {
//             const diag : Diagnostic = new Diagnostic(range, "First node of an OBJECT IDENTIFIER cannot be greater than 2.", DiagnosticSeverity.Error);
//             diagnostics.push(diag);
//         }
//         if (firstNode === 2 && secondNode > 175) {
//             const diag : Diagnostic = new Diagnostic(range, "Second node of an OBJECT IDENTIFIER cannot be greater than 175 if first node is 2.", DiagnosticSeverity.Error);
//             diagnostics.push(diag);
//         } else if (secondNode > 39) {
//             const diag : Diagnostic = new Diagnostic(range, "Second node of an OBJECT IDENTIFIER cannot be greater than 39 if first node is 0 or 1.", DiagnosticSeverity.Error);
//             diagnostics.push(diag);
//         }
//     } while (i < line.length);
// }

// export
// function diagnoseNegativeObjectIdentifier (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
//     let i : number = 0;
//     let match : RegExpExecArray | null;
//     do {
//         match = /\b(OBJECT IDENTIFIER\s+::=\s+)\{\s+(?:\d+\s+)*(?:-\d+\s+)+(?:\d+\s+)*\}/g.exec(line.slice(i));
//         if (match === null) break;
//         i += (match.index + 1); // "+ match[0].length" does not work for some reason.
//         const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
//         const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
//         const range : Range = new Range(startPosition, endPosition);
//         const diag : Diagnostic = new Diagnostic(range, "OBJECT IDENTIFIER node cannot be negative.", DiagnosticSeverity.Error);
//         diagnostics.push(diag);
//     } while (i < line.length);
// }

/* Why the stuff below is commented out:
    Looking at X.680, it looks like the Tag definition can be a lot more
    complicated than it often appears, which foils my plans for now.
*/

// export
// function diagnoseTag (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
//     let i : number = 0;
//     let match : RegExpExecArray | null;
//     do {
//         match = /\[\s*([A-Z]+)\s+(-?\d+)\s*\]/g.exec(line.slice(i));
//         if (match === null) break;
//         i += (match.index + 1); // "+ match[0].length" does not work for some reason.
//         const startPosition : Position = new Position(lineNumber, match.index);
//         const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
//         const range : Range = new Range(startPosition, endPosition);
//         if (["UNIVERSAL","APPLICATION","PRIVATE"].indexOf(match[1]) === -1) {
//             const diag : Diagnostic = new Diagnostic(range, "Tagging class must be UNIVERSAL, APPLICATION, or PRIVATE.", DiagnosticSeverity.Error);
//             diagnostics.push(diag);
//         }
//         if (Number(match[2]) < 0) {
//             const diag : Diagnostic = new Diagnostic(range, "Tag numbers may not be negative.", DiagnosticSeverity.Error);
//             diagnostics.push(diag);
//         }
//     } while (i < line.length);
// }

// export
// function diagnoseDuplicatedTag (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
//     let i : number = 0;
//     let match : RegExpExecArray | null;
//     do {
//         match = /\[\s*([A-Z]+)\s+(-?\d+)\s*\]/g.exec(line.slice(i));
//         if (match === null) break;
//         i += (match.index + 1); // "+ match[0].length" does not work for some reason.
//         const startPosition : Position = new Position(lineNumber, match.index);
//         const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
//         const range : Range = new Range(startPosition, endPosition);
//         if (["UNIVERSAL","APPLICATION","PRIVATE"].indexOf(match[1]) === -1) {
//             const diag : Diagnostic = new Diagnostic(range, "Tagging class must be UNIVERSAL, APPLICATION, or PRIVATE.", DiagnosticSeverity.Error);
//             diagnostics.push(diag);
//         }
//         if (Number(match[2]) < 0) {
//             const diag : Diagnostic = new Diagnostic(range, "Tag numbers may not be negative.", DiagnosticSeverity.Error);
//             diagnostics.push(diag);
//         }
//     } while (i < line.length);
// }

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
function diagnoseUTCTime (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        match = /\b(UTCTime\s+::=\s+)"(.*)"/.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        const innerMatch : RegExpExecArray | null = /^\d{2}((?:1[0-2])|(?:0\d))((?:3[01])|(?:[0-2]\d))((?:2[0-3])|(?:[01]\d))[0-5]\d(?:[0-5]\d)?(?:(?:(\+|\-)((?:2[0-3])|(?:[01]\d))[0-5]\d)|Z)$/g.exec(match[2]);
        if (innerMatch !== null) break;
        const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        const diag : Diagnostic = new Diagnostic(range, "Malformed UTCTime.", DiagnosticSeverity.Error);
        diagnostics.push(diag);
    } while (i < line.length);
}

export
function diagnoseGeneralizedTime (line : string, lineNumber : number, diagnostics : Diagnostic[]) : void {
    let i : number = 0;
    let match : RegExpExecArray | null;
    do {
        match = /\b(GeneralizedTime\s+::=\s+)"(.*)"/.exec(line.slice(i));
        if (match === null) break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        const innerMatch : RegExpExecArray | null = /^\d{4}((?:1[0-2])|(?:0\d))((?:3[01])|(?:[0-2]\d))((?:2[0-3])|(?:[01]\d))(?:[0-5]\d)?(?:[0-5]\d)?(?:(\.|,)(?:\d+))?(?:(?:(\+|\-)((?:2[0-3])|(?:[01]\d))[0-5]\d)|Z)?$/.exec(match[2]);
        if (innerMatch !== null) break;
        const startPosition : Position = new Position(lineNumber, match.index + match[1].length);
        const endPosition : Position = new Position(lineNumber, match.index + match[0].length);
        const range : Range = new Range(startPosition, endPosition);
        const diag : Diagnostic = new Diagnostic(range, "Malformed GeneralizedTime.", DiagnosticSeverity.Error);
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
function diagnoseNumber (numberString : string) : number {
    // const match : RegExpExecArray | null = /^(\-?\d+)$/.exec(numberString);
    // if (match === null) return -4; // Not actually a number.
    if (numberString.length > 1 && (numberString.slice(0, 2) === "-0" || numberString.charAt(0) === "0"))
        return -1; // Integer literal may not start with a leading 0 if it is not 0.
    const numberInQuestion : number = Number(numberString);
    if (numberInQuestion > 2147483647) return -2; // This number is too big to encode as a signed integer on 32-bits.
    else if (numberInQuestion < -2147483648) return -3; // This number is too negative to encode as a signed integer on 32-bits.
    return 0;
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