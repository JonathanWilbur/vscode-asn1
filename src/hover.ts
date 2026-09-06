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
    keywordsForbiddenAsLiterals,
    ProductionType,
    type Defined,
    translateDefinedSyntaxToDefaultSyntax,
    type DefinedSyntax,
    type Setting,
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

/**
 * @summary Mapping of ASN.1 keywords to hover markdown strings
 * @description
 * ITU-T Rec. X.681, Section 10.6, says that these words MUST NOT appear as word literals in objects:
 * 
 * - `ABSTRACT-SYNTAX`
 * - `BIT`
 * - `BOOLEAN`
 * - `CHARACTER`
 * - `CHOICE`
 * - `CONTAINING`
 * - `DATE`
 * - `DATE-TIME`
 * - `DURATION`
 * - `EMBEDDED`
 * - `END`
 * - `ENUMERATED`
 * - `EXTERNAL`
 * - `FALSE`
 * - `INSTANCE`
 * - `INTEGER`
 * - `MINUS-INFINITY`
 * - `NOT-A-NUMBER`
 * - `NULL`
 * - `OBJECT`
 * - `OCTET`
 * - `OID-IRI`
 * - `PLUS-INFINITY`
 * - `REAL`
 * - `RELATIVE-OID`
 * - `RELATIVE-OID-IRI`
 * - `SEQUENCE`
 * - `SET`
 * - `TIME`
 * - `TIME-OF-DAY`
 * - `TRUE`
 * - `TYPE-IDENTIFIER`
 * 
 * So those are fine for unconditional vscode.Hovers, except in comments and strings.
 * 
 * This also means that I can identify the end of modules by searching for the
 * first END literal that comes after the first BEGIN literal.
*/
const keywordHovers: Map<string, vscode.MarkdownString> = new Map([
    // Booleans
    [ "TRUE", definitions.TRUE_DEFINITION ],
    [ "FALSE", definitions.FALSE_DEFINITION ],

    // Tag Classes
    [ "UNIVERSAL", definitions.UNIVERSAL_DEFINITION ],
    [ "PRIVATE", definitions.PRIVATE_DEFINITION ],
    [ "APPLICATION", definitions.APPLICATION_DEFINITION ],
    [ "CONTEXT", definitions.CONTEXT_SPECIFIC_DEFINITION ],

    // Constraints
    [ "SIZE", definitions.SIZE_DEFINITION ],
    [ "COMPONENT", definitions.WITH_COMPONENT_DEFINITION ],
    [ "COMPONENTS", definitions.WITH_COMPONENTS_DEFINITION ],
    [ "PATTERN", definitions.PATTERN_DEFINITION ],
    [ "INCLUDES", definitions.INCLUDES_DEFINITION ],
    [ "FROM", definitions.FROM_DEFINITION ],
    [ "PRESENT", definitions.PRESENT_DEFINITION ],
    [ "ABSENT", definitions.ABSENT_DEFINITION ],
    [ "ENCODED", definitions.ENCODED_BY_DEFINITION ],
    // [ "ALL EXCEPT", definitions.) ],
    [ "INTERSECTION", definitions.INTERSECTION_DEFINITION ],
    [ "UNION", definitions.UNION_DEFINITION ],
    [ "EXCEPT", definitions.EXCEPT_DEFINITION ],
    [ "CONSTRAINED", definitions.CONSTRAINED_BY_DEFINITION ],
    [ "DEFAULT", definitions.DEFAULT_DEFINITION ],
    [ "OPTIONAL", definitions.IMPLICIT_DEFINITION ],

    // Mode
    [ "EXPLICIT", definitions.EXPLICIT_DEFINITION ],
    [ "IMPLICIT", definitions.IMPLICIT_DEFINITION ],

    // Module
    [ "DEFINITIONS", definitions.DEFINITIONS_DEFINITION ],
    [ "BEGIN", definitions.BEGIN_DEFINITION ],
    [ "END", definitions.END_DEFINITION ],
    [ "IMPORTS", definitions.IMPORTS_DEFINITION ],
    [ "EXPORTS", definitions.EXPORTS_DEFINITION ],
    // [ "EXPLICIT TAGS", definitions.) ],
    // [ "IMPLICIT TAGS", definitions.) ],
    [ "AUTOMATIC", definitions.AUTOMATIC_TAGS_DEFINITION ],
    [ "EXTENSIBILITY", definitions.EXTENSIBILITY_IMPLIED_DEFINITION ],
    [ "IMPLIED", definitions.EXTENSIBILITY_IMPLIED_DEFINITION ],
    [ "TAGS", definitions.TAGS_DEFINITION ],

    // Universal Types
    [ "BOOLEAN", definitions.BOOLEAN_DEFINITION ],
    [ "INTEGER", definitions.INTEGER_DEFINITION ],
    [ "BIT", definitions.BIT_STRING_DEFINITION ],
    [ "OCTET", definitions.OCTET_STRING_DEFINITION ],
    [ "NULL", definitions.NULL_DEFINITION ],
    // [ "OBJECT", definitions.OBJECT_IDENTIFIER_DEFINITION ],
    // [ "IDENTIFIER", definitions.OBJECT_IDENTIFIER_DEFINITION ],
    [ "ObjectDescriptor", definitions.OBJECT_DESCRIPTOR_DEFINITION ],
    [ "EXTERNAL", definitions.EXTERNAL_DEFINITION ],
    // [ "External", definitions.EXTERNAL_DEFINITION ],
    [ "REAL", definitions.REAL_DEFINITION ],
    [ "EMBEDDED", definitions.EMBEDDED_PDV_DEFINITION ],
    [ "PDV", definitions.EMBEDDED_PDV_DEFINITION ],
    [ "EmbeddedPDV", definitions.EMBEDDED_PDV_DEFINITION ],
    [ "UTF8String", definitions.UTF8_STRING_DEFINITION ],
    [ "RELATIVE-OID", definitions.RELATIVE_OID_DEFINITION ],
    [ "SEQUENCE", definitions.SEQUENCE_DEFINITION ],
    [ "SET", definitions.SET_DEFINITION ],
    [ "NumericString", definitions.NUMERIC_STRING_DEFINITION ],
    [ "PrintableString", definitions.PRINTABLE_STRING_DEFINITION ],
    [ "TeletexString", definitions.T61_STRING_DEFINITION ],
    [ "T61String", definitions.T61_STRING_DEFINITION ],
    [ "VideotexString", definitions.VIDEOTEX_STRING_DEFINITION ],
    [ "ISO646String", definitions.IA5_STRING_DEFINITION ],
    [ "IA5String", definitions.IA5_STRING_DEFINITION ],
    [ "UTCTime", definitions.UTC_TIME_DEFINITION ],
    [ "GeneralizedTime", definitions.GENERALIZED_TIME_DEFINITION ],
    [ "GraphicString", definitions.GRAPHIC_STRING_DEFINITION ],
    [ "VisibleString", definitions.VISIBLE_STRING_DEFINITION ],
    [ "GeneralString", definitions.GENERAL_STRING_DEFINITION ],
    [ "UniversalString", definitions.UNIVERSAL_STRING_DEFINITION ],
    [ "CharacterString", definitions.CHARACTER_STRING_DEFINITION ],
    [ "BMPString", definitions.BMP_STRING_DEFINITION ],
    [ "CHOICE", definitions.CHOICE_DEFINITION ],
    [ "DATE", definitions.DATE_DEFINITION ],
    [ "DATE-TIME", definitions.DATE_TIME_DEFINITION ],
    [ "TIME", definitions.TIME_DEFINITION ],
    [ "TIME-OF-DAY", definitions.TIME_OF_DAY_DEFINITION ],
    [ "DURATION", definitions.DURATION_DEFINITION ],
    // [ "INSTANCE OF", definitions.) ],
    // [ "SEQUENCE OF", definitions.) ],
    // [ "SET OF", definitions.) ],

    // Values
    [ "MIN", definitions.MIN_DEFINITION ],
    [ "MAX", definitions.MAX_DEFINITION ],
    [ "PLUS-INFINITY", definitions.PLUS_INFINITY_DEFINITION ],
    [ "MINUS-INFINITY", definitions.MINUS_INFINITY_DEFINITION ],
    [ "NOT-A-NUMBER", definitions.NOT_A_NUMBER_DEFINITION ],

    // Built-in Information Object Classes
    [ "TYPE-IDENTIFIER", definitions.TYPE_IDENTIFIER_DEFINITION ],
    [ "ABSTRACT-SYNTAX", definitions.ABSTRACT_SYNTAX_DEFINITION ],
]);

