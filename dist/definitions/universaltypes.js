"use strict";
exports.__esModule = true;
var vscode_1 = require("vscode");
// TODO: Add the character string multipliers
exports.END_OF_CONTENT_DEFINITION = new vscode_1.MarkdownString("A special UNIVERSAL type used to signal the termination of an \
indefinite-length encoded ASN.1 element.");
exports.BOOLEAN_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that can be either `TRUE` or `FALSE`.");
exports.INTEGER_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents an integer that can vary indefinitely \
between negative infinity and positive infinity.");
exports.BIT_STRING_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a sequence of bits.");
exports.OCTET_STRING_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a sequence of 8-bit bytes (often called \
'octets' by the ASN.1 specification).");
exports.NULL_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents an absence of a value.");
exports.OBJECT_IDENTIFIER_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents an object identifier as defined in the \
[International Telecommunication's Union](https://www.itu.int/en/Pages/default.aspx)'s \
specification [X.660](https://www.itu.int/rec/T-REC-X.660-201107-I/en). Consists \
of a sequence of unsigned integers with no specified maximum. Often represented as \
a sequence of numbers separated by periods. \
\
When used in ASN.1 specifications, `OBJECT IDENTIFIER`s are often represented as \
a sequence of arcs enclosed in curly brackets and with a space padding the \
brackets from the arcs. Each arc is either represented in numeric form, or with \
the `ObjectDescriptor` that uniquely defines that arc within its parent arc, or \
the `ObjectDescriptor` followed immediately by the numeric form enclosed in \
parentheses. Example: `{ iso(1) member-body(2) us(840) microsoft(113556) 1 }`. \
\
Each arc of the object identifier is typically associated with an owner, who \
gets to decide what each node beneath their arc means. This owner is free to \
define an infinite number of arcs beneath an arc they own, or delegate \
exclusive ownership and control to another party. To continue off of our \
example, `1.2.840.113556` is the object identifier for Microsoft Corporation, \
and Microsoft Corporation assigned arc 1 within that object identifier to mean \
'Active Directory', and arcs beneath this relate to their Active Directory product.");
exports.OBJECT_DESCRIPTOR_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a descriptor for an OBJECT IDENTIFIER arc.");
exports.EXTERNAL_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that is used to change the presentation context, which\
is defined as follows:\n\
```\
EXTERNAL ::= [UNIVERSAL 8] IMPLICIT SEQUENCE {\
    identification CHOICE {\
        syntax OBJECT IDENTIFIER,\
        presentation-context-id INTEGER,\
        context-negotiation SEQUENCE {\
            presentation-context-id INTEGER,\
            transfer-syntax OBJECT IDENTIFIER } },\
    data-value-descriptor ObjectDescriptor OPTIONAL,\
    data-value OCTET STRING }\
```\n\
But, according to the\
[International Telecommunications Union](https://www.itu.int/en/pages/default.aspx)'s\
[X.690 - ASN.1 encoding rules](http://www.itu.int/rec/T-REC-X.690/en),\
section 8.18, when encoded using Basic Encoding Rules (BER), is encoded as\
follows, for compatibility reasons:\n\
```\
EXTERNAL ::= [UNIVERSAL 8] IMPLICIT SEQUENCE {\
    direct-reference  OBJECT IDENTIFIER OPTIONAL,\
    indirect-reference  INTEGER OPTIONAL,\
    data-value-descriptor  ObjectDescriptor  OPTIONAL,\
    encoding  CHOICE {\
        single-ASN1-type  [0] ANY,\
        octet-aligned     [1] IMPLICIT OCTET STRING,\
        arbitrary         [2] IMPLICIT BIT STRING } }\
```\
");
exports.REAL_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a floating point number.");
exports.ENUMERATED_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a selection from a multitude of choices.");
exports.EMBEDDED_PDV_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that is used to change the presentation context defined as:\n\
```\
    EmbeddedPDV ::= [UNIVERSAL 11] IMPLICIT SEQUENCE {\
        identification CHOICE {\
            syntaxes SEQUENCE {\
                abstract OBJECT IDENTIFIER,\
                transfer OBJECT IDENTIFIER },\
            syntax OBJECT IDENTIFIER,\
            presentation-context-id INTEGER,\
            context-negotiation SEQUENCE {\
                presentation-context-id INTEGER,\
                transfer-syntax OBJECT IDENTIFIER },\
            transfer-syntax OBJECT IDENTIFIER,\
            fixed NULL },\
        data-value-descriptor ObjectDescriptor OPTIONAL,\
        data-value OCTET STRING }\
    (WITH COMPONENTS { ... , data-value-descriptor ABSENT })\
```\
This assumes `AUTOMATIC TAGS`, so all of the `identification`\
choices will be `CONTEXT-SPECIFIC` and numbered from 0 to 5.\
");
exports.UTF8_STRING_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a UTF-8 String.");
exports.RELATIVE_OID_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents an arc beneath a mutually understood \
`OBJECT IDENTIFIER` arc. Since complete `OBJECT IDENTIFIER`s can be quite \
lengthy, the `RELATIVE-OID` is used to cut down on the amount of data needing \
encoding, decoding, and transmission by assuming a prefix, such as `1.3.6.4.1`.");
exports.SEQUENCE_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a list of more ASN.1-encoded elements \
whose ordering in the list matters, in contrast to a `SET`.");
exports.SET_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a list of more ASN.1-encoded elements \
whose ordering in the list _does not matter_, in contrast to a `SEQUENCE`.");
exports.NUMERIC_STRING_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a string that can contain only digits and \
spaces (`0x20`).");
exports.PRINTABLE_STRING_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a string that may contain only characters \
from this selection: `etaoinsrhdlucmfywgpbvkxqjzETAOINSRHDLUCMFYWGPBVKXQJZ0123456789 '()+,-./:=?`.");
exports.T61_STRING_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a string encoded with the Teletex character \
set, as specified in the \
[International Telecommunications Union](https://www.itu.int/en/pages/default.aspx)'s\
[T.61 : Character repertoire and coded character sets for the international teletex service](https://www.itu.int/rec/T-REC-T.61-198811-S/en).\n\
This data type is deprecated, but it remains in use in some old X.509 certificates.");
exports.VIDEOTEX_STRING_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a string encoded with the Videotex character \
set. The official definition of this character set is nebulous, because it was \
never standardized. This data type is deprecated.");
exports.IA5_STRING_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a string encoded with the International \
Reference Alphabet (IRA) character set--formerly known as the \
'International Alphabet No. 5' (IA5)--as specified in the \
[International Telecommunications Union](https://www.itu.int/en/pages/default.aspx)'s\
[T.50 : International Alphabet No. 5](https://www.itu.int/rec/T-REC-T.50-198811-S).\n\
This is very similar to ASCII, but substitutes characters that are specific to \
the United States, like the dollar sign (`$`) for more generic international characters.");
exports.UTC_TIME_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a moment in time. It is represented as a \
string of the form `YYYMMDDhhmmss`, followed by either a `Z` to indicate UTC \
time zone, or a plus or minus followed by an hour and minute of the form `hhmm` \
to specify a timezone offset from UTC. The seconds component is optional.\n\
Because this data type encodes the year on two digits, the indicated year is \
ambiguous. The precision is also limited to seconds, which makes `UTCTime` \
unusable for certain circumstances. For these reasons, `GeneralizedTime` \
should be preferred when possible.\n\
Examples:\
`9805281429Z`\n\
`980528142905Z`\n\
`9805281429+0200`\n");
exports.GENERALIZED_TIME_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a moment in time, and is represented as a \
string of the form `YYYYMMDDhhmmss`, where both minutes and seconds are \
optional. A milliseconds component of infinite precision can follow, taking \
the form of a period or comma followed by an infinite sequence of digits \
representing a decimal fraction of a second. Either a `Z` or a timezone may \
follow as a plus or minus with four digits that indicate the hour and minute \
offset from UTC, and where `Z` indicates UTCTime.\n\
Examples:\
`199805281429Z`\n\
`19980528142905Z`\n\
`199805281429+0200`\n");
// deprecated (page 182)
exports.GRAPHIC_STRING_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a string of the graphical (visible) \
characters, called 'G', registered in the International Register of Coded \
Character Sets to be used with Escape Sequences.");
// TODO: Add ISO646String (page 176)
exports.VISIBLE_STRING_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a string encoded with the character set \
registered as character set number 6 in the International Register, but only \
the visible characters from that character set, meaning that no escape \
characters, now newlines, and no backspaces may be used.");
// deprecated (page 182)
exports.GENERAL_STRING_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a string of the graphical (visible) \
characters, called 'G' and control characters, called 'C', registered in the \
International Register of Coded Character Sets to be used with Escape Sequences.");
exports.UNIVERSAL_STRING_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a string encoded with the UCS-4 character set.");
exports.CHARACTER_STRING_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that is used to change the presentation context defined as:\n\
```\
    CHARACTER STRING ::= [UNIVERSAL 29] SEQUENCE { \
        identification CHOICE { \
            syntaxes SEQUENCE { \
                abstract OBJECT IDENTIFIER, \
                transfer OBJECT IDENTIFIER }, \
            syntax OBJECT IDENTIFIER, \
            presentation-context-id INTEGER, \
            context-negotiation SEQUENCE { \
                presentation-context-id INTEGER, \
                transfer-syntax OBJECT IDENTIFIER }, \
            transfer-syntax OBJECT IDENTIFIER, \
            fixed NULL }, \
        string-value OCTET STRING } \
```\n\
This assumes `AUTOMATIC TAGS`, so all of the `identification` \
choices will be `CONTEXT-SPECIFIC` and numbered from 0 to 5.");
exports.BMP_STRING_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a string encoded with the UCS-2 character set.");
exports.CHOICE_DEFINITION = new vscode_1.MarkdownString("A structured type that allows a selection from a variety of options.");
exports.DATE_DEFINITION = new vscode_1.MarkdownString("DATE ::= [UNIVERSAL 31] IMPLICIT TIME");
exports.DATE_TIME_DEFINITION = new vscode_1.MarkdownString("DATE-TIME ::= [UNIVERSAL 33] IMPLICIT TIME");
exports.TIME_DEFINITION = new vscode_1.MarkdownString("A timestamp recorded as a string in the form specified in ISO 8601, \
Section 3.4.");
exports.TIME_OF_DAY_DEFINITION = new vscode_1.MarkdownString("TIME-OF-DAY ::= [UNIVERSAL 32] IMPLICIT TIME");
exports.INSTANCE_OF_DEFINITION = new vscode_1.MarkdownString("An instance of an ASN.1 `CLASS`, which is encoded the same way as an \
`EXTERNAL` and uses the same tag of `UNIVERSAL 8`.");
exports.SEQUENCE_OF_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a list of more ASN.1-encoded elements \
whose ordering in the list matters, in contrast to a `SET`, but where, \
unlike the `SEQUENCE` type, the exact number of elements are not known in \
advance.");
exports.SET_OF_DEFINITION = new vscode_1.MarkdownString("A `UNIVERSAL` type that represents a list of more ASN.1-encoded elements \
whose ordering in the list _does not matter_, in contrast to a `SEQUENCE`, \
and where the exact number of elements are not known in advance.");
//# sourceMappingURL=universaltypes.js.map