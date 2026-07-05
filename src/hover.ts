import * as vscode from "vscode";
import * as definitions from "./definitions/index.js";
import { getParserOutputsWithLogging } from "./parsing.js";
import {
    getDefinedThingAtPosition,
    getOidNodesFromModuleIdentifier,
    getRangeFromLocation,
    inOpenSyntaxRegion,
    nameAndOrNumberToIriString,
    nameAndOrNumberToString,
    positionFallsWithin,
} from "./utils.js";
import {
    type Assignment,
    AssignmentType,
    builtinRootArcNamesToNumber,
    type Module,
    type NameAndOrNumber,
    type ObjIdComponents,
    type Production,
    TypeType,
    ValueType,
} from "@wildboar/asn1-parser";
import {
    resolveDefined,
    resolveOID,
    resolveOIDComponents,
} from "./resolve.js";
import {
    ASN1Construction,
    ASN1TagClass,
    ASN1UniversalType,
    BERElement,
    ObjectIdentifier,
    utcTimeRegex,
    generalizedTimeRegex,
    DURATION_EQUIVALENT,
} from "@wildboar/asn1";

/**
 * Defined because utcTimeRegex uses the `^` and `$` operators, which does not
 * work with VS Code's `getWordRangeAtPosition`. To get the regular expression
 * without these operators, we simply trim the first and last two characters.
 * The outermost characters are forward slashes, and the second outermost ones
 * are the `^` and `$`.
 */
const wordUTCTimeRegex = new RegExp('"' + utcTimeRegex.toString().slice(2, -2) + '"');

/**
 * Defined because generalizedTimeRegex uses the `^` and `$` operators, which does not
 * work with VS Code's `getWordRangeAtPosition`. To get the regular expression
 * without these operators, we simply trim the first and last two characters.
 * The outermost characters are forward slashes, and the second outermost ones
 * are the `^` and `$`.
 */
const wordGenTimeRegex = new RegExp('"' + generalizedTimeRegex.toString().slice(2, -2) + '"');

/**
 * This doesn't cover all ISO 8601 timestamps, but it _does_ completely cover the
 * `DATE-TIME` data type, which is what we really want.
 */
const wordDateTimeRegex = /"(\d{4})-([0-1]\d)-([0-3]\d)T([0-2]\d)\:([0-5]\d)\:([0-5]\d)"/;

/**
 * Regular expression for `DATE` values.
 */
const wordDateRegex = /"(\d{4})-([0-1]\d)-([0-3]\d)"/;

/**
 * ISO 8601 Duration regex
 */
const wordDurationRegex = /"P[0-9\.,TYWHMS]+"/;

/**
 * Bitstring regex
 */
const wordBitStringRegex = /'[01\s]*'B/;

/**
 * Octet string regex
 */
const wordOctetStringRegex = /'[0-9A-F\s]*'H/;

// TODO: Use this
const keywordsThatMustNotAppearAsLiterals: Set<string> = new Set([
    "ABSTRACT-SYNTAX",
    "BIT",
    "BOOLEAN",
    "CHARACTER",
    "CHOICE",
    "CONTAINING",
    "DATE",
    "DATE-TIME",
    "DURATION",
    "EMBEDDED",
    "END",
    "ENUMERATED",
    "EXTERNAL",
    "FALSE",
    "INSTANCE",
    "INTEGER",
    "MINUS-INFINITY",
    "NOT-A-NUMBER",
    "NULL",
    "OBJECT",
    "OCTET",
    "OID-IRI",
    "PLUS-INFINITY",
    "REAL",
    "RELATIVE-OID",
    "RELATIVE-OID-IRI",
    "SEQUENCE",
    "SET",
    "TIME",
    "TIME-OF-DAY",
    "TRUE",
    "TYPE-IDENTIFIER",
]);

// TODO: Make this just return the strings and let the caller populate the range parameter.
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

So those are fine for unconditional vscode.Hovers, except in comments and strings.