/**
 * @summary Provide hover that doesn't rely on parsing the document
 * @description
 * 
 * This function can be thought of as a sort of "fallback." It is designed for
 * use when the ASN.1 is syntactically invalid to provide some modicum of hover
 * information anyway.
 *
 * @param document The current text document
 * @param position The current cursor position
 * @returns Hover information as a `vscode.Hover`, or `undefined` if none could
 *  be returned.
 * @function
 */
function provideDumbHover(
    document: vscode.TextDocument,
    position: vscode.Position,
): vscode.Hover | undefined {
    const wordRange = document.getWordRangeAtPosition(position);
    const word: string = document.getText(wordRange);
    const md = keywordHovers.get(word);
    if (!md) {
        return undefined;
    }
    return new vscode.Hover(md, wordRange);
}

const FAIL_MD = new vscode.MarkdownString("Symbol could not be resolved");

/**
 * @summary Provide hover information for a `Defined*` production
 * @param document The current text document
 * @param cancel The cancellation token
 * @param currentModule The current ASN.1 module
 * @param modref The module reference in the `Defined*`
 * @param ident The identifier in the `Defined*` for which to provide hover info
 * @param definedRange The range of the entire `Defined*` production
 * @returns A promise that resolves to hover information as a `vscode.Hover`
 * @async
 * @function
 */
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

