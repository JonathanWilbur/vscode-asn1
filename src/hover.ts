import * as vscode from "vscode";
import * as definitions from "./definitions/index.js";
import { getParserOutputs } from "./parsing.js";
import {
    getDefinedThingAtPosition,
    getOidNodesFromModuleIdentifier,
    getRangeFromLocation,
    positionFallsWithin,
} from "./utils.js";
import {
    Assignment,
    AssignmentType,
    builtinRootArcNamesToNumber,
    Module,
    NameAndOrNumber,
    Production,
    TypeType,
    ValueType,
} from "@wildboar/asn1-parser";
import { resolveDefined, resolveOID, resolveOIDComponents } from "./resolve.js";
import { ObjectIdentifier } from "@wildboar/asn1";

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

function nameAndOrNumberToString(nn: NameAndOrNumber): string {
    if ("name" in nn && typeof nn.name === "string") {
        let ret: string = nn.name;
        if ("number" in nn) {
            ret += `(${nn.number})`;
        }
        return ret;
    } else if ("number" in nn) {
        return nn.number.toString();
    } else {
        return "?";
    }
}

function nameAndOrNumberToIriString(nn: NameAndOrNumber): string {
    if (("name" in nn) && (typeof nn.name === "string") && nn.name.length) {
        return nn.name;
    } else if ("number" in nn) {
        return nn.number.toString();
    }
    return "?";
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
        const oid = ObjectIdentifier.fromParts(numbers);
        const oidhexes = Array.from(oid.toBytes())
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join(" ");
        mds += ("BER / CER / DER encoding (as hex): `" + oidhexes + "`\n\n");
        mds += ("[oid-base.com](https://oid-base.com/get/" + numstr + ")");
        mds += " \u{2022} ";
        mds += ("[alvestrand.no](https://www.alvestrand.no/objectid/" + numstr + ".html)");
    }
    const md = new vscode.MarkdownString(mds);
    return new vscode.Hover(md, range);
}

async function provideOidHover(
    document: vscode.TextDocument,
    cancel: vscode.CancellationToken,
    currentModule: Module,
    assn: Assignment,
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

async function provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    cancel: vscode.CancellationToken,
): Promise<vscode.Hover> {
    const p = await getParserOutputs(document.uri, undefined, cancel);
    if (
        !p.parserEndState
        || ("err" in p.parserEndState)
        || p.parserEndState.ok.error
        || (Object.keys(p.parserEndState.ok.syntaxErrors ?? {}).length > 0)
        || !p.parsedModules
        || ("err" in p.parsedModules)
    ) {
        const dumbHover = provideDumbHover(document, position);
        if (dumbHover) {
            return Promise.resolve(dumbHover);
        } else {
            return Promise.reject(null);
        }
    }
    const modules = p.parsedModules.ok;
    const cst = p.parserEndState.ok.cst;
    const currentModule = modules
        .find((mod) => (
            mod.production
            && positionFallsWithin(document, position, mod.production)
        ));
    if (!currentModule) {
        // User selected a position that does not fall within a module
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
                    && (defassn.type.typeType === TypeType.ObjectIdentifierType)
                );
            }
            if (looksLikeOID || (currentAssignment.type.typeType === TypeType.ObjectIdentifierType)) {
                return provideOidHover(
                    document,
                    cancel,
                    currentModule,
                    currentAssignment,
                );
            }
            if (currentAssignment.type.typeType === TypeType.IntegerType) {
                // TODO: Resolve `INTEGER` values and show their encoding
            }
            // TODO: Resolve TIME types and show their encodings
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