This also means that I can identify the end of modules by searching for the
first END literal that comes after the first BEGIN literal.
*/
const keywordHovers: Map<string, vscode.Hover> = new Map([
    // Booleans
    [ "TRUE", new vscode.Hover(definitions.TRUE_DEFINITION) ],
    [ "FALSE", new vscode.Hover(definitions.FALSE_DEFINITION) ],

    // Tag Classes
    [ "UNIVERSAL", new vscode.Hover(definitions.UNIVERSAL_DEFINTION) ],
    [ "PRIVATE", new vscode.Hover(definitions.PRIVATE_DEFINTION) ],
    [ "APPLICATION", new vscode.Hover(definitions.APPLICATION_DEFINTION) ],
    [ "CONTEXT", new vscode.Hover(definitions.CONTEXT_SPECIFIC_DEFINTION) ],

    // Constraints
    [ "SIZE", new vscode.Hover(definitions.SIZE_DEFINITION) ],
    [ "COMPONENT", new vscode.Hover(definitions.WITH_COMPONENT_DEFINITION) ],
    [ "COMPONENTS", new vscode.Hover(definitions.WITH_COMPONENTS_DEFINITION) ],
    [ "PATTERN", new vscode.Hover(definitions.PATTERN_DEFINITION) ],
    [ "INCLUDES", new vscode.Hover(definitions.INCLUDES_DEFINITION) ],
    [ "FROM", new vscode.Hover(definitions.FROM_DEFINITION) ],
    [ "PRESENT", new vscode.Hover(definitions.PRESENT_DEFINITION) ],
    [ "ABSENT", new vscode.Hover(definitions.ABSENT_DEFINITION) ],
    [ "ENCODED", new vscode.Hover(definitions.ENCODED_BY_DEFINITION) ],
    // [ "ALL EXCEPT", new vscode.Hover(definitions.) ],
    [ "INTERSECTION", new vscode.Hover(definitions.INTERSECTION_DEFINITION) ],
    [ "UNION", new vscode.Hover(definitions.UNION_DEFINITION) ],
    [ "EXCEPT", new vscode.Hover(definitions.EXCEPT_DEFINITION) ],
    [ "CONSTRAINED", new vscode.Hover(definitions.CONSTRAINED_BY_DEFINITION) ],
    [ "DEFAULT", new vscode.Hover(definitions.DEFAULT_DEFINITION) ],
    [ "OPTIONAL", new vscode.Hover(definitions.IMPLICIT_DEFINITION) ],

    // Mode
    [ "EXPLICIT", new vscode.Hover(definitions.EXPLICIT_DEFINITION) ],
    [ "IMPLICIT", new vscode.Hover(definitions.IMPLICIT_DEFINITION) ],

    // Module
    [ "DEFINITIONS", new vscode.Hover(definitions.DEFINITIONS_DEFINITION) ],
    [ "BEGIN", new vscode.Hover(definitions.BEGIN_DEFINITION) ],
    [ "END", new vscode.Hover(definitions.END_DEFINITION) ],
    [ "IMPORTS", new vscode.Hover(definitions.IMPORTS_DEFINITION) ],
    [ "EXPORTS", new vscode.Hover(definitions.EXPORTS_DEFINITION) ],
    // [ "EXPLICIT TAGS", new vscode.Hover(definitions.) ],
    // [ "IMPLICIT TAGS", new vscode.Hover(definitions.) ],
    [ "AUTOMATIC", new vscode.Hover(definitions.AUTOMATIC_TAGS_DEFINITION) ],
    [ "EXTENSIBILITY", new vscode.Hover(definitions.EXTENSIBILITY_IMPLIED_DEFINITION) ],
    [ "IMPLIED", new vscode.Hover(definitions.EXTENSIBILITY_IMPLIED_DEFINITION) ],
    [ "TAGS", new vscode.Hover(definitions.TAGS_DEFINITION) ],

    // Universal Types
    [ "BOOLEAN", new vscode.Hover(definitions.BOOLEAN_DEFINITION) ],
    [ "INTEGER", new vscode.Hover(definitions.INTEGER_DEFINITION) ],
    [ "BIT", new vscode.Hover(definitions.BIT_STRING_DEFINITION) ],
    [ "OCTET", new vscode.Hover(definitions.OCTET_STRING_DEFINITION) ],
    [ "NULL", new vscode.Hover(definitions.NULL_DEFINITION) ],
    // [ "OBJECT", new vscode.Hover(definitions.OBJECT_IDENTIFIER_DEFINITION) ],
    // [ "IDENTIFIER", new vscode.Hover(definitions.OBJECT_IDENTIFIER_DEFINITION) ],
    [ "ObjectDescriptor", new vscode.Hover(definitions.OBJECT_DESCRIPTOR_DEFINITION) ],
    [ "EXTERNAL", new vscode.Hover(definitions.EXTERNAL_DEFINITION) ],
    // [ "External", new vscode.Hover(definitions.EXTERNAL_DEFINITION) ],
    [ "REAL", new vscode.Hover(definitions.REAL_DEFINITION) ],
    [ "EMBEDDED", new vscode.Hover(definitions.EMBEDDED_PDV_DEFINITION) ],
    [ "PDV", new vscode.Hover(definitions.EMBEDDED_PDV_DEFINITION) ],
    [ "EmbeddedPDV", new vscode.Hover(definitions.EMBEDDED_PDV_DEFINITION) ],
    [ "UTF8String", new vscode.Hover(definitions.UTF8_STRING_DEFINITION) ],
    [ "RELATIVE-OID", new vscode.Hover(definitions.RELATIVE_OID_DEFINITION) ],
    [ "SEQUENCE", new vscode.Hover(definitions.SEQUENCE_DEFINITION) ],
    [ "SET", new vscode.Hover(definitions.SET_DEFINITION) ],
    [ "NumericString", new vscode.Hover(definitions.NUMERIC_STRING_DEFINITION) ],
    [ "PrintableString", new vscode.Hover(definitions.PRINTABLE_STRING_DEFINITION) ],
    [ "TeletexString", new vscode.Hover(definitions.T61_STRING_DEFINITION) ],
    [ "T61String", new vscode.Hover(definitions.T61_STRING_DEFINITION) ],
    [ "VideotexString", new vscode.Hover(definitions.VIDEOTEX_STRING_DEFINITION) ],
    [ "ISO646String", new vscode.Hover(definitions.IA5_STRING_DEFINITION) ],
    [ "IA5String", new vscode.Hover(definitions.IA5_STRING_DEFINITION) ],
    [ "UTCTime", new vscode.Hover(definitions.UTC_TIME_DEFINITION) ],
    [ "GeneralizedTime", new vscode.Hover(definitions.GENERALIZED_TIME_DEFINITION) ],
    [ "GraphicString", new vscode.Hover(definitions.GRAPHIC_STRING_DEFINITION) ],
    [ "VisibleString", new vscode.Hover(definitions.VISIBLE_STRING_DEFINITION) ],
    [ "GeneralString", new vscode.Hover(definitions.GENERAL_STRING_DEFINITION) ],
    [ "UniversalString", new vscode.Hover(definitions.UNIVERSAL_STRING_DEFINITION) ],
    [ "CharacterString", new vscode.Hover(definitions.CHARACTER_STRING_DEFINITION) ],
    [ "BMPString", new vscode.Hover(definitions.BMP_STRING_DEFINITION) ],
    [ "CHOICE", new vscode.Hover(definitions.CHOICE_DEFINITION) ],
    [ "DATE", new vscode.Hover(definitions.DATE_DEFINITION) ],
    [ "DATE-TIME", new vscode.Hover(definitions.DATE_TIME_DEFINITION) ],
    [ "TIME", new vscode.Hover(definitions.TIME_DEFINITION) ],
    [ "TIME-OF-DAY", new vscode.Hover(definitions.TIME_OF_DAY_DEFINITION) ],
    [ "DURATION", new vscode.Hover(definitions.DURATION_DEFINITION) ],
    // [ "INSTANCE OF", new vscode.Hover(definitions.) ],
    // [ "SEQUENCE OF", new vscode.Hover(definitions.) ],
    // [ "SET OF", new vscode.Hover(definitions.) ],

    // Values
    [ "MIN", new vscode.Hover(definitions.MIN_DEFINITION) ],
    [ "MAX", new vscode.Hover(definitions.MAX_DEFINITION) ],
    [ "PLUS-INFINITY", new vscode.Hover(definitions.PLUS_INFINITY_DEFINITION) ],
    [ "MINUS-INFINITY", new vscode.Hover(definitions.MINUS_INFINITY_DEFINITION) ],
    [ "NOT-A-NUMBER", new vscode.Hover(definitions.NOT_A_NUMBER_DEFINITION) ],

    // Built-in Information Object Classes
    [ "TYPE-IDENTIFIER", new vscode.Hover(definitions.TYPE_IDENTIFIER_DEFINITION) ],
    [ "ABSTRACT-SYNTAX", new vscode.Hover(definitions.ABSTRACT_SYNTAX_DEFINITION) ],
]);

