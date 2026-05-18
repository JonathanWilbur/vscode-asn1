import { CancellationToken, Hover, HoverProvider, Position, TextDocument, workspace, WorkspaceConfiguration } from "vscode";
import * as definitions from "./definitions/index.js";

// TODO: I am having second thoughts about this, because these tokens can appear as literals within objects.
/*
ITU-T Rec. X.681, Section 10.6, says that these words MUST NOT appear as word literals in objects:

- `ABSTRACT-SYNTAX`
- `BIT`
- `BOOLEAN`
- `CHARACTER`
- `CHOICE`
- `CONTAINING`
- `DATE`
- `DATE-TIME`
- `DURATION`
- `EMBEDDED`
- `END`
- `ENUMERATED`
- `EXTERNAL`
- `FALSE`
- `INSTANCE`
- `INTEGER`
- `MINUS-INFINITY`
- `NOT-A-NUMBER`
- `NULL`
- `OBJECT`
- `OCTET`
- `OID-IRI`
- `PLUS-INFINITY`
- `REAL`
- `RELATIVE-OID`
- `RELATIVE-OID-IRI`
- `SEQUENCE`
- `SET`
- `TIME`
- `TIME-OF-DAY`
- `TRUE`
- `TYPE-IDENTIFIER`

So those are fine for unconditional hovers, except in comments and strings.

This also means that I can identify the end of modules by searching for the
first END literal that comes after the first BEGIN literal.
*/
const keywordHovers: Map<string, Hover> = new Map([
    // Booleans
    [ "TRUE", new Hover(definitions.TRUE_DEFINITION) ],
    [ "FALSE", new Hover(definitions.FALSE_DEFINITION) ],

    // Tag Classes
    [ "UNIVERSAL", new Hover(definitions.UNIVERSAL_DEFINTION) ],
    [ "PRIVATE", new Hover(definitions.PRIVATE_DEFINTION) ],
    [ "APPLICATION", new Hover(definitions.APPLICATION_DEFINTION) ],
    [ "CONTEXT", new Hover(definitions.CONTEXT_SPECIFIC_DEFINTION) ],

    // Constraints
    [ "SIZE", new Hover(definitions.SIZE_DEFINITION) ],
    [ "COMPONENT", new Hover(definitions.WITH_COMPONENT_DEFINITION) ],
    [ "COMPONENTS", new Hover(definitions.WITH_COMPONENTS_DEFINITION) ],
    [ "PATTERN", new Hover(definitions.PATTERN_DEFINITION) ],
    [ "INCLUDES", new Hover(definitions.INCLUDES_DEFINITION) ],
    [ "FROM", new Hover(definitions.FROM_DEFINITION) ],
    [ "PRESENT", new Hover(definitions.PRESENT_DEFINITION) ],
    [ "ABSENT", new Hover(definitions.ABSENT_DEFINITION) ],
    [ "ENCODED", new Hover(definitions.ENCODED_BY_DEFINITION) ],
    // [ "ALL EXCEPT", new Hover(definitions.) ],
    [ "INTERSECTION", new Hover(definitions.INTERSECTION_DEFINITION) ],
    [ "UNION", new Hover(definitions.UNION_DEFINITION) ],
    [ "EXCEPT", new Hover(definitions.EXCEPT_DEFINITION) ],
    [ "CONSTRAINED", new Hover(definitions.CONSTRAINED_BY_DEFINITION) ],
    [ "DEFAULT", new Hover(definitions.DEFAULT_DEFINITION) ],
    [ "OPTIONAL", new Hover(definitions.IMPLICIT_DEFINITION) ],

    // Mode
    [ "EXPLICIT", new Hover(definitions.EXPLICIT_DEFINITION) ],
    [ "IMPLICIT", new Hover(definitions.IMPLICIT_DEFINITION) ],

    // Module
    [ "DEFINITIONS", new Hover(definitions.DEFINITIONS_DEFINITION) ],
    [ "BEGIN", new Hover(definitions.BEGIN_DEFINITION) ],
    [ "END", new Hover(definitions.END_DEFINITION) ],
    [ "IMPORTS", new Hover(definitions.IMPORTS_DEFINITION) ],
    [ "EXPORTS", new Hover(definitions.EXPORTS_DEFINITION) ],
    // [ "EXPLICIT TAGS", new Hover(definitions.) ],
    // [ "IMPLICIT TAGS", new Hover(definitions.) ],
    [ "AUTOMATIC", new Hover(definitions.AUTOMATIC_TAGS_DEFINITION) ],
    [ "EXTENSIBILITY", new Hover(definitions.EXTENSIBILITY_IMPLIED_DEFINITION) ],
    [ "IMPLIED", new Hover(definitions.EXTENSIBILITY_IMPLIED_DEFINITION) ],
    [ "TAGS", new Hover(definitions.TAGS_DEFINITION) ],

    // Universal Types
    [ "BOOLEAN", new Hover(definitions.BOOLEAN_DEFINITION) ],
    [ "INTEGER", new Hover(definitions.INTEGER_DEFINITION) ],
    [ "BIT", new Hover(definitions.BIT_STRING_DEFINITION) ],
    [ "OCTET", new Hover(definitions.OCTET_STRING_DEFINITION) ],
    [ "NULL", new Hover(definitions.NULL_DEFINITION) ],
    [ "OBJECT", new Hover(definitions.OBJECT_IDENTIFIER_DEFINITION) ],
    [ "IDENTIFIER", new Hover(definitions.OBJECT_IDENTIFIER_DEFINITION) ],
    [ "ObjectDescriptor", new Hover(definitions.OBJECT_DESCRIPTOR_DEFINITION) ],
    [ "EXTERNAL", new Hover(definitions.EXTERNAL_DEFINITION) ],
    [ "External", new Hover(definitions.EXTERNAL_DEFINITION) ],
    [ "REAL", new Hover(definitions.REAL_DEFINITION) ],
    [ "EMBEDDED", new Hover(definitions.EMBEDDED_PDV_DEFINITION) ],
    [ "PDV", new Hover(definitions.EMBEDDED_PDV_DEFINITION) ],
    [ "EmbeddedPDV", new Hover(definitions.EMBEDDED_PDV_DEFINITION) ],
    [ "UTF8String", new Hover(definitions.UTF8_STRING_DEFINITION) ],
    [ "RELATIVE-OID", new Hover(definitions.RELATIVE_OID_DEFINITION) ],
    [ "SEQUENCE", new Hover(definitions.SEQUENCE_DEFINITION) ],
    [ "SET", new Hover(definitions.SET_DEFINITION) ],
    [ "NumericString", new Hover(definitions.NUMERIC_STRING_DEFINITION) ],
    [ "PrintableString", new Hover(definitions.PRINTABLE_STRING_DEFINITION) ],
    [ "TeletexString", new Hover(definitions.T61_STRING_DEFINITION) ],
    [ "T61String", new Hover(definitions.T61_STRING_DEFINITION) ],
    [ "VideotexString", new Hover(definitions.VIDEOTEX_STRING_DEFINITION) ],
    [ "ISO646String", new Hover(definitions.IA5_STRING_DEFINITION) ],
    [ "IA5String", new Hover(definitions.IA5_STRING_DEFINITION) ],
    [ "UTCTime", new Hover(definitions.UTC_TIME_DEFINITION) ],
    [ "GeneralizedTime", new Hover(definitions.GENERALIZED_TIME_DEFINITION) ],
    [ "GraphicString", new Hover(definitions.GRAPHIC_STRING_DEFINITION) ],
    [ "VisibleString", new Hover(definitions.VISIBLE_STRING_DEFINITION) ],
    [ "GeneralString", new Hover(definitions.GENERAL_STRING_DEFINITION) ],
    [ "UniversalString", new Hover(definitions.UNIVERSAL_STRING_DEFINITION) ],
    [ "CharacterString", new Hover(definitions.CHARACTER_STRING_DEFINITION) ],
    [ "BMPString", new Hover(definitions.BMP_STRING_DEFINITION) ],
    [ "CHOICE", new Hover(definitions.CHOICE_DEFINITION) ],
    [ "DATE", new Hover(definitions.DATE_DEFINITION) ],
    [ "DATE-TIME", new Hover(definitions.DATE_TIME_DEFINITION) ],
    [ "TIME", new Hover(definitions.TIME_DEFINITION) ],
    [ "TIME-OF-DAY", new Hover(definitions.TIME_OF_DAY_DEFINITION) ],
    // [ "INSTANCE OF", new Hover(definitions.) ],
    // [ "SEQUENCE OF", new Hover(definitions.) ],
    // [ "SET OF", new Hover(definitions.) ],

    // Values
    [ "MIN", new Hover(definitions.MIN_DEFINITION) ],
    [ "MAX", new Hover(definitions.MAX_DEFINITION) ],
    [ "PLUS-INFINITY", new Hover(definitions.PLUS_INFINITY_DEFINITION) ],
    [ "MINUS-INFINITY", new Hover(definitions.MINUS_INFINITY_DEFINITION) ],
    [ "NOT-A-NUMBER", new Hover(definitions.NOT_A_NUMBER_DEFINITION) ],
]);

export
class ASN1HoverProvider implements HoverProvider {
	private asn1Config: WorkspaceConfiguration | null = null;

	constructor(asn1Config?: WorkspaceConfiguration) {
		this.asn1Config = asn1Config ?? null;
	}

    public provideHover(document: TextDocument, position: Position, token: CancellationToken) : Thenable<Hover> {
        if (!this.asn1Config) {
            this.asn1Config = workspace.getConfiguration("asn1", document.uri);
        }
        const wordRange = document.getWordRangeAtPosition(position);
        const word : string = document.getText(wordRange);
        const keywordHover = keywordHovers.get(word);
        if (keywordHover) {
            return Promise.resolve(keywordHover);
        }
        return Promise.reject(null);
    }
}