/**
 * @summary Create hover information for an `OBJECT IDENTIFIER` value
 * @param document The current text document
 * @param arcs Arcs of the `OBJECT IDENTIFIER`
 * @param cstnode The Concrete Syntax Tree (CST) node for the value
 * @returns Hover information as a `vscode.Hover`
 * @function
 */
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

/**
 * @summary Create hover information for a `RELATIVE-OID` value
 * @param document The current text document
 * @param arcs Arcs of the `RELATIVE-OID`
 * @param cstnode The Concrete Syntax Tree (CST) node for the value
 * @returns Hover information as a `vscode.Hover`
 * @function
 */
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
 * @summary Provide hover information for an `OBJECT IDENTIFIER` or `RELATIVE-OID`
 * @description
 *
 * NOTE: This handles both absolute and relative OIDs.
 *
 * @param document The current text document
 * @param cancel The cancellation token
 * @param currentModule The current ASN.1 module
 * @param assn The current ASN.1 assignment
 * @param typeType The ASN.1 type type of the current assignment
 * @returns A promise that resolves to hover information as a `vscode.Hover`
 * @async
 * @function
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

/**
 * @summary Provide hover information for a `DATE-TIME` value
 * @param typeName The name of the type
 * @param range The range within the document of the `tstring`
 * @param dt The `DATE-TIME` string, decoded as a Javascript `Date` object
 * @param s The `tstring`, EXCLUDING the quotes
 * @returns Hover information as a `vscode.Hover`
 * @function
 */
