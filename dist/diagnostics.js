"use strict";
exports.__esModule = true;
var vscode_1 = require("vscode");
var regexes = require("./regexes");
var oidnodes_1 = require("./oidnodes");
function diagnoseRange(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        match = /\((-?\d+)\.\.(-?\d+)\)/g.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        var startPosition = new vscode_1.Position(lineNumber, match.index);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        diagnoseSignedNumber(match[1], range, diagnostics);
        diagnoseSignedNumber(match[2], range, diagnostics);
        var lowerBoundary = Number(match[1]);
        var upperBoundary = Number(match[2]);
        // REVIEW: Any way I can assert(0) if either number is NaN?
        if (lowerBoundary > upperBoundary) {
            var diag = new vscode_1.Diagnostic(range, "Minimum boundary is greater than maximum boundary.", vscode_1.DiagnosticSeverity.Error);
            diagnostics.push(diag);
        }
        else if (lowerBoundary === upperBoundary) {
            var diag = new vscode_1.Diagnostic(range, "Minimum boundary is equal to the maximum boundary. A constant could be used instead.", vscode_1.DiagnosticSeverity.Warning);
            diagnostics.push(diag);
        }
    } while (i < line.length);
}
exports.diagnoseRange = diagnoseRange;
function diagnoseObjectIdentifier(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        match = /\b(OBJECT IDENTIFIER\s+::=\s+)\{([^\{\}]*)\}/g.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        var startPosition = new vscode_1.Position(lineNumber, match.index + match[1].length);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        var nodes = convertObjectIdentifierTokensToNodes(match[2], range, diagnostics);
        if (nodes.length < 2) {
            var diag = new vscode_1.Diagnostic(range, "An OBJECT IDENTIFIER may not be shorter than two nodes.", vscode_1.DiagnosticSeverity.Error);
            diagnostics.push(diag);
            break;
        }
        if (typeof nodes[0].numberForm !== "undefined") {
            if (nodes[0].numberForm > 2) {
                var diag = new vscode_1.Diagnostic(range, "First node of an OBJECT IDENTIFIER may not exceed 2.", vscode_1.DiagnosticSeverity.Error);
                diagnostics.push(diag);
            }
            else {
                if (typeof nodes[1].numberForm !== "undefined") {
                    switch (nodes[0].numberForm) {
                        case 0:
                        case 1: {
                            if (nodes[1].numberForm > 39) {
                                var diag = new vscode_1.Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 39 if the first node is 0 or 1.", vscode_1.DiagnosticSeverity.Error);
                                diagnostics.push(diag);
                            }
                            break;
                        }
                        case 2: {
                            if (nodes[1].numberForm > 175) {
                                var diag = new vscode_1.Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 175 if the first node is 2.", vscode_1.DiagnosticSeverity.Error);
                                diagnostics.push(diag);
                            }
                            break;
                        }
                        default: return; // REVIEW
                    }
                }
            }
        }
        else {
            if (!["itu-t", "ccitt", "itu-r", "iso", "joint-iso-itu-t", "joint-iso-ccitt"].includes(nodes[0].nameForm)) {
                var diag = new vscode_1.Diagnostic(range, "Invalid first OBJECT IDENTIFIER node: " + nodes[0].nameForm + ".", vscode_1.DiagnosticSeverity.Error);
                diagnostics.push(diag);
            }
            else {
                if (typeof nodes[1].numberForm !== "undefined") {
                    switch (nodes[0].nameForm) {
                        case "itu-t":
                        case "ccitt":
                        case "itu-r":
                        case "iso": {
                            if (nodes[1].numberForm > 39) {
                                var diag = new vscode_1.Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 39 if the first node is 0 or 1.", vscode_1.DiagnosticSeverity.Error);
                                diagnostics.push(diag);
                            }
                            break;
                        }
                        case "joint-iso-itu-t":
                        case "joint-iso-ccitt": {
                            if (nodes[1].numberForm > 175) {
                                var diag = new vscode_1.Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 175 if the first node is 2.", vscode_1.DiagnosticSeverity.Error);
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
exports.diagnoseObjectIdentifier = diagnoseObjectIdentifier;
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
function diagnoseBinaryStringLiterals(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        match = /'([^']+)'B\b/g.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        var innerMatch = /^[01\s]+$/g.exec(match[1]);
        if (innerMatch !== null)
            break;
        var startPosition = new vscode_1.Position(lineNumber, match.index);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        var diag = new vscode_1.Diagnostic(range, "Invalid binary string.", vscode_1.DiagnosticSeverity.Error);
        diagnostics.push(diag);
    } while (i < line.length);
}
exports.diagnoseBinaryStringLiterals = diagnoseBinaryStringLiterals;
function diagnoseHexadecimalStringLiterals(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        match = /'([^']+)'H\b/g.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        var innerMatch = /^[0-9A-F\s]+$/g.exec(match[1]);
        if (innerMatch !== null)
            break;
        var startPosition = new vscode_1.Position(lineNumber, match.index);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        var diag = new vscode_1.Diagnostic(range, "Invalid hexadecimal string.", vscode_1.DiagnosticSeverity.Error);
        diagnostics.push(diag);
    } while (i < line.length);
}
exports.diagnoseHexadecimalStringLiterals = diagnoseHexadecimalStringLiterals;
function diagnoseIntegerLiteral(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        // Leading \b omitted here, because '-' is not counted as a "word" in Regex.
        match = /(\s+)(\-?\d+)\b/g.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        var startPosition = new vscode_1.Position(lineNumber, match.index + match[1].length);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        diagnoseSignedNumber(match[2], range, diagnostics);
    } while (i < line.length);
}
exports.diagnoseIntegerLiteral = diagnoseIntegerLiteral;
function diagnoseMultipleContextSpecificTagsNextToEachOther(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        var matcher = new RegExp("(\\s+)((?:\\[\\d+\\]\\s+){2,})\\b");
        match = matcher.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        var startPosition = new vscode_1.Position(lineNumber, match.index + match[1].length);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        var diag = new vscode_1.Diagnostic(range, "Duplicated context-specific tags.", vscode_1.DiagnosticSeverity.Error);
        diagnostics.push(diag);
    } while (i < line.length);
}
exports.diagnoseMultipleContextSpecificTagsNextToEachOther = diagnoseMultipleContextSpecificTagsNextToEachOther;
function diagnoseUTCTime(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        match = /\b(UTCTime\s+::=\s+)"(.*)"/.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        var innerMatch = /^\d{2}((?:1[0-2])|(?:0\d))((?:3[01])|(?:[0-2]\d))((?:2[0-3])|(?:[01]\d))[0-5]\d(?:[0-5]\d)?(?:(?:(\+|\-)((?:2[0-3])|(?:[01]\d))[0-5]\d)|Z)$/g.exec(match[2]);
        if (innerMatch !== null)
            break;
        var startPosition = new vscode_1.Position(lineNumber, match.index + match[1].length);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        var diag = new vscode_1.Diagnostic(range, "Malformed UTCTime.", vscode_1.DiagnosticSeverity.Error);
        diagnostics.push(diag);
    } while (i < line.length);
}
exports.diagnoseUTCTime = diagnoseUTCTime;
function diagnoseGeneralizedTime(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        match = /\b(GeneralizedTime\s+::=\s+)"(.*)"/.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        var innerMatch = /^\d{4}((?:1[0-2])|(?:0\d))((?:3[01])|(?:[0-2]\d))((?:2[0-3])|(?:[01]\d))(?:[0-5]\d)?(?:[0-5]\d)?(?:(\.|,)(?:\d+))?(?:(?:(\+|\-)((?:2[0-3])|(?:[01]\d))[0-5]\d)|Z)?$/.exec(match[2]);
        if (innerMatch !== null)
            break;
        var startPosition = new vscode_1.Position(lineNumber, match.index + match[1].length);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        var diag = new vscode_1.Diagnostic(range, "Malformed GeneralizedTime.", vscode_1.DiagnosticSeverity.Error);
        diagnostics.push(diag);
    } while (i < line.length);
}
exports.diagnoseGeneralizedTime = diagnoseGeneralizedTime;
function diagnoseTwoContradictoryWordsNextToEachOther(word1, word2, line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        var matcher = new RegExp("\\b((?:" + word1 + "\\s+" + word2 + ")|(?:" + word2 + "\\s+" + word1 + "))\\b");
        match = matcher.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        var startPosition = new vscode_1.Position(lineNumber, match.index);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        var diag = new vscode_1.Diagnostic(range, "Contradictory " + word1 + " and " + word2 + ".", vscode_1.DiagnosticSeverity.Error);
        diagnostics.push(diag);
    } while (i < line.length);
}
exports.diagnoseTwoContradictoryWordsNextToEachOther = diagnoseTwoContradictoryWordsNextToEachOther;
function diagnoseTwoDuplicatedWordsNextToEachOther(word1, line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        var matcher = new RegExp("\\b" + word1 + "\\s+" + word1 + "\\b");
        match = matcher.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        var startPosition = new vscode_1.Position(lineNumber, match.index);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        var diag = new vscode_1.Diagnostic(range, "Duplicated " + word1 + ".", vscode_1.DiagnosticSeverity.Error);
        diagnostics.push(diag);
    } while (i < line.length);
}
exports.diagnoseTwoDuplicatedWordsNextToEachOther = diagnoseTwoDuplicatedWordsNextToEachOther;
function diagnoseNumber(numberString) {
    // const match : RegExpExecArray | null = /^(\-?\d+)$/.exec(numberString);
    // if (match === null) return -4; // Not actually a number.
    if (numberString.length > 1 && (numberString.slice(0, 2) === "-0" || numberString.charAt(0) === "0"))
        return -1; // Integer literal may not start with a leading 0 if it is not 0.
    var numberInQuestion = Number(numberString);
    if (numberInQuestion > 2147483647)
        return -2; // This number is too big to encode as a signed integer on 32-bits.
    else if (numberInQuestion < -2147483648)
        return -3; // This number is too negative to encode as a signed integer on 32-bits.
    return 0;
}
exports.diagnoseNumber = diagnoseNumber;
function diagnoseUnsignedNumber(numberString, range, diagnostics) {
    if (numberString.length === 0)
        return;
    if (numberString.charAt(0) === "-") {
        var diag = new vscode_1.Diagnostic(range, "Number may not be negative", vscode_1.DiagnosticSeverity.Error);
        diagnostics.push(diag);
    }
    if (numberString.length > 1 && numberString.charAt(0) === "0") {
        var diag = new vscode_1.Diagnostic(range, "Number may not start with a leading 0 if it is not 0.", vscode_1.DiagnosticSeverity.Error);
        diagnostics.push(diag);
    }
    var numberInQuestion = Number(numberString);
    if (numberInQuestion > 2147483647) {
        var diag = new vscode_1.Diagnostic(range, "Number is too big to encode as a signed integer on 32-bits.", vscode_1.DiagnosticSeverity.Warning);
        diagnostics.push(diag);
    }
}
exports.diagnoseUnsignedNumber = diagnoseUnsignedNumber;
function diagnoseSignedNumber(numberString, range, diagnostics) {
    if (numberString.length === 0)
        return;
    if (numberString.length > 1 && (numberString.slice(0, 2) === "-0" || numberString.charAt(0) === "0")) {
        var diag = new vscode_1.Diagnostic(range, "Number may not start with a leading 0 if it is not 0.", vscode_1.DiagnosticSeverity.Error);
        diagnostics.push(diag);
    }
    var numberInQuestion = Number(numberString);
    if (numberInQuestion > 2147483647) {
        var diag = new vscode_1.Diagnostic(range, "Number is too big to encode as a signed integer on 32-bits.", vscode_1.DiagnosticSeverity.Warning);
        diagnostics.push(diag);
    }
    else if (numberInQuestion < -2147483648) {
        var diag = new vscode_1.Diagnostic(range, "Number is too negative to encode as a signed integer on 32-bits.", vscode_1.DiagnosticSeverity.Warning);
        diagnostics.push(diag);
    }
}
exports.diagnoseSignedNumber = diagnoseSignedNumber;
// The OID string this receives should not contain "{" or "}"
// identifier, number, identifier(number), valuereference, modulereference.typereference
function convertObjectIdentifierTokensToNodes(objIdComponentList, range, diagnostics) {
    var tokens = objIdComponentList.replace(/\s*\(\s*(\d+)\s*\)/, "($1)").split(/\s+/g);
    var nodes = [];
    for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
        var token = tokens_1[_i];
        if (token === "")
            continue;
        if (regexes.number.test(token)) {
            diagnoseUnsignedNumber(token, range, diagnostics);
            nodes.push(new oidnodes_1.ObjectIdentifierNode(Number(token)));
        }
        else if (regexes.identifier.test(token)) {
            nodes.push(new oidnodes_1.ObjectIdentifierNode(undefined, token));
        }
        else if (token.split(".").length === 2) {
            var _a = token.split("."), moduleReference = _a[0], typeReference = _a[1];
            if (regexes.modulereference.test(moduleReference)) {
                var diag = new vscode_1.Diagnostic(range, "Malformed ModuleReference.", vscode_1.DiagnosticSeverity.Error);
                diagnostics.push(diag);
                return [];
            }
            if (regexes.typereference.test(typeReference)) {
                var diag = new vscode_1.Diagnostic(range, "Malformed TypeReference.", vscode_1.DiagnosticSeverity.Error);
                diagnostics.push(diag);
                return [];
            }
            nodes.push(new oidnodes_1.ObjectIdentifierNode(undefined, token));
        }
        else {
            var match = /^([a-z][A-Za-z0-9\-]*[A-Za-z0-9])\((\d+)\)$/g.exec(token);
            if (!match) {
                var diag = new vscode_1.Diagnostic(range, "Malformed OBJECT IDENTIFIER literal.", vscode_1.DiagnosticSeverity.Error);
                diagnostics.push(diag);
                return [];
            }
            diagnoseUnsignedNumber(match[2], range, diagnostics);
            nodes.push(new oidnodes_1.ObjectIdentifierNode(Number(match[2]), match[1]));
        }
    }
    ;
    return nodes;
}
//# sourceMappingURL=diagnostics.js.map