function provideDumbHover(
    document: vscode.TextDocument,
    position: vscode.Position,
): vscode.Hover | undefined {
    const wordRange = document.getWordRangeAtPosition(position);
    const word: string = document.getText(wordRange);
    return keywordHovers.get(word);
}

const FAIL_MD = new vscode.MarkdownString("Symbol could not be resolved");

async function provideDefinedHover(
    document: vscode.TextDocument,
    cancel: vscode.CancellationToken,
    currentModule: Module,
    modref: string | undefined,
    ident: string,
    definedRange: vscode.Range,
): Promise<vscode.Hover> {
    const res = await resolveDefined(
        cancel,
        modref,
        ident,
        currentModule,
        document.uri,
    );
    if (!res) {
        const impmods = currentModule.imports.modules;
        const sfm = (modref && (impmods[modref]?.identifier === modref))
            ? impmods[modref]
            : Object.values(currentModule.imports.modules ?? {})
                .find((sfm) => ident in sfm.symbolList);
        if (sfm?.production) {
            const loc = sfm.production.location;
            const range = getRangeFromLocation(document, loc);
            const md = new vscode.MarkdownString(
                "Symbol could not be resolved, but it was imported here:\n",
            );
            const codetext = document.getText(range);
            md.appendCodeblock(codetext, "asn1");
            return new vscode.Hover(md, definedRange);
        }
        return new vscode.Hover(FAIL_MD, definedRange);
    }
    const [ assn, _, resuri ] = res;
    if (assn.production?.location) {
        const resdoc = await vscode.workspace.openTextDocument(resuri);
        const loc = assn.production.location;
        const range = getRangeFromLocation(resdoc, loc);
        const md = new vscode.MarkdownString("ASN.1 Definition:\n");
        const restext = resdoc.getText(range);
        md.appendCodeblock(restext, "asn1");
        return new vscode.Hover(md, definedRange);
    }
    return new vscode.Hover(FAIL_MD, definedRange);
}

