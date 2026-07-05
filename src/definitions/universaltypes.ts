import { MarkdownString } from "vscode";

export const END_OF_CONTENT_DEFINITION : MarkdownString = new MarkdownString(
"A special UNIVERSAL type used to signal the termination of an \
indefinite-length encoded ASN.1 element."
);

export const BOOLEAN_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that can be either `TRUE` or `FALSE`."
);

export const INTEGER_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents an integer that can vary indefinitely \
between negative infinity and positive infinity."
);

export const BIT_STRING_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a sequence of bits."
);

export const OCTET_STRING_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a sequence of 8-bit bytes (often called \
'octets' by the ASN.1 specification)."
);

export const NULL_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents an absence of a value. It's encodings are:\n\n\
- `0x0500` in BER, CER, and DER\n\
- Zero bytes / zero length in Packed Encoding Rules (PER), Octet Encoding Rules (OER), and XML Encoding Rules (XER)\n\
- A JSON `null` in the JSON Encoding Rules (JER)\n\
- `0x4E554C4C` (ASCII \"NULL\") when using Generic String Encoding Rules (GSER)\n\
"
);

export const OBJECT_IDENTIFIER_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents an object identifier as defined in the \
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
'Active Directory', and arcs beneath this relate to their Active Directory product."
);

export const OBJECT_DESCRIPTOR_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a descriptor for an OBJECT IDENTIFIER arc."
);

export const EXTERNAL_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that is used to change the presentation context, which\
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

export const REAL_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a floating point number."
);

export const ENUMERATED_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a selection from a multitude of choices."
);

export const EMBEDDED_PDV_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that is used to change the presentation context defined as:\n\
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

export const UTF8_STRING_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a UTF-8 String. Each character can be encoded "
+ "on multiple bytes."
);

export const RELATIVE_OID_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents an arc beneath a mutually understood \
`OBJECT IDENTIFIER` arc. Since complete `OBJECT IDENTIFIER`s can be quite \
lengthy, the `RELATIVE-OID` is used to cut down on the amount of data needing \
encoding, decoding, and transmission by assuming a prefix, such as `1.3.6.4.1`."
);

export const SEQUENCE_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a list of more ASN.1-encoded elements \
whose ordering in the list matters, in contrast to a `SET`."
);

export const SET_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a list of more ASN.1-encoded elements \
whose ordering in the list _does not matter_, in contrast to a `SEQUENCE`."
);

export const NUMERIC_STRING_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a string that can contain only digits and \
spaces (`0x20`). Each character is encoded on a single byte."
);

export const PRINTABLE_STRING_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a string that may contain only characters \
from this selection: `etaoinsrhdlucmfywgpbvkxqjzETAOINSRHDLUCMFYWGPBVKXQJZ0123456789 '()+,-./:=?`. \
Each character is encoded on a single byte."
);

export const T61_STRING_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a string encoded with the Teletex character \
set, as specified in the \
[International Telecommunications Union](https://www.itu.int/en/pages/default.aspx)'s\
[T.61 : Character repertoire and coded character sets for the international teletex service](https://www.itu.int/rec/T-REC-T.61-198811-S/en).\n\
This data type is deprecated, but it remains in use in some old X.509 certificates. \
Most characters are encoded on a single byte, but diacritics themselves are another \
byte that prefixes the character."
);

export const VIDEOTEX_STRING_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a string encoded with the Videotex character \
set. The official definition of this character set is nebulous, because it was \
never standardized. This data type is deprecated."
);

export const IA5_STRING_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a string encoded with the International \
Reference Alphabet (IRA) character set--formerly known as the \
'International Alphabet No. 5' (IA5)--as specified in the \
[International Telecommunications Union](https://www.itu.int/en/pages/default.aspx)'s\
[T.50 : International Alphabet No. 5](https://www.itu.int/rec/T-REC-T.50-198811-S).\n\
This is very similar to ASCII, but substitutes characters that are specific to \
the United States, like the dollar sign (`$`) for more generic international characters. \
Each character is encoded on a single byte."
);

export const UTC_TIME_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a moment in time. It is represented as a \
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
`9805281429+0200`\n"
);

