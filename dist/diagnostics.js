"use strict";
exports.__esModule = true;
var vscode_1 = require("vscode");
var regexes = require("./regexes");
var oidnode_1 = require("types/oidnode");
var enumerated_1 = require("types/enumerated");
function diagnoseBadString(needle, errorMessage, line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        match = needle.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        var startPosition = new vscode_1.Position(lineNumber, match.index);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        var diag = new vscode_1.Diagnostic(range, errorMessage, vscode_1.DiagnosticSeverity.Error);
        diagnostics.push(diag);
    } while (i < line.length);
}
exports.diagnoseBadString = diagnoseBadString;
function diagnoseSize(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        match = /SIZE\s*\((-?\d+)\.\.(-?\d+)\)/g.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        var startPosition = new vscode_1.Position(lineNumber, match.index);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        diagnoseUnsignedNumber(match[1], range, diagnostics);
        diagnoseUnsignedNumber(match[2], range, diagnostics);
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
exports.diagnoseSize = diagnoseSize;
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
        if (!nodes)
            return;
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
                        case 0: {
                            if (typeof nodes[0].nameForm !== "undefined" &&
                                !(["itu-t", "ccitt", "itu-r"].includes(nodes[0].nameForm))) {
                                var diag = new vscode_1.Diagnostic(range, nodes[0].numberForm + " is not the correct root arc for " + nodes[0].nameForm + ".", vscode_1.DiagnosticSeverity.Error);
                                diagnostics.push(diag);
                            }
                            if (nodes[1].numberForm > 39) {
                                var diag = new vscode_1.Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 39 if the first node is 0.", vscode_1.DiagnosticSeverity.Error);
                                diagnostics.push(diag);
                            }
                            break;
                        }
                        case 1: {
                            if (typeof nodes[0].nameForm !== "undefined" &&
                                !(["iso"].includes(nodes[0].nameForm))) {
                                var diag = new vscode_1.Diagnostic(range, nodes[0].numberForm + " is not the correct root arc for " + nodes[0].nameForm + ".", vscode_1.DiagnosticSeverity.Error);
                                diagnostics.push(diag);
                            }
                            if (nodes[1].numberForm > 39) {
                                var diag = new vscode_1.Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 39 if the first node is 1.", vscode_1.DiagnosticSeverity.Error);
                                diagnostics.push(diag);
                            }
                            break;
                        }
                        case 2: {
                            if (typeof nodes[0].nameForm !== "undefined" &&
                                !(["joint-iso-itu-t", "joint-iso-ccitt"].includes(nodes[0].nameForm))) {
                                var diag = new vscode_1.Diagnostic(range, nodes[0].numberForm + " is not the correct root arc for " + nodes[0].nameForm + ".", vscode_1.DiagnosticSeverity.Error);
                                diagnostics.push(diag);
                            }
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
                        case "itu-r": {
                            if (nodes[1].numberForm > 39) {
                                var diag = new vscode_1.Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 39 if the first node is 0 or 1.", vscode_1.DiagnosticSeverity.Error);
                                diagnostics.push(diag);
                            }
                            break;
                        }
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
            nodes.push(new oidnode_1.ObjectIdentifierNode(Number(token)));
        }
        else if (regexes.identifier.test(token)) {
            nodes.push(new oidnode_1.ObjectIdentifierNode(undefined, token));
        }
        else if (token.split(".").length === 2) {
            var _a = token.split("."), moduleReference = _a[0], typeReference = _a[1];
            if (regexes.modulereference.test(moduleReference)) {
                var diag = new vscode_1.Diagnostic(range, "Malformed ModuleReference.", vscode_1.DiagnosticSeverity.Error);
                diagnostics.push(diag);
                return null;
            }
            if (regexes.typereference.test(typeReference)) {
                var diag = new vscode_1.Diagnostic(range, "Malformed TypeReference.", vscode_1.DiagnosticSeverity.Error);
                diagnostics.push(diag);
                return null;
            }
            nodes.push(new oidnode_1.ObjectIdentifierNode(undefined, token));
        }
        else {
            var match = /^([a-z][A-Za-z0-9\-]*[A-Za-z0-9])\((\d+)\)$/g.exec(token);
            if (!match) {
                var diag = new vscode_1.Diagnostic(range, "Malformed OBJECT IDENTIFIER literal.", vscode_1.DiagnosticSeverity.Error);
                diagnostics.push(diag);
                return null;
            }
            diagnoseUnsignedNumber(match[2], range, diagnostics);
            nodes.push(new oidnode_1.ObjectIdentifierNode(Number(match[2]), match[1]));
        }
    }
    ;
    return nodes;
}
function diagnoseTags(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        var matcher = /\[\s*([A-Z][A-Za-z0-9\-]*[A-Za-z0-9]:\s+)?((UNIVERSAL|APPLICATION|PRIVATE)\s+)?([^\s\]]+)\s*\]/;
        match = matcher.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        var startPosition = new vscode_1.Position(lineNumber, match.index);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        if (/^\-?\d+$/.test(match[(match.length - 1)]))
            diagnoseUnsignedNumber(match[(match.length - 1)], range, diagnostics);
    } while (i < line.length);
}
exports.diagnoseTags = diagnoseTags;
function diagnoseCharacterStringType(typeName, stringRegex, line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    var matcher = new RegExp("\\b(" + typeName + "\\s+::=\\s+)\"([^\"]+)\"");
    do {
        match = matcher.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        if (!stringRegex.test(match[2])) {
            var startPosition = new vscode_1.Position(lineNumber, match.index + match[1].length);
            var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var diag = new vscode_1.Diagnostic(range, "Invalid " + typeName + ".", vscode_1.DiagnosticSeverity.Error);
            diagnostics.push(diag);
        }
    } while (i < line.length);
}
exports.diagnoseCharacterStringType = diagnoseCharacterStringType;
function diagnoseIntegerLiteral(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        match = /\b(INTEGER\s+::=\s+)(\-?\d+)/.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        var startPosition = new vscode_1.Position(lineNumber, match.index + match[1].length);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        diagnoseSignedNumber(match[2], range, diagnostics);
    } while (i < line.length);
}
exports.diagnoseIntegerLiteral = diagnoseIntegerLiteral;
function diagnoseEnumerated(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        match = /\b(ENUMERATED\s+::=\s+)\{([^\{\}]*)\}/g.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        var startPosition = new vscode_1.Position(lineNumber, match.index + match[1].length);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        var enums = enumerate(match[2], range, diagnostics);
        if (!enums) {
            var diag = new vscode_1.Diagnostic(range, "Malformed ENUMERATED.", vscode_1.DiagnosticSeverity.Error);
            diagnostics.push(diag);
        }
        else {
            // TODO: Validate that there are no duplicated numbers.
        }
    } while (i < line.length);
}
exports.diagnoseEnumerated = diagnoseEnumerated;
function enumerate(enumString, range, diagnostics) {
    var tokens = enumString.trim().replace(/\s*\(\s*(\d+)\s*\)/, "($1)").split(/\s*,\s*/g);
    var enums = [];
    for (var _i = 0, tokens_2 = tokens; _i < tokens_2.length; _i++) {
        var token = tokens_2[_i];
        if (token === "")
            continue;
        if (token.startsWith("..."))
            continue; // REVIEW: You could perform more validation here.
        var match = void 0;
        match = /^([a-z][A-Za-z0-9\-]*[A-Za-z0-9])(?:\(([^\)+]+)\))?$/.exec(token);
        if (!match)
            return null;
        if (match[2]) {
            if (/^\-?\d+$/.exec(match[2]))
                diagnoseSignedNumber(match[2], range, diagnostics);
            enums.push(new enumerated_1.Enumeration(match[1], Number(match[2])));
        }
        else {
            enums.push(new enumerated_1.Enumeration(match[1]));
        }
    }
    ;
    return enums;
}
exports.enumerate = enumerate;
function diagnoseStructuredLabeledReal(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        match = /\b(REAL\s+::=\s+)\{\s*mantissa\s*(\-?\d+)\s*,\s*base\s*(\d+)\s*,\s*exponent\s*(\-?\d+)\s*\}/g.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        var startPosition = new vscode_1.Position(lineNumber, match.index + match[1].length);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        diagnoseSignedNumber(match[2], range, diagnostics);
        diagnoseUnsignedNumber(match[3], range, diagnostics);
        var base = Number(match[3]);
        if (base !== 2 && base !== 10) {
            var diag = new vscode_1.Diagnostic(range, "Base must be 2 or 10.", vscode_1.DiagnosticSeverity.Error);
            diagnostics.push(diag);
        }
        diagnoseSignedNumber(match[4], range, diagnostics);
    } while (i < line.length);
}
exports.diagnoseStructuredLabeledReal = diagnoseStructuredLabeledReal;
function diagnoseStructuredUnlabeledReal(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        match = /\b(REAL\s+::=\s+)\{\s*(\-?\d+)\s*,\s*(\d+)\s*,\s*(\-?\d+)\s*\}/g.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        var startPosition = new vscode_1.Position(lineNumber, match.index + match[1].length);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        diagnoseSignedNumber(match[2], range, diagnostics);
        diagnoseUnsignedNumber(match[3], range, diagnostics);
        var base = Number(match[3]);
        if (base !== 2 && base !== 10) {
            var diag = new vscode_1.Diagnostic(range, "Base must be 2 or 10.", vscode_1.DiagnosticSeverity.Error);
            diagnostics.push(diag);
        }
        diagnoseSignedNumber(match[4], range, diagnostics);
    } while (i < line.length);
}
exports.diagnoseStructuredUnlabeledReal = diagnoseStructuredUnlabeledReal;
function diagnoseBoolean(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        match = /\b(BOOLEAN\s+::=\s+)(\w+)/g.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        var startPosition = new vscode_1.Position(lineNumber, match.index + match[1].length);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        if (match[2] !== "TRUE" && match[2] !== "FALSE") {
            var diag = new vscode_1.Diagnostic(range, "Invalid BOOLEAN. BOOLEAN must be TRUE or FALSE. (Case Sensitive)", vscode_1.DiagnosticSeverity.Error);
            diagnostics.push(diag);
        }
    } while (i < line.length);
}
exports.diagnoseBoolean = diagnoseBoolean;
function diagnoseBitString(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        match = /\b(BIT STRING\s+::=\s+)"([^"]+)"B/g.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        var startPosition = new vscode_1.Position(lineNumber, match.index + match[1].length);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        if (regexes.bstring.test(match[2])) {
            var diag = new vscode_1.Diagnostic(range, "Invalid BIT STRING.", vscode_1.DiagnosticSeverity.Error);
            diagnostics.push(diag);
        }
    } while (i < line.length);
}
exports.diagnoseBitString = diagnoseBitString;
function diagnoseOctetString(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        match = /\b(OCTET STRING\s+::=\s+)"([^"]+)"H/g.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        var startPosition = new vscode_1.Position(lineNumber, match.index + match[1].length);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        if (regexes.hstring.test(match[2])) {
            var diag = new vscode_1.Diagnostic(range, "Invalid OCTET STRING.", vscode_1.DiagnosticSeverity.Error);
            diagnostics.push(diag);
        }
    } while (i < line.length);
}
exports.diagnoseOctetString = diagnoseOctetString;
function diagnoseRelativeObjectIdentifier(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        match = /\b(RELATIVE-OID\s+::=\s+)\{([^\{\}]*)\}/g.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        // REVIEW: Any way I can assert(0) if either number is NaN?
        var startPosition = new vscode_1.Position(lineNumber, match.index + match[1].length);
        var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
        var range = new vscode_1.Range(startPosition, endPosition);
        var nodes = convertObjectIdentifierTokensToNodes(match[2], range, diagnostics);
        if (!nodes)
            return;
    } while (i < line.length);
}
exports.diagnoseRelativeObjectIdentifier = diagnoseRelativeObjectIdentifier;
function suggestGeneralizedTime(line, lineNumber, diagnostics) {
    var i = 0;
    do {
        var indexOfMinMax = line.indexOf("UTCTime", i);
        if (indexOfMinMax !== -1) {
            var startPosition = new vscode_1.Position(lineNumber, indexOfMinMax);
            var endPosition = new vscode_1.Position(lineNumber, indexOfMinMax + "UTCTime".length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var diag = new vscode_1.Diagnostic(range, "Consider using GeneralizedTime instead of UTCTime", vscode_1.DiagnosticSeverity.Hint);
            diagnostics.push(diag);
            i = (indexOfMinMax + 1);
        }
        else
            break;
    } while (i < line.length);
}
exports.suggestGeneralizedTime = suggestGeneralizedTime;
function findMinMax(line, lineNumber, diagnostics) {
    var i = 0;
    do {
        var indexOfMinMax = line.indexOf("(MIN..MAX)", i);
        if (indexOfMinMax !== -1) {
            var startPosition = new vscode_1.Position(lineNumber, indexOfMinMax);
            var endPosition = new vscode_1.Position(lineNumber, indexOfMinMax + "(MIN..MAX)".length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var diag = new vscode_1.Diagnostic(range, "(MIN..MAX) is unnecessary", vscode_1.DiagnosticSeverity.Warning);
            diagnostics.push(diag);
            i = (indexOfMinMax + 1);
        }
        else
            break;
    } while (i < line.length);
}
exports.findMinMax = findMinMax;
function findGeneralString(line, lineNumber, diagnostics) {
    var i = 0;
    do {
        var index = line.indexOf("GeneralString", i);
        if (index !== -1) {
            var startPosition = new vscode_1.Position(lineNumber, index);
            var endPosition = new vscode_1.Position(lineNumber, index + "GeneralString".length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var diag = new vscode_1.Diagnostic(range, "GeneralString is discouraged", vscode_1.DiagnosticSeverity.Warning);
            diagnostics.push(diag);
            i = (index + 1);
        }
        else
            break;
    } while (i < line.length);
}
exports.findGeneralString = findGeneralString;
function findGraphicString(line, lineNumber, diagnostics) {
    var i = 0;
    do {
        var index = line.indexOf("GraphicString", i);
        if (index !== -1) {
            var startPosition = new vscode_1.Position(lineNumber, index);
            var endPosition = new vscode_1.Position(lineNumber, index + "GraphicString".length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var diag = new vscode_1.Diagnostic(range, "GraphicString is discouraged", vscode_1.DiagnosticSeverity.Warning);
            diagnostics.push(diag);
            i = (index + 1);
        }
        else
            break;
    } while (i < line.length);
}
exports.findGraphicString = findGraphicString;
function findIntegerTooBigFor32Bits(line, lineNumber, diagnostics) {
    var i = 0;
    var match;
    do {
        // Leading \b omitted here, because '-' is not counted as a "word" in Regex.
        match = /(\s+)(\-?\d+)\b/g.exec(line.slice(i));
        if (match === null)
            break;
        i += (match.index + 1); // "+ match[0].length" does not work for some reason.
        var numberInQuestion = Number(match[2]);
        if (numberInQuestion > 2147483647) {
            var startPosition = new vscode_1.Position(lineNumber, match.index + match[1].length);
            var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var diag = new vscode_1.Diagnostic(range, "This number is too big to encode as a signed integer on 32-bits.", vscode_1.DiagnosticSeverity.Warning);
            diagnostics.push(diag);
        }
        else if (numberInQuestion < -2147483648) {
            var startPosition = new vscode_1.Position(lineNumber, match.index + match[1].length);
            var endPosition = new vscode_1.Position(lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var diag = new vscode_1.Diagnostic(range, "This number is too negative to encode as a signed integer on 32-bits.", vscode_1.DiagnosticSeverity.Warning);
            diagnostics.push(diag);
        }
    } while (i < line.length);
}
exports.findIntegerTooBigFor32Bits = findIntegerTooBigFor32Bits;
//# sourceMappingURL=diagnostics.js.map