function constructOidHover(
    document: vscode.TextDocument,
    arcs: NameAndOrNumber[],
    cstnode?: Production,
): vscode.Hover {
    const range = cstnode?.location
        ? getRangeFromLocation(document, cstnode.location)
        : undefined;
    const asn1str = "{ "
        + arcs.map(nameAndOrNumberToString).join(" ")
        + " }";
    const iri = "/" + arcs.map(nameAndOrNumberToIriString).join("/");
    const numbers = getOidNodesFromModuleIdentifier(arcs);
    let mds = "Object Identifier Value\n\n";
    mds += ("ASN.1 Syntax: `" + asn1str + "`\n\n");
    mds += ("IRI Form: `" + iri + "`\n\n");
    if (numbers) {
        const numstr = numbers.join(".");
        mds += ("Numeric-Only Form: `" + numstr + "`\n\n");
        mds += ("XML Value Form: `<OBJECT_IDENTIFIER>" + numstr + "</OBJECT_IDENTIFIER>`\n\n");
        mds += ("XML IRI Value Form: `<OID_IRI>" + iri + "</OID_IRI>`\n\n");
        const oid = ObjectIdentifier.fromParts(numbers);
        const oidhexes = Array.from(oid.toBytes())
            .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
            .join(" ");
        mds += ("BER / CER / DER content octets (as hex): `" + oidhexes + "`\n\n");
        mds += ("[oid-base.com](https://oid-base.com/get/" + numstr + ")");
        mds += " \u{2022} ";
        mds += ("[alvestrand.no](https://www.alvestrand.no/objectid/" + numstr + ".html)");
    }
    const md = new vscode.MarkdownString(mds);
    return new vscode.Hover(md, range);
}

function constructRelativeOidHover(
    document: vscode.TextDocument,
    arcs: NameAndOrNumber[],
    cstnode?: Production,
): vscode.Hover {
    const range = cstnode?.location
        ? getRangeFromLocation(document, cstnode.location)
        : undefined;
    const asn1str = "{ "
        + arcs.map(nameAndOrNumberToString).join(" ")
        + " }";
    const iri = arcs.map(nameAndOrNumberToIriString).join("/");
    const numbers = getOidNodesFromModuleIdentifier(arcs);
    let mds = "Relative Object Identifier Value\n\n";
    mds += ("ASN.1 Syntax: `" + asn1str + "`\n\n");
    mds += ("IRI Form: `" + iri + "`\n\n");
    if (numbers) {
        const numstr = numbers.join(".");
        mds += ("Numeric-Only Form: `" + numstr + "`\n\n");
        mds += ("XML Value Form: `<RELATIVE_OID>" + numstr + "</RELATIVE_OID>`\n\n");
        mds += ("XML IRI Value Form: `<RELATIVE_OID_IRI>" + iri + "</RELATIVE_OID_IRI>`\n\n");
        const oid = ObjectIdentifier.fromParts([ 2, 5, ...numbers ]);
        const oidhexes = Array.from(oid.toBytes().subarray(1))
            .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
            .join(" ");
        mds += ("BER / CER / DER content octets (as hex): `" + oidhexes + "`\n\n");
    }
    const md = new vscode.MarkdownString(mds);
    return new vscode.Hover(md, range);
}

/**
 * @description
 *
 * NOTE: This handles both absolute and relative OIDs.
 *
 * @param document
 * @param cancel
 * @param currentModule
 * @param assn
 * @returns
 */