export const GENERALIZED_TIME_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a moment in time, and is represented as a \
string of the form `YYYYMMDDhhmmss`, where both minutes and seconds are \
optional. A milliseconds component of infinite precision can follow, taking \
the form of a period or comma followed by an infinite sequence of digits \
representing a decimal fraction of a second. Either a `Z` or a timezone may \
follow as a plus or minus with four digits that indicate the hour and minute \
offset from UTC, and where `Z` indicates UTCTime.\n\
Examples:\
`199805281429Z`\n\
`19980528142905Z`\n\
`199805281429+0200`\n"
);

// deprecated (page 182)
export const GRAPHIC_STRING_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a string of the graphical (visible) \
characters, called 'G', registered in the International Register of Coded \
Character Sets to be used with Escape Sequences."
);

export const VISIBLE_STRING_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a string encoded with the character set \
registered as character set number 6 in the International Register, but only \
the visible characters from that character set, meaning that no escape \
characters, now newlines, and no backspaces may be used."
);

// deprecated (page 182)
export const GENERAL_STRING_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a string of the graphical (visible) \
characters, called 'G' and control characters, called 'C', registered in the \
International Register of Coded Character Sets to be used with Escape Sequences."
);

export const UNIVERSAL_STRING_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a string encoded with the UCS-4 character set. \
Each character code point is encoded as a big-endian 32-bit integer on four bytes."
);

export const CHARACTER_STRING_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that is used to change the presentation context defined as:\n\
```asn1\
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
choices will be `CONTEXT-SPECIFIC` and numbered from 0 to 5."
);

export const BMP_STRING_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a string encoded with the UCS-2 character set. \
Each character code point is encoded as a big-endian 16-bit integer on two bytes."
);

export const CHOICE_DEFINITION : MarkdownString = new MarkdownString(
"A structured type that allows a selection from a variety of options."
);

export const DATE_DEFINITION : MarkdownString = new MarkdownString(
"An ISO 8601 Date in the local time:\n\
```asn1\
DATE ::= [UNIVERSAL 31] IMPLICIT TIME (SETTINGS \"Basic=Date Date=YMD Year=Basic\")\
```\n\
This data type is newer and is unlikely to be encountered in ASN.1.\
Its encodings are as follows:\n\
- Eight bytes of the date as ASCII in `YYYYMMDD` format for BER, CER, and DER.\
  No hyphens are encoded, and the value MUST be primitively encoded.\
- Just like the abstract syntax, but without the surrounding quotes in XML\
  Encoding Rules (XER) (restrictions apply with the Canonical XER (CXER))\
- Just like the abstract syntax (as a string) in the JSON Encoding Rules (JER)\
\n\
This type is not recognized in the Generic String Encoding Rules (GSER).\n\
In the Octet Encoding Rules (OER), it is encoded as though it were defined as:\n\
```asn1\
DATE-ENCODING ::= SEQUENCE {\
    year    INTEGER,\
    month   INTEGER (1..12),\
    day     INTEGER (1..31) }\
```\n\
In the Packed Encoding Rules (PER), it is encoded as though it were defined as:\n\
```asn1\
YEAR-ENCODING ::= CHOICE { -- 2 bits for choice determinant\
    immediate   INTEGER (2005..2020), -- 4 bits\
    near-future INTEGER (2021..2276), -- 8 bits\
    near-past   INTEGER (1749..2004), -- 8 bits\
    remainder   INTEGER (MIN..1748 | 2277..MAX) }\
\
DATE-ENCODING ::= SEQUENCE {\
    year    YEAR-ENCODING,\
    month   INTEGER (1..12), -- 4 bits\
    day     INTEGER (1..31) -- 5 bits -- }\
```\n\
"
);

