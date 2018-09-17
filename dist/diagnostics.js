"use strict";
exports.__esModule = true;
var vscode_1 = require("vscode");
var regexes = require("./regexes");
var oidnode_1 = require("./types/oidnode");
var enumerated_1 = require("./types/enumerated");
var keywords_1 = require("./keywords");
var LineDiagnosis = /** @class */ (function () {
    function LineDiagnosis(line, lineNumber, diagnostics) {
        this.line = line;
        this.lineNumber = lineNumber;
        this.diagnostics = [];
        this.diagnostics = diagnostics;
    }
    LineDiagnosis.prototype.diagnose = function () {
        var _this = this;
        // Bad Strings
        this.diagnoseBadString(/,\s*\}/g, "Trailing comma.");
        this.diagnoseBadString(/\{\s*,/g, "Leading comma.");
        this.diagnoseBadString(/\|\s*\)/g, "Trailing pipe.");
        this.diagnoseBadString(/\(\s*\|/g, "Leading pipe.");
        this.diagnoseBadString(/FROM\s*\(\s*"[^"]{2,}"\.\."[^"]*"\s*\)/g, "FROM constraint cannot use multi-character strings in range.");
        this.diagnoseBadString(/FROM\s*\(\s*"[^"]*"\.\."[^"]{2,}"\s*\)/g, "FROM constraint cannot use multi-character strings in range.");
        this.diagnoseBadString(/FROM\s*\(\s*""\.\."[^"]*"\s*\)/g, "FROM constraint cannot use empty strings in range.");
        this.diagnoseBadString(/FROM\s*\(\s*"[^"]*"\.\.""\s*\)/g, "FROM constraint cannot use empty strings in range.");
        // TODO: Find a more elegant way of doing this.
        this.suggestGeneralizedTime();
        this.findMinMax();
        this.findGeneralString();
        this.findGraphicString();
        this.diagnoseRange();
        this.diagnoseObjectIdentifier();
        // diag.diagnoseRequirementContradiction(line, lineNumber, diagnostics);
        // diag.diagnoseTaggingMode(line, lineNumber, diagnostics);
        this.diagnoseBinaryStringLiterals();
        this.diagnoseHexadecimalStringLiterals();
        this.diagnoseTags();
        this.diagnoseIntegerLiteral();
        this.diagnoseEnumerated();
        this.diagnoseStructuredLabeledReal();
        this.diagnoseStructuredUnlabeledReal();
        this.diagnoseBitString();
        this.diagnoseOctetString();
        this.diagnoseBoolean();
        this.diagnoseRelativeObjectIdentifier();
        // Contradictions
        this.diagnoseTwoContradictoryWordsNextToEachOther("APPLICATION", "UNIVERSAL");
        this.diagnoseTwoContradictoryWordsNextToEachOther("PRIVATE", "UNIVERSAL");
        this.diagnoseTwoContradictoryWordsNextToEachOther("APPLICATION", "PRIVATE");
        this.diagnoseTwoContradictoryWordsNextToEachOther("EXPLICIT", "IMPLICIT");
        this.diagnoseTwoContradictoryWordsNextToEachOther("OPTIONAL", "PRESENT");
        this.diagnoseTwoContradictoryWordsNextToEachOther("OPTIONAL", "ABSENT");
        this.diagnoseTwoContradictoryWordsNextToEachOther("PRESENT", "ABSENT");
        this.diagnoseTwoContradictoryWordsNextToEachOther("OPTIONAL", "DEFAULT");
        // String types
        this.diagnoseCharacterStringType("NumericString", /^[0-9\s]*$/);
        this.diagnoseCharacterStringType("PrintableString", /^[A-Za-z0-9 '\(\)\+,\-\.\/:=\?]*$/);
        this.diagnoseCharacterStringType("UTCTime", /^\d{2}((?:1[0-2])|(?:0\d))((?:3[01])|(?:[0-2]\d))((?:2[0-3])|(?:[01]\d))[0-5]\d(?:[0-5]\d)?(?:(?:(\+|\-)((?:2[0-3])|(?:[01]\d))[0-5]\d)|Z)$/);
        this.diagnoseCharacterStringType("GeneralizedTime", /^\d{4}((?:1[0-2])|(?:0\d))((?:3[01])|(?:[0-2]\d))((?:2[0-3])|(?:[01]\d))(?:[0-5]\d)?(?:[0-5]\d)?(?:(\.|,)(?:\d+))?(?:(?:(\+|\-)((?:2[0-3])|(?:[01]\d))[0-5]\d)|Z)?$/);
        // diag.diagnoseCharacterStringType("VisibleString", /^[A-Za-z0-9 '\(\)\+,\-\.\/:=\?]*$/, line, lineNumber, diagnostics);
        // Duplications
        keywords_1.keywords.forEach(function (keyword) {
            _this.diagnoseTwoDuplicatedWordsNextToEachOther(keyword);
        });
        this.diagnoseMultipleContextSpecificTagsNextToEachOther();
    };
    LineDiagnosis.prototype.diagnoseBadString = function (needle, errorMessage) {
        var i = 0;
        var match;
        do {
            match = needle.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            var startPosition = new vscode_1.Position(this.lineNumber, match.index);
            var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var diag = new vscode_1.Diagnostic(range, errorMessage, vscode_1.DiagnosticSeverity.Error);
            this.diagnostics.push(diag);
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.diagnoseSize = function () {
        var i = 0;
        var match;
        do {
            match = /SIZE\s*\((-?\d+)\.\.(-?\d+)\)/g.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            var startPosition = new vscode_1.Position(this.lineNumber, match.index);
            var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            this.diagnoseUnsignedNumber(match[1], range);
            this.diagnoseUnsignedNumber(match[2], range);
            var lowerBoundary = Number(match[1]);
            var upperBoundary = Number(match[2]);
            // REVIEW: Any way I can assert(0) if either number is NaN?
            if (lowerBoundary > upperBoundary) {
                var diag = new vscode_1.Diagnostic(range, "Minimum boundary is greater than maximum boundary.", vscode_1.DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
            }
            else if (lowerBoundary === upperBoundary) {
                var diag = new vscode_1.Diagnostic(range, "Minimum boundary is equal to the maximum boundary. A constant could be used instead.", vscode_1.DiagnosticSeverity.Warning);
                this.diagnostics.push(diag);
            }
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.diagnoseRange = function () {
        var i = 0;
        var match;
        do {
            match = /\((-?\d+)\.\.(-?\d+)\)/g.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            var startPosition = new vscode_1.Position(this.lineNumber, match.index);
            var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            this.diagnoseSignedNumber(match[1], range);
            this.diagnoseSignedNumber(match[2], range);
            var lowerBoundary = Number(match[1]);
            var upperBoundary = Number(match[2]);
            // REVIEW: Any way I can assert(0) if either number is NaN?
            if (lowerBoundary > upperBoundary) {
                var diag = new vscode_1.Diagnostic(range, "Minimum boundary is greater than maximum boundary.", vscode_1.DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
            }
            else if (lowerBoundary === upperBoundary) {
                var diag = new vscode_1.Diagnostic(range, "Minimum boundary is equal to the maximum boundary. A constant could be used instead.", vscode_1.DiagnosticSeverity.Warning);
                this.diagnostics.push(diag);
            }
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.diagnoseObjectIdentifier = function () {
        var i = 0;
        var match;
        do {
            match = /\b(OBJECT IDENTIFIER\s+::=\s+)\{([^\{\}]*)\}/g.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            var startPosition = new vscode_1.Position(this.lineNumber, match.index + match[1].length);
            var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var nodes = this.convertObjectIdentifierTokensToNodes(match[2], range);
            if (!nodes)
                return;
            if (nodes.length < 2) {
                var diag = new vscode_1.Diagnostic(range, "An OBJECT IDENTIFIER may not be shorter than two nodes.", vscode_1.DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
                break;
            }
            if (typeof nodes[0].numberForm !== "undefined") {
                if (nodes[0].numberForm > 2) {
                    var diag = new vscode_1.Diagnostic(range, "First node of an OBJECT IDENTIFIER may not exceed 2.", vscode_1.DiagnosticSeverity.Error);
                    this.diagnostics.push(diag);
                }
                else {
                    if (typeof nodes[1].numberForm !== "undefined") {
                        switch (nodes[0].numberForm) {
                            case 0: {
                                if (typeof nodes[0].nameForm !== "undefined" &&
                                    !(["itu-t", "ccitt", "itu-r"].includes(nodes[0].nameForm))) {
                                    var diag = new vscode_1.Diagnostic(range, nodes[0].numberForm + " is not the correct root arc for " + nodes[0].nameForm + ".", vscode_1.DiagnosticSeverity.Error);
                                    this.diagnostics.push(diag);
                                }
                                if (nodes[1].numberForm > 39) {
                                    var diag = new vscode_1.Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 39 if the first node is 0.", vscode_1.DiagnosticSeverity.Error);
                                    this.diagnostics.push(diag);
                                }
                                break;
                            }
                            case 1: {
                                if (typeof nodes[0].nameForm !== "undefined" &&
                                    !(["iso"].includes(nodes[0].nameForm))) {
                                    var diag = new vscode_1.Diagnostic(range, nodes[0].numberForm + " is not the correct root arc for " + nodes[0].nameForm + ".", vscode_1.DiagnosticSeverity.Error);
                                    this.diagnostics.push(diag);
                                }
                                if (nodes[1].numberForm > 39) {
                                    var diag = new vscode_1.Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 39 if the first node is 1.", vscode_1.DiagnosticSeverity.Error);
                                    this.diagnostics.push(diag);
                                }
                                break;
                            }
                            case 2: {
                                if (typeof nodes[0].nameForm !== "undefined" &&
                                    !(["joint-iso-itu-t", "joint-iso-ccitt"].includes(nodes[0].nameForm))) {
                                    var diag = new vscode_1.Diagnostic(range, nodes[0].numberForm + " is not the correct root arc for " + nodes[0].nameForm + ".", vscode_1.DiagnosticSeverity.Error);
                                    this.diagnostics.push(diag);
                                }
                                if (nodes[1].numberForm > 175) {
                                    var diag = new vscode_1.Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 175 if the first node is 2.", vscode_1.DiagnosticSeverity.Error);
                                    this.diagnostics.push(diag);
                                }
                                break;
                            }
                            default: return; // REVIEW
                        }
                    }
                }
            }
            else {
                // if (!["itu-t", "ccitt", "itu-r", "iso", "joint-iso-itu-t", "joint-iso-ccitt"].includes(nodes[0].nameForm)) {
                //     const diag : Diagnostic = new Diagnostic(range, `Invalid first OBJECT IDENTIFIER node: ${nodes[0].nameForm}.`, DiagnosticSeverity.Error);
                //     this.diagnostics.push(diag);
                // } else {
                //     if (typeof nodes[1].numberForm !== "undefined") {
                //         switch (nodes[0].nameForm) {
                //             case "itu-t":
                //             case "ccitt":
                //             case "itu-r": {
                //                 if (nodes[1].numberForm > 39) {
                //                     const diag : Diagnostic = new Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 39 if the first node is 0 or 1.", DiagnosticSeverity.Error);
                //                     this.diagnostics.push(diag);
                //                 }
                //                 break;
                //             }
                //             case "iso": {
                //                 if (nodes[1].numberForm > 39) {
                //                     const diag : Diagnostic = new Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 39 if the first node is 0 or 1.", DiagnosticSeverity.Error);
                //                     this.diagnostics.push(diag);
                //                 }
                //                 break;
                //             }
                //             case "joint-iso-itu-t":
                //             case "joint-iso-ccitt": {
                //                 if (nodes[1].numberForm > 175) {
                //                     const diag : Diagnostic = new Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 175 if the first node is 2.", DiagnosticSeverity.Error);
                //                     this.diagnostics.push(diag);
                //                 }
                //                 break;
                //             }
                //             default: return; // REVIEW
                //         }
                //     }
                // }
            }
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.diagnoseBinaryStringLiterals = function () {
        var i = 0;
        var match;
        do {
            match = /'([^']+)'B\b/g.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            var innerMatch = /^[01\s]+$/g.exec(match[1]);
            if (innerMatch !== null)
                break;
            var startPosition = new vscode_1.Position(this.lineNumber, match.index);
            var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var diag = new vscode_1.Diagnostic(range, "Invalid binary string.", vscode_1.DiagnosticSeverity.Error);
            this.diagnostics.push(diag);
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.diagnoseHexadecimalStringLiterals = function () {
        var i = 0;
        var match;
        do {
            match = /'([^']+)'H\b/g.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            var innerMatch = /^[0-9A-F\s]+$/g.exec(match[1]);
            if (innerMatch !== null)
                break;
            var startPosition = new vscode_1.Position(this.lineNumber, match.index);
            var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var diag = new vscode_1.Diagnostic(range, "Invalid hexadecimal string.", vscode_1.DiagnosticSeverity.Error);
            this.diagnostics.push(diag);
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.diagnoseMultipleContextSpecificTagsNextToEachOther = function () {
        var i = 0;
        var match;
        do {
            var matcher = new RegExp("(\\s+)((?:\\[\\d+\\]\\s+){2,})\\b");
            match = matcher.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            var startPosition = new vscode_1.Position(this.lineNumber, match.index + match[1].length);
            var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var diag = new vscode_1.Diagnostic(range, "Duplicated context-specific tags.", vscode_1.DiagnosticSeverity.Error);
            this.diagnostics.push(diag);
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.diagnoseTwoContradictoryWordsNextToEachOther = function (word1, word2) {
        var i = 0;
        var match;
        do {
            var matcher = new RegExp("\\b((?:" + word1 + "\\s+" + word2 + ")|(?:" + word2 + "\\s+" + word1 + "))\\b");
            match = matcher.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            var startPosition = new vscode_1.Position(this.lineNumber, match.index);
            var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var diag = new vscode_1.Diagnostic(range, "Contradictory " + word1 + " and " + word2 + ".", vscode_1.DiagnosticSeverity.Error);
            this.diagnostics.push(diag);
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.diagnoseTwoDuplicatedWordsNextToEachOther = function (word1) {
        var i = 0;
        var match;
        do {
            var matcher = new RegExp("\\b" + word1 + "\\s+" + word1 + "\\b");
            match = matcher.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            var startPosition = new vscode_1.Position(this.lineNumber, match.index);
            var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var diag = new vscode_1.Diagnostic(range, "Duplicated " + word1 + ".", vscode_1.DiagnosticSeverity.Error);
            this.diagnostics.push(diag);
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.diagnoseUnsignedNumber = function (numberString, range) {
        if (numberString.length === 0)
            return;
        if (numberString.charAt(0) === "-") {
            var diag = new vscode_1.Diagnostic(range, "Number may not be negative", vscode_1.DiagnosticSeverity.Error);
            this.diagnostics.push(diag);
        }
        if (numberString.length > 1 && numberString.charAt(0) === "0") {
            var diag = new vscode_1.Diagnostic(range, "Number may not start with a leading 0 if it is not 0.", vscode_1.DiagnosticSeverity.Error);
            this.diagnostics.push(diag);
        }
        var numberInQuestion = Number(numberString);
        if (numberInQuestion > 2147483647) {
            var diag = new vscode_1.Diagnostic(range, "Number is too big to encode as a signed integer on 32-bits.", vscode_1.DiagnosticSeverity.Warning);
            this.diagnostics.push(diag);
        }
    };
    LineDiagnosis.prototype.diagnoseSignedNumber = function (numberString, range) {
        if (numberString.length === 0)
            return;
        if (numberString.length > 1 && (numberString.slice(0, 2) === "-0" || numberString.charAt(0) === "0")) {
            var diag = new vscode_1.Diagnostic(range, "Number may not start with a leading 0 if it is not 0.", vscode_1.DiagnosticSeverity.Error);
            this.diagnostics.push(diag);
        }
        var numberInQuestion = Number(numberString);
        if (numberInQuestion > 2147483647) {
            var diag = new vscode_1.Diagnostic(range, "Number is too big to encode as a signed integer on 32-bits.", vscode_1.DiagnosticSeverity.Warning);
            this.diagnostics.push(diag);
        }
        else if (numberInQuestion < -2147483648) {
            var diag = new vscode_1.Diagnostic(range, "Number is too negative to encode as a signed integer on 32-bits.", vscode_1.DiagnosticSeverity.Warning);
            this.diagnostics.push(diag);
        }
    };
    // The OID string this receives should not contain "{" or "}"
    // identifier, number, identifier(number), valuereference, modulereference.typereference
    LineDiagnosis.prototype.convertObjectIdentifierTokensToNodes = function (objIdComponentList, range) {
        var tokens = objIdComponentList.replace(/\s*\(\s*(\d+)\s*\)/, "($1)").split(/\s+/g);
        var nodes = [];
        for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
            var token = tokens_1[_i];
            if (token === "")
                continue;
            if (regexes.number.test(token)) {
                this.diagnoseUnsignedNumber(token, range);
                nodes.push(new oidnode_1.ObjectIdentifierNode(Number(token)));
            }
            else if (regexes.identifier.test(token)) {
                nodes.push(new oidnode_1.ObjectIdentifierNode(undefined, token));
            }
            else if (token.split(".").length === 2) {
                var _a = token.split("."), moduleReference = _a[0], typeReference = _a[1];
                if (regexes.modulereference.test(moduleReference)) {
                    var diag = new vscode_1.Diagnostic(range, "Malformed ModuleReference.", vscode_1.DiagnosticSeverity.Error);
                    this.diagnostics.push(diag);
                    return null;
                }
                if (regexes.typereference.test(typeReference)) {
                    var diag = new vscode_1.Diagnostic(range, "Malformed TypeReference.", vscode_1.DiagnosticSeverity.Error);
                    this.diagnostics.push(diag);
                    return null;
                }
                nodes.push(new oidnode_1.ObjectIdentifierNode(undefined, token));
            }
            else {
                var match = /^([a-z][A-Za-z0-9\-]*[A-Za-z0-9])\((\d+)\)$/g.exec(token);
                if (!match) {
                    var diag = new vscode_1.Diagnostic(range, "Malformed OBJECT IDENTIFIER literal.", vscode_1.DiagnosticSeverity.Error);
                    this.diagnostics.push(diag);
                    return null;
                }
                this.diagnoseUnsignedNumber(match[2], range);
                nodes.push(new oidnode_1.ObjectIdentifierNode(Number(match[2]), match[1]));
            }
        }
        ;
        return nodes;
    };
    LineDiagnosis.prototype.diagnoseTags = function () {
        var i = 0;
        var match;
        do {
            var matcher = /\[\s*([A-Z][A-Za-z0-9\-]*[A-Za-z0-9]:\s+)?((UNIVERSAL|APPLICATION|PRIVATE)\s+)?([^\s\]]+)\s*\]/;
            match = matcher.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            var startPosition = new vscode_1.Position(this.lineNumber, match.index);
            var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            if (/^\-?\d+$/.test(match[(match.length - 1)]))
                this.diagnoseUnsignedNumber(match[(match.length - 1)], range);
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.diagnoseCharacterStringType = function (typeName, stringRegex) {
        var i = 0;
        var match;
        var matcher = new RegExp("\\b(" + typeName + "\\s+::=\\s+)\"([^\"]+)\"");
        do {
            match = matcher.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            if (!stringRegex.test(match[2])) {
                var startPosition = new vscode_1.Position(this.lineNumber, match.index + match[1].length);
                var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
                var range = new vscode_1.Range(startPosition, endPosition);
                var diag = new vscode_1.Diagnostic(range, "Invalid " + typeName + ".", vscode_1.DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
            }
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.diagnoseIntegerLiteral = function () {
        var i = 0;
        var match;
        do {
            match = /\b(INTEGER\s+::=\s+)(\-?\d+)/.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            var startPosition = new vscode_1.Position(this.lineNumber, match.index + match[1].length);
            var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            this.diagnoseSignedNumber(match[2], range);
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.diagnoseEnumerated = function () {
        var i = 0;
        var match;
        do {
            match = /\b(ENUMERATED\s+::=\s+)\{([^\{\}]*)\}/g.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            var startPosition = new vscode_1.Position(this.lineNumber, match.index + match[1].length);
            var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var enums = this.enumerate(match[2], range);
            if (!enums) {
                var diag = new vscode_1.Diagnostic(range, "Malformed ENUMERATED.", vscode_1.DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
            }
            else {
                // TODO: Validate that there are no duplicated numbers.
                // REVIEW: Actually, _do_ they have to be unique?
            }
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.enumerate = function (enumString, range) {
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
                    this.diagnoseSignedNumber(match[2], range);
                enums.push(new enumerated_1.Enumeration(match[1], Number(match[2])));
            }
            else {
                enums.push(new enumerated_1.Enumeration(match[1]));
            }
        }
        ;
        return enums;
    };
    LineDiagnosis.prototype.diagnoseStructuredLabeledReal = function () {
        var i = 0;
        var match;
        do {
            match = /\b(REAL\s+::=\s+)\{\s*mantissa\s*(\-?\d+)\s*,\s*base\s*(\d+)\s*,\s*exponent\s*(\-?\d+)\s*\}/g.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            var startPosition = new vscode_1.Position(this.lineNumber, match.index + match[1].length);
            var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            this.diagnoseSignedNumber(match[2], range);
            this.diagnoseUnsignedNumber(match[3], range);
            var base = Number(match[3]);
            if (base !== 2 && base !== 10) {
                var diag = new vscode_1.Diagnostic(range, "Base must be 2 or 10.", vscode_1.DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
            }
            this.diagnoseSignedNumber(match[4], range);
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.diagnoseStructuredUnlabeledReal = function () {
        var i = 0;
        var match;
        do {
            match = /\b(REAL\s+::=\s+)\{\s*(\-?\d+)\s*,\s*(\d+)\s*,\s*(\-?\d+)\s*\}/g.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            var startPosition = new vscode_1.Position(this.lineNumber, match.index + match[1].length);
            var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            this.diagnoseSignedNumber(match[2], range);
            this.diagnoseUnsignedNumber(match[3], range);
            var base = Number(match[3]);
            if (base !== 2 && base !== 10) {
                var diag = new vscode_1.Diagnostic(range, "Base must be 2 or 10.", vscode_1.DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
            }
            this.diagnoseSignedNumber(match[4], range);
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.diagnoseBoolean = function () {
        var i = 0;
        var match;
        do {
            match = /\b(BOOLEAN\s+::=\s+)(\w+)/g.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            var startPosition = new vscode_1.Position(this.lineNumber, match.index + match[1].length);
            var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            if (match[2] !== "TRUE" && match[2] !== "FALSE") {
                var diag = new vscode_1.Diagnostic(range, "Invalid BOOLEAN. BOOLEAN must be TRUE or FALSE. (Case Sensitive)", vscode_1.DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
            }
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.diagnoseBitString = function () {
        var i = 0;
        var match;
        do {
            match = /\b(BIT STRING\s+::=\s+)"([^"]+)"B/g.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            var startPosition = new vscode_1.Position(this.lineNumber, match.index + match[1].length);
            var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            if (regexes.bstring.test(match[2])) {
                var diag = new vscode_1.Diagnostic(range, "Invalid BIT STRING.", vscode_1.DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
            }
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.diagnoseOctetString = function () {
        var i = 0;
        var match;
        do {
            match = /\b(OCTET STRING\s+::=\s+)"([^"]+)"H/g.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            var startPosition = new vscode_1.Position(this.lineNumber, match.index + match[1].length);
            var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            if (regexes.hstring.test(match[2])) {
                var diag = new vscode_1.Diagnostic(range, "Invalid OCTET STRING.", vscode_1.DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
            }
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.diagnoseRelativeObjectIdentifier = function () {
        var i = 0;
        var match;
        do {
            match = /\b(RELATIVE-OID\s+::=\s+)\{([^\{\}]*)\}/g.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            var startPosition = new vscode_1.Position(this.lineNumber, match.index + match[1].length);
            var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
            var range = new vscode_1.Range(startPosition, endPosition);
            var nodes = this.convertObjectIdentifierTokensToNodes(match[2], range);
            if (!nodes)
                return;
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.suggestGeneralizedTime = function () {
        var i = 0;
        do {
            var indexOfMinMax = this.line.indexOf("UTCTime", i);
            if (indexOfMinMax !== -1) {
                var startPosition = new vscode_1.Position(this.lineNumber, indexOfMinMax);
                var endPosition = new vscode_1.Position(this.lineNumber, indexOfMinMax + "UTCTime".length);
                var range = new vscode_1.Range(startPosition, endPosition);
                var diag = new vscode_1.Diagnostic(range, "Consider using GeneralizedTime instead of UTCTime", vscode_1.DiagnosticSeverity.Hint);
                this.diagnostics.push(diag);
                i = (indexOfMinMax + 1);
            }
            else
                break;
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.findMinMax = function () {
        var i = 0;
        do {
            var indexOfMinMax = this.line.indexOf("(MIN..MAX)", i);
            if (indexOfMinMax !== -1) {
                var startPosition = new vscode_1.Position(this.lineNumber, indexOfMinMax);
                var endPosition = new vscode_1.Position(this.lineNumber, indexOfMinMax + "(MIN..MAX)".length);
                var range = new vscode_1.Range(startPosition, endPosition);
                var diag = new vscode_1.Diagnostic(range, "(MIN..MAX) is unnecessary", vscode_1.DiagnosticSeverity.Warning);
                this.diagnostics.push(diag);
                i = (indexOfMinMax + 1);
            }
            else
                break;
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.findGeneralString = function () {
        var i = 0;
        do {
            var index = this.line.indexOf("GeneralString", i);
            if (index !== -1) {
                var startPosition = new vscode_1.Position(this.lineNumber, index);
                var endPosition = new vscode_1.Position(this.lineNumber, index + "GeneralString".length);
                var range = new vscode_1.Range(startPosition, endPosition);
                var diag = new vscode_1.Diagnostic(range, "GeneralString is discouraged", vscode_1.DiagnosticSeverity.Warning);
                this.diagnostics.push(diag);
                i = (index + 1);
            }
            else
                break;
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.findGraphicString = function () {
        var i = 0;
        do {
            var index = this.line.indexOf("GraphicString", i);
            if (index !== -1) {
                var startPosition = new vscode_1.Position(this.lineNumber, index);
                var endPosition = new vscode_1.Position(this.lineNumber, index + "GraphicString".length);
                var range = new vscode_1.Range(startPosition, endPosition);
                var diag = new vscode_1.Diagnostic(range, "GraphicString is discouraged", vscode_1.DiagnosticSeverity.Warning);
                this.diagnostics.push(diag);
                i = (index + 1);
            }
            else
                break;
        } while (i < this.line.length);
    };
    LineDiagnosis.prototype.findIntegerTooBigFor32Bits = function () {
        var i = 0;
        var match;
        do {
            // Leading \b omitted here, because '-' is not counted as a "word" in Regex.
            match = /(\s+)(\-?\d+)\b/g.exec(this.line.slice(i));
            if (match === null)
                break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            var numberInQuestion = Number(match[2]);
            if (numberInQuestion > 2147483647) {
                var startPosition = new vscode_1.Position(this.lineNumber, match.index + match[1].length);
                var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
                var range = new vscode_1.Range(startPosition, endPosition);
                var diag = new vscode_1.Diagnostic(range, "This number is too big to encode as a signed integer on 32-bits.", vscode_1.DiagnosticSeverity.Warning);
                this.diagnostics.push(diag);
            }
            else if (numberInQuestion < -2147483648) {
                var startPosition = new vscode_1.Position(this.lineNumber, match.index + match[1].length);
                var endPosition = new vscode_1.Position(this.lineNumber, match.index + match[0].length);
                var range = new vscode_1.Range(startPosition, endPosition);
                var diag = new vscode_1.Diagnostic(range, "This number is too negative to encode as a signed integer on 32-bits.", vscode_1.DiagnosticSeverity.Warning);
                this.diagnostics.push(diag);
            }
        } while (i < this.line.length);
    };
    return LineDiagnosis;
}());
exports.LineDiagnosis = LineDiagnosis;
//# sourceMappingURL=diagnostics.js.map