async function provideOidHover(
    document: vscode.TextDocument,
    cancel: vscode.CancellationToken,
    currentModule: Module,
    assn: Assignment,
    typeType: TypeType,
): Promise<vscode.Hover> {
    // TODO: Support XMLValueAssignment as well
    if (assn.assignmentType !== AssignmentType.ValueAssignment) {
        return Promise.reject(null);
    }
    const value = assn.value;
    let oid: NameAndOrNumber[] | undefined;
    if (value.valueType === ValueType.DefinedValue) {
        const def = value.value;
        oid = await resolveOID(
            cancel,
            def.computedModule ?? def.module,
            def.reference,
            currentModule,
            document.uri,
        );
        if (!oid) {
            return Promise.reject(null);
        }
        return constructOidHover(document, oid, value.production);
    }
    if (typeType === TypeType.RelativeOIDType) {
        let components: ObjIdComponents[];
        if (value.valueType === ValueType.RelativeOIDValue) {
            components = value.value;
        } else if (value.valueType === ValueType.ObjectIdentifierValue) {
            components = value.value.components;
            if (value.value.prefix) {
                components.unshift(value.value.prefix);
            }
        } else {
            return Promise.reject(null);
        }
        const resolvedComponents = await resolveOIDComponents(
            cancel,
            components,
            currentModule,
            document.uri,
        );
        if (!resolvedComponents) {
            return Promise.reject(null);
        }
        if (oid) {
            oid.push(...resolvedComponents);
        } else {
            oid = resolvedComponents;
        }
        return constructRelativeOidHover(document, oid, value.production);
    }
    if (value.valueType === ValueType.ObjectIdentifierValue) {
        const val = value.value;
        if (val.prefix) {
            const prefix = val.prefix;
            // TODO: @wildboar/asn1-parser: fix this
            /* It seems that the built-in OID root arc values can be mistaken
            for the `DefinedValue` prefix. We check for these values here and
            convert them to numbers. */
            if (!prefix.module && builtinRootArcNamesToNumber.has(prefix.reference)) {
                const num = builtinRootArcNamesToNumber.get(prefix.reference);
                oid = [{ name: prefix.reference, number: num }];
            } else {
                oid = await resolveOID(
                    cancel,
                    prefix.module,
                    prefix.reference,
                    currentModule,
                    document.uri,
                );
                if (!oid) {
                    return Promise.reject(null);
                }
            }
        }
        const resolvedComponents = await resolveOIDComponents(
            cancel,
            val.components,
            currentModule,
            document.uri,
        );
        if (!resolvedComponents) {
            return Promise.reject(null);
        }
        if (oid) {
            oid.push(...resolvedComponents);
        } else {
            oid = resolvedComponents;
        }
        return constructOidHover(document, oid, value.production);
    }
    return Promise.reject(null);
}

const ECN_MD = new vscode.MarkdownString(
    "Hovers not provided for upper-cased strings that appear in Encoding "
    + "Control Notation (ECN), because ECN has an open-ended syntax. We "
    + "cannot easily tell if what you're hovering over is a reference "
    + "to an assignment or just a literal.",
);

function provideDateTimeHover(
    typeName: string,
    range: vscode.Range,
    dt: Date,
    s: string,
): vscode.Hover {
    let mds: string = "`" + typeName + "`"
        + " Value\n\n"
        + "Local Time: `"
        + dt.toString()
        + "`\n\nISO 8601 Time: `"
        + dt.toISOString()
        + "`\n\n"
        ;

    let cos: string | undefined;
    if (typeName === "UTCTime") {
        cos = s;
    } else if (typeName === "GeneralizedTime") {
        cos = s;
    } else if (typeName === "DATE-TIME") {
        cos = s
            .replaceAll("-", "")
            .replaceAll(":", "")
            .replaceAll("T", "")
            ;
    }
    if (typeof cos === "string") {
        mds += (
            "BER / CER / DER content octets (as hex): `"
            + Array.from(Buffer.from(cos, "ascii"))
                .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
                .join(" ")
            + "`"
        );
    }
    const md = new vscode.MarkdownString(mds);
    return new vscode.Hover(md, range);
}

function provideDateHover(
    range: vscode.Range,
    dt: Date,
): vscode.Hover {
    const contentString = dt.getFullYear().toString().padStart(4, "0")
        + (dt.getMonth() - 1).toString().padStart(2, "0")
        + dt.getDate().toString().padStart(2, "0")
        ;
    const contentOctets = Buffer.from(contentString, "ascii");
    const str = new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(dt);
    const mds: string = "`DATE` Value for "
        + str
        + "\n\n"
        + "BER / CER / DER content octets (as hex): `"
        + Array.from(contentOctets)
            .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
            .join(" ")
        + "`"
        ;
    const md = new vscode.MarkdownString(mds);
    return new vscode.Hover(md, range);
}