export const DATE_TIME_DEFINITION : MarkdownString = new MarkdownString(
"An ISO 8601 Date-Time in the local time:\n\n\
```asn1\
DATE-TIME ::= [UNIVERSAL 33] IMPLICIT TIME (SETTINGS \"Basic=Date-Time Date=YMD Year=Basic Time=HMS Local-or-UTC=L\")\n\
```\n\n\
This data type is newer and is unlikely to be encountered in ASN.1.\
Its encodings are as follows:\n\
- 14 bytes of the datetime as ASCII in `YYYYMMDDhhmmss` format for BER, CER, and DER.\
  No hyphens, colons, or \"T\" are encoded, and the value MUST be primitively encoded.\
- Just like the abstract syntax, but without the surrounding quotes in XML\
  Encoding Rules (XER) (restrictions apply with the Canonical XER (CXER))\
- Just like the abstract syntax (as a string) in the JSON Encoding Rules (JER)\
\n\
This type is not recognized in the Generic String Encoding Rules (GSER).\n\
In the Packed Encoding Rules (PER) and the Octet Encoding Rules (OER), it is\
encoded as though it were defined as:\n\
```asn1\
DATE-TIME-ENCODING {Date-Type, Time-Type} ::= SEQUENCE {\
    date    Date-Type,\
    time    Time-Type }\
```\n\
"
);

export const TIME_DEFINITION : MarkdownString = new MarkdownString(
"A timestamp recorded as a string in the form specified in ISO 8601, \
Section 3.4."
);

export const TIME_OF_DAY_DEFINITION : MarkdownString = new MarkdownString(
"An ISO 8601 Date in the local time:\n\
```asn1\
TIME-OF-DAY ::= [UNIVERSAL 32] IMPLICIT TIME (SETTINGS \"Basic=Time Time=HMS Local-or-UTC=L\")\
```\n\
This data type is newer and is unlikely to be encountered in ASN.1.\
Its encodings are as follows:\n\
- Six bytes of the time as ASCII in `HHMMSS` format for BER, CER, and DER.\
  No colons are encoded, and the value MUST be primitively encoded.\
- Just like the abstract syntax, but without the surrounding quotes in XML\
  Encoding Rules (XER) (restrictions apply with the Canonical XER (CXER))\
- Just like the abstract syntax (as a string) in the JSON Encoding Rules (JER)\
\n\
This type is not recognized in the Generic String Encoding Rules (GSER).\n\
In the Octet Encoding Rules (OER) and the Packed Encoding Rules (PER), \
it is encoded as though it were defined as:\n\
```asn1\
TIME-OF-DAY-ENCODING ::= SEQUENCE {\
    hours   INTEGER (0..24),\
    minutes INTEGER (0..59),\
    seconds INTEGER (0..60) }\
```\n\
In the Packed Encoding Rules (PER), each component is encoded on five bits.\
"
);

export const DURATION_DEFINITION : MarkdownString = new MarkdownString(
"An ISO 8601 duration:\n\
```asn1\
DURATION ::= [UNIVERSAL 34] IMPLICIT TIME (SETTINGS \"Basic=Interval Interval-type=D\")\
```\n\
This data type is newer and is unlikely to be encountered in ASN.1.\
Its encodings are as follows:\n\
- Just like the abstract value for BER, CER, and DER, but with the leading\
  \"P\" removed. The value MUST be primitively encoded. Further restrictions\
  apply for CER and DER encodings, including using only period `.` for fractions.\
- Just like the abstract syntax, but without the surrounding quotes in XML\
  Encoding Rules (XER) (restrictions apply with the Canonical XER (CXER))\
- Just like the abstract syntax (as a string) in the JSON Encoding Rules (JER)\
\n\
This type is not recognized in the Generic String Encoding Rules (GSER).\n\
In the Octet Encoding Rules (OER), it is encoded as though it were defined as:\n\
```asn1\
DURATION-INTERVAL-ENCODING ::= SEQUENCE {\
    years   INTEGER (0..MAX) OPTIONAL,\
    months  INTEGER (0..MAX) OPTIONAL,\
    weeks   INTEGER (0..MAX) OPTIONAL,\
    days    INTEGER (0..MAX) OPTIONAL,\
    hours   INTEGER (0..MAX) OPTIONAL,\
    minutes INTEGER (0..MAX) OPTIONAL,\
    seconds INTEGER (0..MAX) OPTIONAL,\
    fractional-part SEQUENCE {\
        number-of-digits    INTEGER (0..MAX),\
        fractional-value    INTEGER (0..MAX)\
    } OPTIONAL\
}\
```\n\
In the Packed Encoding Rules (PER), it is encoded as though it were defined as:\n\
```asn1\
DURATION-INTERVAL-ENCODING ::= SEQUENCE { -- 8 bits for optionality\
    years   INTEGER (0..31, ..., 32..MAX) OPTIONAL, -- 5 bits for up to 31 years\
    months  INTEGER (0..15, ..., 16..MAX) OPTIONAL, -- 4 bits for up to 15 months\
    weeks   INTEGER (0..63, ..., 64..MAX) OPTIONAL, -- 6 bits for up to 63 weeks\
    days    INTEGER (0..31, ..., 32..MAX) OPTIONAL, -- 5 bits for up to 31 days\
    hours   INTEGER (0..31, ..., 32..MAX) OPTIONAL, -- 5 bits for up to 31 hours\
    minutes INTEGER (0..63, ..., 64..MAX) OPTIONAL, -- 6 bits for up to 63 minutes\
    seconds INTEGER (0..63, ..., 64..MAX) OPTIONAL, -- 6 bits for up to 63 seconds\
    fractional-part SEQUENCE {\
        number-of-digits    INTEGER(1..3, ..., 4..MAX), -- 3 bits for up to three digits accuracy\
        fractional-value    INTEGER(0..999, ..., 1000..MAX) -- 11 bits for up to three digits accuracy\
    } OPTIONAL }\
```\n\
"
);