function provideDateTimeHover(
    typeName: "UTCTime" | "GeneralizedTime" | "DATE-TIME",
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

/**
 * @summary Provide hover information for a `DATE` value
 * @param range The range within the document of the `tstring`
 * @param dt The `DATE` string, decoded as a Javascript `Date` object
 * @returns Hover information as a `vscode.Hover`
 * @function
 */
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

/**
 * @summary Provide hover information for a `DURATION` value
 * @param range The range within the document of the `bstring`
 * @param d The `DURATION` value, decoded into a `DURATION_EQUIVALENT`
 * @param s The text of the value including the quotes
 * @returns Hover information as a `vscode.Hover`
 * @function
 */
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

/**
 * @summary Provide hover information for a `BIT STRING` value
 * @param range The range within the document of the `bstring`
 * @param s The text of the `bstring`, including single quotes and `B`
 * @returns Hover information as a `vscode.Hover`
 * @function
 */
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

/**
 * @summary Provide hover information for an `OCTET STRING` value
 * @param range The range within the document of the `hstring`
 * @param s The text of the `hstring`, including single quotes and `H`
 * @returns Hover information as a `vscode.Hover`
 * @function
 */
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

function getTextFromSetting(s: Setting, documentText: string): string | null {
    const text = 
        s.text
        || (("type" in s) && ("text" in s.type) && s.type.text)
        || (("value" in s) && ("text" in s.value) && s.value.text)
        || (("object" in s) && ("text" in s.object) && s.object.text)
        || (("objectSet" in s) && ("text" in s.objectSet) && s.objectSet.text)
        || (("valueSet" in s) && ("text" in s.valueSet) && s.valueSet.text)
        ;
    if (text) {
        return text;
    }
    const prod =
        s.production
        ?? (("type" in s) && ("production" in s.type) && s.type.production)
        ?? (("value" in s) && ("production" in s.value) && s.value.production)
        ?? (("object" in s) && ("production" in s.object) && s.object.production)
        ?? (("objectSet" in s) && ("production" in s.objectSet) && s.objectSet.production)
        ?? (("valueSet" in s) && ("production" in s.valueSet) && s.valueSet.production)
        ;
    if (prod) {
        const loc = prod.location;
        return documentText.slice(loc.startIndex, loc.endIndex);
    }
    return null;
}

async function provideDefaultSyntaxHover(
    cancel: vscode.CancellationToken,
    document: vscode.TextDocument,
    currentModule: Module,
    objectClassRef: Defined,
    obj: DefinedSyntax,
    range?: vscode.Range,
): Promise<vscode.Hover | null> {
    if (objectClassRef.parameters?.length) {
        return null;
    }
    const ocresolved = await resolveDefined(
        cancel,
        objectClassRef.module ?? objectClassRef.computedModule,
        objectClassRef.reference,
        currentModule,
        document.uri,
    );
    if (!ocresolved) {
        return null;
    }
    const [ ocassn ] = ocresolved;
    if (
        (ocassn.assignmentType !== AssignmentType.ObjectClassAssignment)
        || ocassn.parameters?.length
        || !("syntax" in ocassn.objectClass)
        || !ocassn.objectClass.syntax
    ) {
        return null;
    }
    const syntax = ocassn.objectClass.syntax;
    // ObjectClass ::= DefinedObjectClass | ObjectClassDefn | ParameterizedObjectClass
    const [translation] = translateDefinedSyntaxToDefaultSyntax(obj, syntax, currentModule);
    if (!translation) {
        return null;
    }
    const longestFieldName = Object.keys(translation.fieldSettings)
        .map((fn) => fn.length)
        .reduce((prev, curr) => curr > prev ? curr : prev, 0);
    const fieldNameColumnWidth = longestFieldName;
    const text = document.getText();
    const fieldSettings: string[] = [];
    for (const [fn, fv] of Object.entries(translation.fieldSettings)) {
        const fvtext = getTextFromSetting(fv, text);
        if (!fvtext) {
            return null;
        }
        const fieldSetting = `  ${fn.padEnd(fieldNameColumnWidth, " ")} ${fvtext}`;
        fieldSettings.push(fieldSetting);
    }

    const mds = new vscode.MarkdownString();
    mds.appendMarkdown("ASN.1 information object of class `" + ocassn.identifier + "`\n\n");
    mds.appendMarkdown("## Default Syntax Equivalent\n\n");
    const codeblock = "{\n" + fieldSettings.join(",\n") + "\n}";
    mds.appendCodeblock(codeblock, "asn1");
    return new vscode.Hover(mds, range);
}

/**
 * @summary Provide information on hover
 * @param document The current text document
 * @param position The cursor position
 * @param cancel The cancellation token
 * @returns A promise that resolves to hover information
 * @async
 * @function
 */
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
            if ("fieldSettings" in obj) {
                return Promise.reject(null);
            }
            if ("tokens" in obj) {
                if (
                    wordText
                    && (wordText.toUpperCase() === wordText)
                    && !keywordsForbiddenAsLiterals.has(wordText as ProductionType)
                ) {
                    // Looks like a literal.
                    // Attempt to translate defined syntax into default syntax
                    // and display a hover containing the default syntax.
                    const defaultSyntaxHover = await provideDefaultSyntaxHover(
                        cancel,
                        document,
                        currentModule,
                        currentAssignment.definedObjectClass,
                        obj,
                        wordRange,
                    );
                    if (defaultSyntaxHover) {
                        return defaultSyntaxHover;
                    } else {
                        // Failed to translate to default syntax
                        return Promise.reject(null);
                    }
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