function provideDurationHover(
    range: vscode.Range,
    d: DURATION_EQUIVALENT,
    s: string,
): vscode.Hover {
    let years: string = `${d.years ?? 0}`;
    let months: string = `${d.months ?? 0}`;
    let weeks: string = `${d.weeks ?? 0}`;
    let days: string = `${d.days ?? 0}`;
    let hours: string = `${d.hours ?? 0}`;
    let minutes: string = `${d.minutes ?? 0}`;
    let seconds: string = `${d.seconds ?? 0}`;
    if (
        d.fractional_part
        && (typeof d.fractional_part.fractional_value === "number")
        && (typeof d.fractional_part.number_of_digits === "number")
        && (d.fractional_part.number_of_digits > 0)
        && (d.fractional_part.fractional_value > 0)
    ) {
        const fracstr = "." + d
            .fractional_part
            .fractional_value
            .toString()
            .padStart(d.fractional_part.number_of_digits, "0");
        if (typeof d.seconds !== "undefined") {
            seconds += fracstr;
        } else if (typeof d.minutes !== "undefined") {
            minutes += fracstr;
        } else if (typeof d.hours !== "undefined") {
            hours += fracstr;
        } else if (typeof d.days !== "undefined") {
            days += fracstr;
        } else if (typeof d.weeks !== "undefined") {
            weeks += fracstr;
        } else if (typeof d.months !== "undefined") {
            months += fracstr;
        } else if (typeof d.years !== "undefined") {
            years += fracstr;
        }
    }
    const mds: string = "`DURATION` Value\n\n"
        + `- Years: ${years}\n`
        + `- Months: ${months}\n`
        + `- Weeks: ${weeks}\n`
        + `- Days: ${days}\n`
        + `- Hours: ${hours}\n`
        + `- Minutes: ${minutes}\n`
        + `- Seconds: ${seconds}\n`
        + "\n"
        + "BER / CER / DER content octets (as hex): `"
        + Array.from(Buffer.from(s, "ascii"))
            .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
            .join(" ")
        + "`"
        ;
    const md = new vscode.MarkdownString(mds);
    return new vscode.Hover(md, range);
}

function provideBitStringHover(
    range: vscode.Range,
    s: string,
): vscode.Hover {
    const sOnlyBits = s
        .slice(1, -2)
        .replaceAll(/\s+/g, "")
        ;
    const sbits = Array.from(sOnlyBits).map((c) => (c.charCodeAt(0) - 0x30));
    const sbuf = new Uint8ClampedArray(sbits);
    const el = new BERElement(
        ASN1TagClass.universal,
        ASN1Construction.primitive,
        ASN1UniversalType.duration,
        sbuf,
    );
    const contentOctets = el.value;
    const mds: string = "`BIT STRING` Value:\n\n"
        + "BER / DER content octets (as hex): `"
        + Array.from(contentOctets)
            .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
            .join(" ")
        + "`"
        ;
    const md = new vscode.MarkdownString(mds);
    return new vscode.Hover(md, range);
}

function provideOctetStringHover(
    range: vscode.Range,
    s: string,
): vscode.Hover {
    const sOnlyNybbles = s
        .slice(1, -2)
        .replaceAll(/\s+/g, "")
        ;
    const bytes = Buffer.from(sOnlyNybbles, "hex");
    const mds: string = "`OCTET STRING` Value:\n\n"
        + "BER / DER content octets (as hex): `"
        + Array.from(bytes)
            .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
            .join(" ")
        + "`"
        ;
    const md = new vscode.MarkdownString(mds);
    return new vscode.Hover(md, range);
}