export const INSTANCE_OF_DEFINITION : MarkdownString = new MarkdownString(
"An instance of an ASN.1 `CLASS`, which is encoded the same way as an \
`EXTERNAL` and uses the same tag of `UNIVERSAL 8`."
);

export const SEQUENCE_OF_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a list of more ASN.1-encoded elements \
whose ordering in the list matters, in contrast to a `SET`, but where, \
unlike the `SEQUENCE` type, the exact number of elements are not known in \
advance."
);

export const SET_OF_DEFINITION : MarkdownString = new MarkdownString(
"A `UNIVERSAL` type that represents a list of more ASN.1-encoded elements \
whose ordering in the list _does not matter_, in contrast to a `SEQUENCE`, \
and where the exact number of elements are not known in advance."
);

export const TYPE_IDENTIFIER_DEFINITION_STR: string =
`A simple information object class that is "built-in" in ASN.1: you do not have
to import it from somewhere. This information object class simply relates an
object identifier to an ASN.1 data type. It was defined due to the widespread
usage of information object of this particular format.

Objects of this information object class are suitable for use in
\`INSTANCE OF\` types.

### ASN.1 Definition

\`\`\`asn1
TYPE-IDENTIFIER ::= CLASS
{
    &id OBJECT IDENTIFIER UNIQUE,
    &Type
}
WITH SYNTAX {
    &Type
    IDENTIFIED BY &id
}
\`\`\`

`;

export const TYPE_IDENTIFIER_DEFINITION = new MarkdownString(TYPE_IDENTIFIER_DEFINITION_STR);

export const ABSTRACT_SYNTAX_DEFINITION_STR: string =
`A simple information object class that is "built-in" in ASN.1: you do not have
to import it from somewhere. This information object class simply relates an
object identifier to an ASN.1 data type that represents the protocol data units
of that abstract syntax. It differs from \`TYPE-IDENTIFIER\` essentially in
_what_ it defines: \`TYPE-IDENTIFIER\` is used for relating any ASN.1 data type
to an object identifier; \`ABSTRACT-SYNTAX\` is used for relating an abstract
syntax's data type to an object identifier.

Objects of this information object class are suitable for use in
\`INSTANCE OF\` types.

### ASN.1 Definition

\`\`\`asn1
ABSTRACT-SYNTAX ::= CLASS
{
    &id         OBJECT IDENTIFIER UNIQUE,
    &Type,
    &property   BIT STRING {handles-invalid-encodings(0)} DEFAULT {}
}
WITH SYNTAX {
    &Type
    IDENTIFIED BY &id
    [HAS PROPERTY &property]
}
\`\`\`

`;

export const ABSTRACT_SYNTAX_DEFINITION = new MarkdownString(ABSTRACT_SYNTAX_DEFINITION_STR);
