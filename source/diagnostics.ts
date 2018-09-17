import { Diagnostic, DiagnosticSeverity, Position, Range } from "vscode";
import * as regexes from "./regexes";
import { ObjectIdentifierNode as OIDNode } from "./types/oidnode";
import { Enumeration } from "./types/enumerated";
import { keywords } from "./keywords";

export
class LineDiagnosis {
    protected diagnostics : Diagnostic[] = [];

    constructor(readonly line : string, readonly lineNumber : number, diagnostics : Diagnostic[]) {
        this.diagnostics = diagnostics;
    }

    public diagnose() {
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
        keywords.forEach(keyword => {
            this.diagnoseTwoDuplicatedWordsNextToEachOther(keyword);
        });
        this.diagnoseMultipleContextSpecificTagsNextToEachOther();
    }

    public diagnoseBadString (needle : RegExp, errorMessage : string) : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        do {
            match = needle.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            const startPosition : Position = new Position(this.lineNumber, match.index);
            const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, errorMessage, DiagnosticSeverity.Error);
            this.diagnostics.push(diag);
        } while (i < this.line.length);
    }

    public diagnoseSize () : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        do {
            match = /SIZE\s*\((-?\d+)\.\.(-?\d+)\)/g.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            const startPosition : Position = new Position(this.lineNumber, match.index);
            const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            this.diagnoseUnsignedNumber(match[1], range);
            this.diagnoseUnsignedNumber(match[2], range);
            const lowerBoundary : number = Number(match[1]);
            const upperBoundary : number = Number(match[2]);
            // REVIEW: Any way I can assert(0) if either number is NaN?
            if (lowerBoundary > upperBoundary) {
                const diag : Diagnostic = new Diagnostic(range, "Minimum boundary is greater than maximum boundary.", DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
            } else if (lowerBoundary === upperBoundary) {
                const diag : Diagnostic = new Diagnostic(range, "Minimum boundary is equal to the maximum boundary. A constant could be used instead.", DiagnosticSeverity.Warning);
                this.diagnostics.push(diag);
            }
        } while (i < this.line.length);
    }

    public diagnoseRange () : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        do {
            match = /\((-?\d+)\.\.(-?\d+)\)/g.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            const startPosition : Position = new Position(this.lineNumber, match.index);
            const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            this.diagnoseSignedNumber(match[1], range);
            this.diagnoseSignedNumber(match[2], range);
            const lowerBoundary : number = Number(match[1]);
            const upperBoundary : number = Number(match[2]);
            // REVIEW: Any way I can assert(0) if either number is NaN?
            if (lowerBoundary > upperBoundary) {
                const diag : Diagnostic = new Diagnostic(range, "Minimum boundary is greater than maximum boundary.", DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
            } else if (lowerBoundary === upperBoundary) {
                const diag : Diagnostic = new Diagnostic(range, "Minimum boundary is equal to the maximum boundary. A constant could be used instead.", DiagnosticSeverity.Warning);
                this.diagnostics.push(diag);
            }
        } while (i < this.line.length);
    }

    public diagnoseObjectIdentifier () : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        do {
            match = /\b(OBJECT IDENTIFIER\s+::=\s+)\{([^\{\}]*)\}/g.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            const startPosition : Position = new Position(this.lineNumber, match.index + match[1].length);
            const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            const nodes : OIDNode[] | null = this.convertObjectIdentifierTokensToNodes(match[2], range);
            if (!nodes) return;

            if (nodes.length < 2) {
                const diag : Diagnostic = new Diagnostic(range, "An OBJECT IDENTIFIER may not be shorter than two nodes.", DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
                break;
            }

            if (typeof nodes[0].numberForm !== "undefined") {
                if (nodes[0].numberForm > 2) {
                    const diag : Diagnostic = new Diagnostic(range, "First node of an OBJECT IDENTIFIER may not exceed 2.", DiagnosticSeverity.Error);
                    this.diagnostics.push(diag);
                } else {
                    if (typeof nodes[1].numberForm !== "undefined") {
                        switch (nodes[0].numberForm) {
                            case 0: {
                                if (
                                    typeof nodes[0].nameForm !== "undefined" && 
                                    !(["itu-t", "ccitt", "itu-r"].includes(nodes[0].nameForm))
                                ) {
                                    const diag : Diagnostic = new Diagnostic(range, `${nodes[0].numberForm} is not the correct root arc for ${nodes[0].nameForm}.`, DiagnosticSeverity.Error);
                                    this.diagnostics.push(diag);
                                }
                                if (nodes[1].numberForm > 39) {
                                    const diag : Diagnostic = new Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 39 if the first node is 0.", DiagnosticSeverity.Error);
                                    this.diagnostics.push(diag);
                                }
                                break;
                            }
                            case 1: {
                                if (
                                    typeof nodes[0].nameForm !== "undefined" && 
                                    !(["iso"].includes(nodes[0].nameForm))
                                ) {
                                    const diag : Diagnostic = new Diagnostic(range, `${nodes[0].numberForm} is not the correct root arc for ${nodes[0].nameForm}.`, DiagnosticSeverity.Error);
                                    this.diagnostics.push(diag);
                                }
                                if (nodes[1].numberForm > 39) {
                                    const diag : Diagnostic = new Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 39 if the first node is 1.", DiagnosticSeverity.Error);
                                    this.diagnostics.push(diag);
                                }
                                break;
                            }
                            case 2: {
                                if (
                                    typeof nodes[0].nameForm !== "undefined" && 
                                    !(["joint-iso-itu-t", "joint-iso-ccitt"].includes(nodes[0].nameForm))
                                ) {
                                    const diag : Diagnostic = new Diagnostic(range, `${nodes[0].numberForm} is not the correct root arc for ${nodes[0].nameForm}.`, DiagnosticSeverity.Error);
                                    this.diagnostics.push(diag);
                                }
                                if (nodes[1].numberForm > 175) {
                                    const diag : Diagnostic = new Diagnostic(range, "Second node of an OBJECT IDENTIFIER may not exceed 175 if the first node is 2.", DiagnosticSeverity.Error);
                                    this.diagnostics.push(diag);
                                }
                                break;
                            }
                            default: return; // REVIEW
                        }
                    }
                }
            }
        } while (i < this.line.length);
    }

    public diagnoseBinaryStringLiterals () : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        do {
            match = /'([^']+)'B\b/g.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            const innerMatch : RegExpExecArray | null = /^[01\s]+$/g.exec(match[1]);
            if (innerMatch !== null) break;
            const startPosition : Position = new Position(this.lineNumber, match.index);
            const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, "Invalid binary string.", DiagnosticSeverity.Error);
            this.diagnostics.push(diag);
        } while (i < this.line.length);
    }

    public diagnoseHexadecimalStringLiterals () : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        do {
            match = /'([^']+)'H\b/g.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            const innerMatch : RegExpExecArray | null = /^[0-9A-F\s]+$/g.exec(match[1]);
            if (innerMatch !== null) break;
            const startPosition : Position = new Position(this.lineNumber, match.index);
            const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, "Invalid hexadecimal string.", DiagnosticSeverity.Error);
            this.diagnostics.push(diag);
        } while (i < this.line.length);
    }

    public diagnoseMultipleContextSpecificTagsNextToEachOther () : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        do {
            const matcher : RegExp = new RegExp(`(\\s+)((?:\\[\\d+\\]\\s+){2,})\\b`);
            match = matcher.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            const startPosition : Position = new Position(this.lineNumber, match.index + match[1].length);
            const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, `Duplicated context-specific tags.`, DiagnosticSeverity.Error);
            this.diagnostics.push(diag);
        } while (i < this.line.length);
    }

    public diagnoseTwoContradictoryWordsNextToEachOther (word1 : string, word2: string) : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        do {
            const matcher : RegExp = new RegExp(`\\b((?:${word1}\\s+${word2})|(?:${word2}\\s+${word1}))\\b`);
            match = matcher.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            const startPosition : Position = new Position(this.lineNumber, match.index);
            const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, `Contradictory ${word1} and ${word2}.`, DiagnosticSeverity.Error);
            this.diagnostics.push(diag);
        } while (i < this.line.length);
    }

    public diagnoseTwoDuplicatedWordsNextToEachOther (word1 : string) : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        do {
            const matcher : RegExp = new RegExp(`\\b${word1}\\s+${word1}\\b`);
            match = matcher.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            const startPosition : Position = new Position(this.lineNumber, match.index);
            const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            const diag : Diagnostic = new Diagnostic(range, `Duplicated ${word1}.`, DiagnosticSeverity.Error);
            this.diagnostics.push(diag);
        } while (i < this.line.length);
    }

    public diagnoseUnsignedNumber (numberString : string, range : Range) : void {
        if (numberString.length === 0) return;
        if (numberString.charAt(0) === "-") {
            const diag : Diagnostic = new Diagnostic(range, "Number may not be negative", DiagnosticSeverity.Error);
            this.diagnostics.push(diag);
        }
        if (numberString.length > 1 && numberString.charAt(0) === "0") {
            const diag : Diagnostic = new Diagnostic(range, "Number may not start with a leading 0 if it is not 0.", DiagnosticSeverity.Error);
            this.diagnostics.push(diag);
        }
        const numberInQuestion : number = Number(numberString);
        if (numberInQuestion > 2147483647) {
            const diag : Diagnostic = new Diagnostic(range, "Number is too big to encode as a signed integer on 32-bits.", DiagnosticSeverity.Warning);
            this.diagnostics.push(diag);
        }
    }

    public diagnoseSignedNumber (numberString : string, range : Range) : void {
        if (numberString.length === 0) return;
        if (numberString.length > 1 && (numberString.slice(0, 2) === "-0" || numberString.charAt(0) === "0")) {
            const diag : Diagnostic = new Diagnostic(range, "Number may not start with a leading 0 if it is not 0.", DiagnosticSeverity.Error);
            this.diagnostics.push(diag);
        }
        const numberInQuestion : number = Number(numberString);
        if (numberInQuestion > 2147483647) {
            const diag : Diagnostic = new Diagnostic(range, "Number is too big to encode as a signed integer on 32-bits.", DiagnosticSeverity.Warning);
            this.diagnostics.push(diag);
        } else if (numberInQuestion < -2147483648) {
            const diag : Diagnostic = new Diagnostic(range, "Number is too negative to encode as a signed integer on 32-bits.", DiagnosticSeverity.Warning);
            this.diagnostics.push(diag);
        }
    }

    // The OID string this receives should not contain "{" or "}"
    // identifier, number, identifier(number), valuereference, modulereference.typereference
    public convertObjectIdentifierTokensToNodes (objIdComponentList : string, range : Range) : OIDNode[] | null {
        const tokens : string[] = objIdComponentList.replace(/\s*\(\s*(\d+)\s*\)/, "($1)").split(/\s+/g);
        let nodes : OIDNode[] = [];
        for (const token of tokens) {
            if (token === "") continue;
            if (regexes.number.test(token)) {
                this.diagnoseUnsignedNumber(token, range);
                nodes.push(new OIDNode(Number(token)));
            } else if (regexes.identifier.test(token)) {
                nodes.push(new OIDNode(undefined, token));
            } else if (token.split(".").length === 2) { 
                const [moduleReference, typeReference] = token.split(".");
                if (regexes.modulereference.test(moduleReference)) {
                    const diag : Diagnostic = new Diagnostic(range, "Malformed ModuleReference.", DiagnosticSeverity.Error);
                    this.diagnostics.push(diag);
                    return null;
                }
                if (regexes.typereference.test(typeReference)) {
                    const diag : Diagnostic = new Diagnostic(range, "Malformed TypeReference.", DiagnosticSeverity.Error);
                    this.diagnostics.push(diag);
                    return null;
                }
                nodes.push(new OIDNode(undefined, token));
            } else {
                const match : RegExpExecArray = /^([a-z][A-Za-z0-9\-]*[A-Za-z0-9])\((\d+)\)$/g.exec(token);
                if (!match) {
                    const diag : Diagnostic = new Diagnostic(range, "Malformed OBJECT IDENTIFIER literal.", DiagnosticSeverity.Error);
                    this.diagnostics.push(diag);
                    return null;
                }
                this.diagnoseUnsignedNumber(match[2], range);
                nodes.push(new OIDNode(Number(match[2]), match[1]));
            }
        };
        return nodes;
    }

    public diagnoseTags () : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        do {
            const matcher : RegExp = /\[\s*([A-Z][A-Za-z0-9\-]*[A-Za-z0-9]:\s+)?((UNIVERSAL|APPLICATION|PRIVATE)\s+)?([^\s\]]+)\s*\]/;
            match = matcher.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            const startPosition : Position = new Position(this.lineNumber, match.index);
            const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            if (/^\-?\d+$/.test(match[(match.length - 1)]))
                this.diagnoseUnsignedNumber(match[(match.length - 1)], range);
        } while (i < this.line.length);
    }

    public diagnoseCharacterStringType (typeName : string, stringRegex : RegExp) : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        const matcher : RegExp = new RegExp(`\\b(${typeName}\\s+::=\\s+)"([^"]+)"`);
        do {
            match = matcher.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            if (!stringRegex.test(match[2])) {
                const startPosition : Position = new Position(this.lineNumber, match.index + match[1].length);
                const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
                const range : Range = new Range(startPosition, endPosition);
                const diag : Diagnostic = new Diagnostic(range, `Invalid ${typeName}.`, DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
            }
        } while (i < this.line.length);
    }

    public diagnoseIntegerLiteral () : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        do {
            match = /\b(INTEGER\s+::=\s+)(\-?\d+)/.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            const startPosition : Position = new Position(this.lineNumber, match.index + match[1].length);
            const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            this.diagnoseSignedNumber(match[2], range);
        } while (i < this.line.length);
    }

    public diagnoseEnumerated () : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        do {
            match = /\b(ENUMERATED\s+::=\s+)\{([^\{\}]*)\}/g.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            const startPosition : Position = new Position(this.lineNumber, match.index + match[1].length);
            const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            const enums : Enumeration[] | null = this.enumerate(match[2], range);
            if (!enums) {
                const diag : Diagnostic = new Diagnostic(range, "Malformed ENUMERATED.", DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
            } else {
                // TODO: Validate that there are no duplicated numbers.
                // REVIEW: Actually, _do_ they have to be unique?
            }
        } while (i < this.line.length);
    }

    public enumerate (enumString : string, range : Range) : Enumeration[] | null {
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
                    this.diagnoseSignedNumber(match[2], range);
                enums.push(new Enumeration(match[1], Number(match[2])));
            } else {
                enums.push(new Enumeration(match[1]));
            }
        };
        return enums;
    }

    public diagnoseStructuredLabeledReal () : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        do {
            match = /\b(REAL\s+::=\s+)\{\s*mantissa\s*(\-?\d+)\s*,\s*base\s*(\d+)\s*,\s*exponent\s*(\-?\d+)\s*\}/g.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            const startPosition : Position = new Position(this.lineNumber, match.index + match[1].length);
            const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            this.diagnoseSignedNumber(match[2], range);
            this.diagnoseUnsignedNumber(match[3], range);
            const base : number = Number(match[3]);
            if (base !== 2 && base !== 10) {
                const diag : Diagnostic = new Diagnostic(range, "Base must be 2 or 10.", DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
            }
            this.diagnoseSignedNumber(match[4], range);
        } while (i < this.line.length);
    }

    public diagnoseStructuredUnlabeledReal () : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        do {
            match = /\b(REAL\s+::=\s+)\{\s*(\-?\d+)\s*,\s*(\d+)\s*,\s*(\-?\d+)\s*\}/g.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            const startPosition : Position = new Position(this.lineNumber, match.index + match[1].length);
            const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            this.diagnoseSignedNumber(match[2], range);
            this.diagnoseUnsignedNumber(match[3], range);
            const base : number = Number(match[3]);
            if (base !== 2 && base !== 10) {
                const diag : Diagnostic = new Diagnostic(range, "Base must be 2 or 10.", DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
            }
            this.diagnoseSignedNumber(match[4], range);
        } while (i < this.line.length);
    }

    public diagnoseBoolean () : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        do {
            match = /\b(BOOLEAN\s+::=\s+)(\w+)/g.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            const startPosition : Position = new Position(this.lineNumber, match.index + match[1].length);
            const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            if (match[2] !== "TRUE" && match[2] !== "FALSE") {
                const diag : Diagnostic = new Diagnostic(range, "Invalid BOOLEAN. BOOLEAN must be TRUE or FALSE. (Case Sensitive)", DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
            }
        } while (i < this.line.length);
    }

    public diagnoseBitString () : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        do {
            match = /\b(BIT STRING\s+::=\s+)"([^"]+)"B/g.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            const startPosition : Position = new Position(this.lineNumber, match.index + match[1].length);
            const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            if (regexes.bstring.test(match[2])) {
                const diag : Diagnostic = new Diagnostic(range, "Invalid BIT STRING.", DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
            }
        } while (i < this.line.length);
    }

    public diagnoseOctetString () : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        do {
            match = /\b(OCTET STRING\s+::=\s+)"([^"]+)"H/g.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            const startPosition : Position = new Position(this.lineNumber, match.index + match[1].length);
            const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            if (regexes.hstring.test(match[2])) {
                const diag : Diagnostic = new Diagnostic(range, "Invalid OCTET STRING.", DiagnosticSeverity.Error);
                this.diagnostics.push(diag);
            }
        } while (i < this.line.length);
    }

    public diagnoseRelativeObjectIdentifier () : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        do {
            match = /\b(RELATIVE-OID\s+::=\s+)\{([^\{\}]*)\}/g.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            // REVIEW: Any way I can assert(0) if either number is NaN?
            const startPosition : Position = new Position(this.lineNumber, match.index + match[1].length);
            const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
            const range : Range = new Range(startPosition, endPosition);
            const nodes : OIDNode[] | null = this.convertObjectIdentifierTokensToNodes(match[2], range);
            if (!nodes) return;
        } while (i < this.line.length);
    }

    public suggestGeneralizedTime () : void {
        let i : number = 0;
        do {
            let indexOfMinMax : number = this.line.indexOf("UTCTime", i);
            if (indexOfMinMax !== -1) {
                const startPosition : Position = new Position(this.lineNumber, indexOfMinMax);
                const endPosition : Position = new Position(this.lineNumber, indexOfMinMax + "UTCTime".length);
                const range : Range = new Range(startPosition, endPosition);
                const diag : Diagnostic = new Diagnostic(range, "Consider using GeneralizedTime instead of UTCTime", DiagnosticSeverity.Hint);
                this.diagnostics.push(diag);
                i = (indexOfMinMax + 1);
            } else break;
        } while (i < this.line.length);
    }

    public findMinMax () : void {
        let i : number = 0;
        do {
            let indexOfMinMax : number = this.line.indexOf("(MIN..MAX)", i);
            if (indexOfMinMax !== -1) {
                const startPosition : Position = new Position(this.lineNumber, indexOfMinMax);
                const endPosition : Position = new Position(this.lineNumber, indexOfMinMax + "(MIN..MAX)".length);
                const range : Range = new Range(startPosition, endPosition);
                const diag : Diagnostic = new Diagnostic(range, "(MIN..MAX) is unnecessary", DiagnosticSeverity.Warning);
                this.diagnostics.push(diag);
                i = (indexOfMinMax + 1);
            } else break;
        } while (i < this.line.length);
    }

    public findGeneralString () : void {
        let i : number = 0;
        do {
            let index : number = this.line.indexOf("GeneralString", i);
            if (index !== -1) {
                const startPosition : Position = new Position(this.lineNumber, index);
                const endPosition : Position = new Position(this.lineNumber, index + "GeneralString".length);
                const range : Range = new Range(startPosition, endPosition);
                const diag : Diagnostic = new Diagnostic(range, "GeneralString is discouraged", DiagnosticSeverity.Warning);
                this.diagnostics.push(diag);
                i = (index + 1);
            } else break;
        } while (i < this.line.length);
    }

    public findGraphicString () : void {
        let i : number = 0;
        do {
            let index : number = this.line.indexOf("GraphicString", i);
            if (index !== -1) {
                const startPosition : Position = new Position(this.lineNumber, index);
                const endPosition : Position = new Position(this.lineNumber, index + "GraphicString".length);
                const range : Range = new Range(startPosition, endPosition);
                const diag : Diagnostic = new Diagnostic(range, "GraphicString is discouraged", DiagnosticSeverity.Warning);
                this.diagnostics.push(diag);
                i = (index + 1);
            } else break;
        } while (i < this.line.length);
    }

    public findIntegerTooBigFor32Bits () : void {
        let i : number = 0;
        let match : RegExpExecArray | null;
        do {
            // Leading \b omitted here, because '-' is not counted as a "word" in Regex.
            match = /(\s+)(\-?\d+)\b/g.exec(this.line.slice(i));
            if (match === null) break;
            i += (match.index + 1); // "+ match[0].length" does not work for some reason.
            const numberInQuestion : number = Number(match[2]);
            if (numberInQuestion > 2147483647) {
                const startPosition : Position = new Position(this.lineNumber, match.index + match[1].length);
                const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
                const range : Range = new Range(startPosition, endPosition);
                const diag : Diagnostic = new Diagnostic(range, "This number is too big to encode as a signed integer on 32-bits.", DiagnosticSeverity.Warning);
                this.diagnostics.push(diag);
            } else if (numberInQuestion < -2147483648) {
                const startPosition : Position = new Position(this.lineNumber, match.index + match[1].length);
                const endPosition : Position = new Position(this.lineNumber, match.index + match[0].length);
                const range : Range = new Range(startPosition, endPosition);
                const diag : Diagnostic = new Diagnostic(range, "This number is too negative to encode as a signed integer on 32-bits.", DiagnosticSeverity.Warning);
                this.diagnostics.push(diag);
            }
        } while (i < this.line.length);
    }

}