async function provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    cancel: vscode.CancellationToken,
): Promise<vscode.Hover> {
    const line = document.lineAt(position.line);
    const lineBeforeCursor = line.text.slice(0, position.character);
    if (inOpenSyntaxRegion(lineBeforeCursor)) {
        // Don't provide hovers, because we are in a comment
        // or string or something.
        return Promise.reject(null);
    }

    // Provide hovers for UTCTime-like strings, even if the module is malformed.
    const utcTimeRange = document.getWordRangeAtPosition(position, wordUTCTimeRegex);
    if (utcTimeRange) {
        const s = document.getText(utcTimeRange);
        const sNoQuotes = s.slice(1, -1);
        const el = new BERElement(
            ASN1TagClass.universal,
            ASN1Construction.primitive,
            ASN1UniversalType.utcTime,
            sNoQuotes,
        );
        try {
            const t = el.utcTime;
            return provideDateTimeHover("UTCTime", utcTimeRange, t, sNoQuotes);
        } catch {}
    }

    // Provide hovers for GeneralizedTime-like strings, even if the module is malformed.
    const genTimeRange = document.getWordRangeAtPosition(position, wordGenTimeRegex);
    if (genTimeRange) {
        const s = document.getText(genTimeRange);
        const sNoQuotes = s.slice(1, -1);
        const el = new BERElement(
            ASN1TagClass.universal,
            ASN1Construction.primitive,
            ASN1UniversalType.generalizedTime,
            sNoQuotes,
        );
        try {
            const t = el.generalizedTime;
            return provideDateTimeHover("GeneralizedTime", genTimeRange, t, sNoQuotes);
        } catch {}
    }

    // Provide hovers for DATE-TIME-like strings, even if the module is malformed.
    const dateTimeRange = document.getWordRangeAtPosition(position, wordDateTimeRegex);
    if (dateTimeRange) {
        const s = document.getText(dateTimeRange);
        const sNoQuotes = s.slice(1, -1);
        try {
            const t = new Date(sNoQuotes); // Yes, this makes it local time.
            return provideDateTimeHover("DATE-TIME", dateTimeRange, t, sNoQuotes);
        } catch {}
    }

    // Provide hovers for DATE-like strings, even if the module is malformed.
    // Note that this MUST appear after the DATE-TIME hover.
    const dateRange = document.getWordRangeAtPosition(position, wordDateRegex);
    if (dateRange) {
        const s = document.getText(dateRange);
        const sNoQuotes = s.slice(1, -1);
        try {
            const t = new Date(sNoQuotes);
            return provideDateHover(dateRange, t);
        } catch {}
    }

    // Provide hovers for DURATION-like strings, even if the module is malformed.
    const durationRange = document.getWordRangeAtPosition(position, wordDurationRegex);
    if (durationRange) {
        const s = document.getText(durationRange);
        const sNoQuotes = s.slice(1, -1);
        const el = new BERElement(
            ASN1TagClass.universal,
            ASN1Construction.primitive,
            ASN1UniversalType.duration,
            sNoQuotes.slice(1), // Not encoded with the leading P
        );
        try {
            const d = el.duration;
            return provideDurationHover(durationRange, d, sNoQuotes.slice(1));
        } catch {}
    }

    // Provide hovers for Bit string-like strings, even if the module is malformed.
    const bitStringRange = document.getWordRangeAtPosition(position, wordBitStringRegex);
    if (bitStringRange) {
        const s = document.getText(bitStringRange);
        return provideBitStringHover(bitStringRange, s);
    }

    const octetStringRange = document.getWordRangeAtPosition(position, wordOctetStringRegex);
    if (octetStringRange) {
        const s = document.getText(octetStringRange);
        return provideOctetStringHover(octetStringRange, s);
    }

    const dumbHover2 = provideDumbHover(document, position);
    if (dumbHover2) {
        return Promise.resolve(dumbHover2);
    }

    const p = await getParserOutputsWithLogging(document.uri, cancel);
    if (!p) {
        const dumbHover = provideDumbHover(document, position);
        if (dumbHover) {
            return Promise.resolve(dumbHover);
        } else {
            return Promise.reject(null);
        }
    }
    const modules = p.parsedModules;
    const cst = p.parserEndState.cst;
    const currentModule = modules
        .find((mod) => (
            mod.production
            && positionFallsWithin(document, position, mod.production)
        ));
    if (!currentModule) {
        // User selected a position that does not fall within a module
        const dumbHover = provideDumbHover(document, position);
        if (dumbHover) {
            return Promise.resolve(dumbHover);
        }
        return Promise.reject(null);
    }

    const wordRange = document.getWordRangeAtPosition(position);
    const wordText = wordRange && document.getText(wordRange);

    // TODO: This might be useful for other language features. Consider refactoring it out.
    const ecnprod = currentModule.production!.children
        .find((child) => child.type === 'EncodingControlSections');
    if (
        ecnprod
        && positionFallsWithin(document, position, ecnprod)
        && wordText
        && (wordText !== "ENCODING-CONTROL")
        && (wordText.toUpperCase() === wordText)
    ) {
        /* This is an upper-cased word that appears in an encoding control
        notation (ECN) section, which could be anything. We will treat it
        as a literal and not provide hovers for it. */
        return new vscode.Hover(
            ECN_MD,
            getRangeFromLocation(document, ecnprod.location),
        );
    }

    const assignments = Object.values(currentModule.assignments);
    const currentAssignment = assignments
        .find((assn) => (
            assn.production
            && positionFallsWithin(document, position, assn.production)
        ));
    if (!currentAssignment) {
        const dumbHover = provideDumbHover(document, position);
        if (dumbHover) {
            return Promise.resolve(dumbHover);
        }
        return Promise.reject(null);
    }

    const assnType = currentAssignment.assignmentType;
    if (
        (
            (assnType === AssignmentType.ObjectAssignment)
            || (assnType === AssignmentType.ParameterizedObjectAssignment)
        )
        && currentAssignment.production
    ) {
        const assnprod = currentAssignment.production;
        const objprod = assnprod.children[assnprod.children.length - 1];
        if (
            (objprod.type === "Object")
            && positionFallsWithin(document, position, objprod)
        ) {
            const obj = currentAssignment.object;
            // if ("reference" in obj) {
            //     // This should already be handled.
            //     return Promise.reject(null);
            // }
            if ("fieldSettings" in obj) {
                // Currently not handled. This is super rare to see.
                return Promise.reject(null);
            }
            if ("tokens" in obj) {
                // currentAssignment.definedObjectClass.reference
                // TODO: Use some known object classes, such as ATTRIBUTE, to provide hovers for some literals.
                if (
                    wordText
                    && (wordText.toUpperCase() === wordText)
                ) { // Looks like a literal. Do not provide hover.
                    return Promise.reject(null);
                }
            }

        }
    }

    if (assnType === AssignmentType.ValueAssignment && currentAssignment.value.production) {
        const valueProd = currentAssignment.value.production;
        // If the user is hovering over the value.
        if (positionFallsWithin(document, position, valueProd)) {
            let looksLikeOID: boolean = false;
            if (
                (currentAssignment.type.typeType === TypeType.DefinedType)
            ) {
                const typdef = currentAssignment.type.type;
                const def = await resolveDefined(
                    cancel,
                    typdef.computedModule ?? typdef.module,
                    typdef.reference,
                    currentModule,
                    document.uri,
                );
                if (!def) {
                    // Just return here. It will fail later anyway.
                    return Promise.reject(null);
                }
                const [ defassn, defmod, defuri ] = def;
                looksLikeOID = (
                    (defassn.assignmentType === AssignmentType.TypeAssignment)
                    && (
                        (defassn.type.typeType === TypeType.ObjectIdentifierType)
                        || (defassn.type.typeType === TypeType.RelativeOIDType)
                    )
                );
            }
            if (
                looksLikeOID
                || (currentAssignment.type.typeType === TypeType.ObjectIdentifierType)
                || (currentAssignment.type.typeType === TypeType.RelativeOIDType)
            ) {
                return provideOidHover(
                    document,
                    cancel,
                    currentModule,
                    currentAssignment,
                    currentAssignment.type.typeType,
                );
            }
            if (
                currentAssignment.type.typeType === TypeType.IntegerType
                && currentAssignment.value.valueType === ValueType.IntegerValue
                && (typeof currentAssignment.value.value === "number")
            ) {
                const int = currentAssignment.value.value;
                const el = new BERElement(
                    ASN1TagClass.universal,
                    ASN1Construction.primitive,
                    ASN1UniversalType.integer,
                    int,
                );
                const range = getRangeFromLocation(
                    document,
                    currentAssignment.value.production.location,
                );
                const mds = new vscode.MarkdownString(
                    "`INTEGER` value\n\nBER / CER / DER content octets (as hex): `"
                    + Array.from(el.value)
                        .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
                        .join(" ")
                    + "`"
                );
                return new vscode.Hover(mds, range);
            }
        }
    }

    if (currentAssignment.identifier === wordText) {
        // We don't want an assignment to provide a hover to itself.
        return Promise.reject(null);
    }

    const defined = getDefinedThingAtPosition(cancel, document, position, cst, undefined, true);
    if (defined) {
        const [ modref, ident, defprod ] = defined;
        return provideDefinedHover(
            document,
            cancel,
            currentModule,
            modref,
            ident,
            getRangeFromLocation(document, defprod.location!),
        );
    }

    // If all else fails, provide dumb hover.
    const dumbHover = provideDumbHover(document, position);
    if (dumbHover) {
        return Promise.resolve(dumbHover);
    } else {
        return Promise.reject(null);
    }
}

export
class ASN1HoverProvider implements vscode.HoverProvider {
    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
    ): Thenable<vscode.Hover> {
        return provideHover(document, position, token);
    }
}
