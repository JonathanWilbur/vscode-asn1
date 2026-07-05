import * as vscode from "vscode";
import { getParserOutputs } from "./parsing.js";
import {
    getRangeFromLocation,
    typeTypesThatCouldBeAnything,
} from "./utils.js";
import {
    parserFor,
    grokerFor,
    type Assignment,
    AssignmentType,
    type ComponentType,
    type Defined,
    type Module,
    type NamedNumber,
    type NamedType,
    Production,
    createGrokContext,
    type TypeAssignment,
    TypeType,
    type ValueAssignment,
    type Value,
    ValueType,
    type Location as Asn1ParserLocation,
    type ObjectIdentifierValue,
    builtinRootArcNamesToNumber,
    type ObjIdComponents,
    ASN1SemanticError,
    ASN1SyntaxError,
    ASN1ParserExpectationError,
    isDefinedOrImported,
} from "@wildboar/asn1-parser";
import { resolveDefinedInstantly } from "./resolve.js";
import { maybeReparse } from "./reparse.js";
import log from "./logging.js";
import { DATE_REGEX, TIME_REGEX } from "./time.js";
import { ASN1Construction, ASN1TagClass, ASN1UniversalType, BERElement } from "@wildboar/asn1";

const LANGUAGE: string = "asn1";

export let diagnosticCollection = vscode.languages.createDiagnosticCollection(LANGUAGE);

export const DIAG_CODE_IMPORT_SYMBOL_DUP: string = "E0001";
export const DIAG_CODE_IMPORT_SYMBOL_UNUSED: string = "E0002";
export const DIAG_CODE_ASSIGNMENT_DUP: string = "E0003";
export const DIAG_CODE_NAMED_NUM_OR_BIT_DUP: string = "E0004";
export const DIAG_CODE_NAMED_BIT_OR_ENUM_NEG: string = "E0005";
export const DIAG_CODE_ENUM_NUM_DUP: string = "E0006";
export const DIAG_CODE_COMPS_OF_NOT_TYPE: string = "E0007";
export const DIAG_CODE_COMPS_OF_WRONG_TYPE: string = "E0008";
export const DIAG_CODE_SET_OR_SEQ_COMP_DUP: string = "E0009";
export const DIAG_CODE_CHOICE_ALT_DUP: string = "E0010";
export const DIAG_CODE_SHORT_OID: string = "E0011";
export const DIAG_CODE_OID_ROOT_ARC_NUM: string = "E0012";
export const DIAG_CODE_OID_ROOT_ARC_NAME: string = "E0013";
export const DIAG_CODE_OID_ROOT_ARC_MISMATCH: string = "E0014";
export const DIAG_CODE_OID_BIG_SECOND_ARC: string = "E0015";
export const DIAG_CODE_DATE_INVALID: string = "E0016";
export const DIAG_CODE_DATE_DAY_INVALID: string = "E0017";
export const DIAG_CODE_TIME_OF_DAY_INVALID: string = "E0018";
export const DIAG_CODE_DATETIME_INVALID: string = "E0019";
export const DIAG_CODE_DURATION_NO_P: string = "E0020";
export const DIAG_CODE_VAL_ASSN_TYPE_NOT_TYPE: string = "E0021"; // Value assignment's type does not refer to a type assignment.
export const DIAG_CODE_SYMBOL_NOT_DEFINED: string = "E0022";
export const DIAG_CODE_EXPORT_NOT_DEFINED: string = "E0023";
export const DIAG_CODE_LEX_ERROR: string = "E0024";
export const DIAG_CODE_PARSE_ERROR: string = "E0025";
export const DIAG_CODE_GROK_ERROR: string = "E0026";
export const DIAG_CODE_DIAG_DISABLED: string = "E0027";

const AT_INDEX = "at index ";

function getRangeForWholeDocument(document: vscode.TextDocument): [vscode.Position, vscode.Position] {
    let start = new vscode.Position(0, 0);
    const lastLine = document.lineAt(document.lineCount - 1);
    const end = lastLine.range.end;
    return [start, end];
}

// TODO: Handle duplicate imported modules too
// Checks for duplicate or unnecessary imported symbols
function provideImportDiagnostics(
    document: vscode.TextDocument,
    mod: Module,
    diags: vscode.Diagnostic[],
    usedSymbols: Set<string>,
): void {
    for (const sfm of Object.values(mod.imports.modules)) {
        for (const dup of sfm.duplicateSymbols) {
            const range = getRangeFromLocation(document, dup.location);
            const diag = new vscode.Diagnostic(
                range,
                "symbol already imported before this",
                vscode.DiagnosticSeverity.Warning,
            );
            diag.tags = [vscode.DiagnosticTag.Unnecessary];
            diag.code = DIAG_CODE_IMPORT_SYMBOL_DUP;
            diags.push(diag);
        }
        for (const [symbol, prod] of Object.entries(sfm.symbolList)) {
            if (!prod) {
                continue;
            }
            if (!usedSymbols.has(symbol)) {
                const range = getRangeFromLocation(document, prod.location);
                const diag = new vscode.Diagnostic(
                    range,
                    "symbol not used in this asn.1 module",
                    vscode.DiagnosticSeverity.Warning,
                );
                diag.tags = [vscode.DiagnosticTag.Unnecessary];
                diag.code = DIAG_CODE_IMPORT_SYMBOL_UNUSED;
                diags.push(diag);
            }
        }
    }
}

function provideDuplicateAssignmentDiagnostics(
    document: vscode.TextDocument,
    mod: Module,
    diags: vscode.Diagnostic[],
): void {
    for (const dup of mod.duplicateAssignments) {
        const range = getRangeFromLocation(document, dup.location);
        const diag = new vscode.Diagnostic(
            range,
            "identifier already assigned before this",
            vscode.DiagnosticSeverity.Error,
        );

        // Try to link to the first assignment of this identifier.
        const wordRange = document.getWordRangeAtPosition(range.start);
        if (wordRange) {
            const identifier = document.getText(wordRange);
            const firstDef = mod.assignments[identifier];
            if (firstDef?.production) {
                const firstloc = firstDef.production.location;
                const firstrange = getRangeFromLocation(document, firstloc);
                diag.relatedInformation = [
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(document.uri, firstrange),
                        "originally defined here",
                    ),
                ];
            }
        }
        diag.code = DIAG_CODE_ASSIGNMENT_DUP;
        diags.push(diag);
    }
}

function returnNamedNumberError(
    document: vscode.TextDocument,
    assn: Assignment,
    loc?: Asn1ParserLocation,
    firstloc?: Asn1ParserLocation,
): vscode.Diagnostic | null {
    if (!loc) {
        // If we don't have a location of the named identifier,
        // try to make the whole assignment an error.
        const assnloc = assn.production?.location;
        if (assnloc) {
            const assnrange = getRangeFromLocation(document, assnloc);
            const diag = new vscode.Diagnostic(
                assnrange,
                "duplicate identifier",
                vscode.DiagnosticSeverity.Error,
            );
            diag.code = DIAG_CODE_NAMED_NUM_OR_BIT_DUP;
            return diag;
        } else {
            // There is an error, but we absolutely cannot construct it.
            return null;
        }
    }
    const range = getRangeFromLocation(document, loc);
    const diag = new vscode.Diagnostic(
        range,
        "identifier already assigned before this",
        vscode.DiagnosticSeverity.Error,
    );
    diag.code = DIAG_CODE_NAMED_NUM_OR_BIT_DUP;
    if (firstloc) {
        const firstrange = getRangeFromLocation(document, firstloc);
        diag.relatedInformation = [
            new vscode.DiagnosticRelatedInformation(
                new vscode.Location(document.uri, firstrange),
                "duplicated identifier originally defined here",
            ),
        ];
    }
    return diag;
}

function provideNamedNumbersDiagnostics(
    document: vscode.TextDocument,
    assn: Assignment,
    namednums: NamedNumber[],
    diags: vscode.Diagnostic[],
    typeType: TypeType,
    startOfAdditionals: number = -1,
): void {
    const forbidNegative = (
        (typeType === TypeType.BitStringType)
        || (typeType === TypeType.EnumeratedType)
    );
    const encounteredIdentifiers: Map<string, Production | null> = new Map();
    const encounteredNumbers: Map<number, Production | null> = new Map();
    let largestPrevious: number = 0;
    for (const [i, nn] of namednums.entries()) {
        const loc = nn.production?.location;
        if (
            forbidNegative
            && typeof nn.number === "number"
            && (nn.number < 0)
            && loc
        ) {
            const range = getRangeFromLocation(document, loc);
            const diag = new vscode.Diagnostic(
                range,
                "negative values not allowed",
                vscode.DiagnosticSeverity.Error,
            );
            diag.code = DIAG_CODE_NAMED_BIT_OR_ENUM_NEG;
            diags.push(diag);
        }

        // Check for duplicate identifiers
        const firstIdent = encounteredIdentifiers.get(nn.identifier);
        if (typeof firstIdent !== "undefined") { // Already defined
            const diag = returnNamedNumberError(document, assn, loc, firstIdent?.location);
            if (diag) {
                diags.push(diag);
            }
        } else {
            encounteredIdentifiers.set(nn.identifier, nn.production ?? null);
        }

        // Check for duplicate numbers
        if (typeof nn.number === "number") {
            const firstNum = encounteredNumbers.get(nn.number);
            if (typeof firstNum !== "undefined") { // Already defined
                const diag = returnNamedNumberError(document, assn, loc, firstNum?.location);
                if (diag) {
                    diags.push(diag);
                }
            } else {
                encounteredNumbers.set(nn.number, nn.production ?? null);
            }
        }

        if (
            (typeType === TypeType.EnumeratedType)
            && (startOfAdditionals > -1)
            && (i >= startOfAdditionals)
            && (typeof nn.number === "number")
            && (nn.number <= largestPrevious)
            && nn.production
        ) {
            const range = getRangeFromLocation(document, nn.production.location);
            const diag = new vscode.Diagnostic(
                range,
                "number already assigned before this (violation of ITU-T Recommendation X.680, Section 20.4)",
                vscode.DiagnosticSeverity.Error,
            );
            diag.code = DIAG_CODE_ENUM_NUM_DUP;
            diags.push(diag);
        }

        if (typeof nn.number === "number") {
            largestPrevious = nn.number;
        }
    }
}

const typeTypeToString: Map<TypeType, string> = new Map([
    [TypeType.SequenceType, "SEQUENCE"],
    [TypeType.SetType, "SET"],
    [TypeType.ChoiceType, "CHOICE"],
]);

function resolveComponentsOf(
    document: vscode.TextDocument,
    mod: Module,
    def: Defined,
    diags: vscode.Diagnostic[],
    expectedType: TypeType,
    recursionTTL: number = 5,
): ComponentType[] | null {
    if (recursionTTL <= 0) {
        return null;
    }
    recursionTTL--;
    if (
        !def.module
        || !def.production?.location
        || !typeTypeToString.has(expectedType)
    ) {
        return null;
    }
    const range = getRangeFromLocation(document, def.production.location);
    const assn = mod.assignments[def.reference];
    if (!assn) {
        // COMPONENTS OF must have been imported. Looking no further.
        return null;
    }
    if (assn.assignmentType !== AssignmentType.TypeAssignment) {
        const diag = new vscode.Diagnostic(
            range,
            "reference does not point to a type assignment",
            vscode.DiagnosticSeverity.Error,
        );
        diag.code = DIAG_CODE_COMPS_OF_NOT_TYPE;
        diags.push(diag);
        return null;
    }
    if (
        (assn.type.typeType !== expectedType)
        && !typeTypesThatCouldBeAnything.has(assn.type.typeType)
    ) {
        const diag = new vscode.Diagnostic(
            range,
            "reference does not refer to a " + typeTypeToString.get(expectedType)! + " type",
            vscode.DiagnosticSeverity.Error,
        );
        diag.code = DIAG_CODE_COMPS_OF_WRONG_TYPE;
        diags.push(diag);
        return null;
    }
    const ret: ComponentType[] = [];
    if (
        assn.type.typeType === TypeType.SequenceType
        || assn.type.typeType === TypeType.SetType
    ) {
        const t = assn.type.type;
        const components: ComponentType[] = [
            ...t.rootComponentTypeList1 ?? [],
            ...t.rootComponentTypeList2 ?? [],
            ...(t.extensionAdditionList ?? [])
                .flatMap((eal) => ("componentTypeList" in eal)
                    ? eal.componentTypeList
                    : eal),
        ];
        for (const component of components) {
            if ("componentsOf" in component) {
                if (component.componentsOf.typeType === TypeType.DefinedType) {
                    const def = component.componentsOf.type;
                    const resolved = resolveComponentsOf(
                        document,
                        mod,
                        def,
                        diags,
                        expectedType,
                        recursionTTL,
                    );
                    resolved && ret.push(...resolved);
                }
            } else {
                ret.push(component);
            }
        }
    }
    return ret;
}

function provideSetOrSeqTypeAssnDiagnostics(
    document: vscode.TextDocument,
    mod: Module,
    assn: TypeAssignment,
    diags: vscode.Diagnostic[],
): void {
    if (
        (assn.type.typeType !== TypeType.SequenceType)
        && (assn.type.typeType !== TypeType.SetType)
    ) {
        return;
    }
    const t = assn.type.type;
    const components: ComponentType[] = [
        ...t.rootComponentTypeList1 ?? [],
        ...t.rootComponentTypeList2 ?? [],
        ...(t.extensionAdditionList ?? [])
            .flatMap((eal) => ("componentTypeList" in eal)
                ? eal.componentTypeList
                : eal),
    ];
    const encounteredNames: Map<string, Production | null> = new Map();
    // First pass: replicate and validate all COMPONENTS OF
    for (const component of components) {
        if ("componentsOf" in component) {
            if (component.componentsOf.typeType === TypeType.DefinedType) {
                const def = component.componentsOf.type;
                const resolved = resolveComponentsOf(
                    document, mod, def, diags, assn.type.typeType);
                for (const rc of resolved ?? []) {
                    if ("namedType" in rc) {
                        encounteredNames.set(
                            rc.namedType.identifier,
                            rc.namedType.production ?? null,
                        );
                    }
                }
            }
        }
    }
    // Second pass: check for no duplicate component names.
    for (const component of components) {
        if (!("namedType" in component)) {
            continue;
        }
        const nt = component.namedType;
        const firstComp = encounteredNames.get(nt.identifier);
        if (typeof firstComp !== "undefined") { // Already defined
            const loc = nt.production?.location ?? assn.production?.location;
            if (loc) {
                const range = getRangeFromLocation(document, loc);
                const diag = new vscode.Diagnostic(
                    range,
                    "duplicate component",
                    vscode.DiagnosticSeverity.Error,
                );
                if (nt.production?.location && firstComp?.location) {
                    const range = getRangeFromLocation(document, firstComp.location);
                    diag.relatedInformation = [
                        new vscode.DiagnosticRelatedInformation(
                            new vscode.Location(document.uri, range),
                            "duplicated component first defined here",
                        ),
                    ];
                }
                diag.code = DIAG_CODE_SET_OR_SEQ_COMP_DUP;
                diags.push(diag);
            }
        } else {
            encounteredNames.set(nt.identifier, nt.production ?? null);
        }
    }
}

function provideTypeAssignmentDiagnostics(
    document: vscode.TextDocument,
    mod: Module,
    assn: TypeAssignment,
    diags: vscode.Diagnostic[],
): void {
    if (
        (assn.type.typeType === TypeType.BitStringType)
        && assn.type.type.namedBitList
    ) {
        const namedBitList = assn.type.type.namedBitList;
        provideNamedNumbersDiagnostics(
            document,
            assn,
            namedBitList,
            diags,
            assn.type.typeType,
        );
    }

    if (
        (assn.type.typeType === TypeType.IntegerType)
        && assn.type.type.namedNumberList
    ) {
        const namedNums = assn.type.type.namedNumberList;
        provideNamedNumbersDiagnostics(
            document,
            assn,
            namedNums,
            diags,
            assn.type.typeType,
        );
    }

    if (
        (assn.type.typeType === TypeType.EnumeratedType)
        && assn.type.type.items
    ) {
        let unassigneds: number = 0;
        const items = assn.type.type.items;
        const namedNums: NamedNumber[] = items
            .map((item): NamedNumber => ({
                identifier: item.identifier,
                number: item.number ?? unassigneds++,
                production: item.production,
            }));
        const firstaddl = items.findIndex((item) => item.additional);
        const addls = (
            firstaddl > -1
            && items.slice(firstaddl).every((item) => item.additional)
        )
            ? firstaddl
            : -1;
        provideNamedNumbersDiagnostics(
            document,
            assn,
            namedNums,
            diags,
            assn.type.typeType,
            addls,
        );
    }

    if (
        (assn.type.typeType === TypeType.SequenceType)
        || (assn.type.typeType === TypeType.SetType)
    ) {
        provideSetOrSeqTypeAssnDiagnostics(
            document,
            mod,
            assn,
            diags,
        );
    }

    if (assn.type.typeType === TypeType.ChoiceType) {
        const t = assn.type.type;
        const namedTypes: NamedType[] = [
            ...t.rootAlternativeTypeList,
            ...(t.extensionAdditionAlternatives ?? [])
                .flatMap((eal) => ("alternativeTypeList" in eal)
                    ? eal.alternativeTypeList
                    : eal),
        ];

        const encounteredIdentifiers: Map<string, Production | null> = new Map();
        for (const nt of namedTypes) {
            const firstAlt = encounteredIdentifiers.get(nt.identifier);
            if (typeof firstAlt !== "undefined") { // Already defined
                const loc = nt.production?.location ?? assn.production?.location;
                if (loc) {
                    const range = getRangeFromLocation(document, loc);
                    const diag = new vscode.Diagnostic(
                        range,
                        "duplicate alternative identifier",
                        vscode.DiagnosticSeverity.Error,
                    );
                    if (nt.production?.location && firstAlt?.location) {
                        const range = getRangeFromLocation(document, firstAlt.location);
                        diag.relatedInformation = [
                            new vscode.DiagnosticRelatedInformation(
                                new vscode.Location(document.uri, range),
                                "duplicated alternative identifier first defined here",
                            ),
                        ];
                    }
                    diag.code = DIAG_CODE_CHOICE_ALT_DUP;
                    diags.push(diag);
                }
            } else {
                encounteredIdentifiers.set(nt.identifier, nt.production ?? null);
            }
        }
    }
    // TODO: Provide hints around SET OF / SEQUENCE OF with size constraints
    // TODO: check that field exists in ObjectClassFieldType
}

function provideOIDValueDiagnostics(
    document: vscode.TextDocument,
    value: ObjectIdentifierValue,
    diags: vscode.Diagnostic[],
): void {
    if (!value.production?.location) {
        return;
    }
    const oidrange = getRangeFromLocation(document, value.production.location);
    if (
        value.prefix
        && !value.prefix.module
        && !builtinRootArcNamesToNumber.has(value.prefix.reference)
    ) {
        // There is a prefix and it wasn't just a root arc name mistaken for a prefix.
        return;
    }
    const prefixIsBuiltIn = value.prefix && builtinRootArcNamesToNumber.has(value.prefix.reference);
    const needRemainingArcs =prefixIsBuiltIn ? 1 : 2;
    if (value.components.length < needRemainingArcs) {
        const diag = new vscode.Diagnostic(
            oidrange,
            "an object identifier cannot be shorter than two arcs",
            vscode.DiagnosticSeverity.Error,
        );
        diag.code = DIAG_CODE_SHORT_OID;
        diags.push(diag);
        return;
    }
    const arcs = value.components;
    const first: ObjIdComponents = prefixIsBuiltIn
        ? {
            name: value.prefix?.reference!,
            production: value.prefix?.production,
        }
        : arcs[0];
    const second = prefixIsBuiltIn ? arcs[0] : arcs[1];
    let firstnum = ("number" in first && typeof first.number === "number")
        ? first.number
        : undefined;
    const firstloc = first.production?.location ?? value.production.location;
    const firstrange = getRangeFromLocation(document, firstloc);
    if ((typeof firstnum === "number") && (firstnum < 0 || firstnum > 2)) {
        const diag = new vscode.Diagnostic(
            firstrange,
            "invalid root arc number. must be 0, 1, or 2.",
            vscode.DiagnosticSeverity.Error,
        );
        diag.code = DIAG_CODE_OID_ROOT_ARC_NUM;
        diags.push(diag);
    }
    if ("name" in first && typeof first.name === "string") {
        const name = first.name;
        if (!builtinRootArcNamesToNumber.has(name)) {
            const diag = new vscode.Diagnostic(
                firstrange,
                "unrecognized root arc identifier. must be one of: "
                + Array.from(builtinRootArcNamesToNumber.values()).join(", "),
                vscode.DiagnosticSeverity.Error,
            );
            diag.code = DIAG_CODE_OID_ROOT_ARC_NAME;
            diags.push(diag);
        }
        if (
            (typeof firstnum === "number")
            && (builtinRootArcNamesToNumber.get(name) !== firstnum)
        ) {
            const diag = new vscode.Diagnostic(
                firstrange,
                "mismatching root arc name and number. the correct number is "
                + builtinRootArcNamesToNumber.get(name) + ".",
                vscode.DiagnosticSeverity.Error,
            );
            diag.code = DIAG_CODE_OID_ROOT_ARC_MISMATCH;
            diags.push(diag);
        }
        firstnum = builtinRootArcNamesToNumber.get(name)!;
    }
    if (typeof firstnum !== "number" || (firstnum === 2)) {
        return;
    }
    const secondloc = second.production?.location ?? value.production.location;
    const secondrange = getRangeFromLocation(document, secondloc);
    if (
        "number" in second
        && typeof second.number === "number"
        && second.number > 39
    ) {
        const diag = new vscode.Diagnostic(
            secondrange,
            "the second arc cannot be > 39 if the first arc is 0 or 1",
            vscode.DiagnosticSeverity.Error,
        );
        diag.code = DIAG_CODE_OID_BIG_SECOND_ARC;
        diags.push(diag);
    }
}

const daysInMonth: Map<string, number> = new Map([
    ["01", 31],
    ["02", 29],
    ["03", 31],
    ["04", 30],
    ["05", 31],
    ["06", 30],
    ["07", 31],
    ["08", 31],
    ["09", 30],
    ["10", 31],
    ["11", 30],
    ["12", 31],
]);

function provideDateDiagnostics(
    s: string,
    range: vscode.Range,
    diags: vscode.Diagnostic[],
): void {
    const match = DATE_REGEX.exec(s);
    if (!match) {
        const diag = new vscode.Diagnostic(
            range,
            "invalid date. must be in yyyy-mm-dd format.",
            vscode.DiagnosticSeverity.Error,
        );
        diag.code = DIAG_CODE_DATE_INVALID;
        diags.push(diag);
        return;
    }
    const [, y, m, d] = match;
    const year = Number(y);
    const day = Number(d);
    let maxDays = daysInMonth.get(m) ?? 31;
    if (((year % 4) === 0) && maxDays === 29) {
        maxDays--;
    }
    if (day > maxDays) {
        const diag = new vscode.Diagnostic(
            range,
            "invalid date: day not valid, given the month or leap-year status",
            vscode.DiagnosticSeverity.Error,
        );
        diag.code = DIAG_CODE_DATE_DAY_INVALID;
        diags.push(diag);
    }
}

function provideTimeOfDayDiagnostics(
    s: string,
    range: vscode.Range,
    diags: vscode.Diagnostic[],
): void {
    const match = TIME_REGEX.exec(s);
    if (!match) {
        const diag = new vscode.Diagnostic(
            range,
            "invalid time of day. must be in hh:mm:ss format.",
            vscode.DiagnosticSeverity.Error,
        );
        diag.code = DIAG_CODE_TIME_OF_DAY_INVALID;
        diags.push(diag);
    }
    // No further validation needed. The regex is sufficient.
}

// TODO: Allow caller to supply a diagnostic code.
function useDecodingToProvideDiagnostics(
    s: string,
    range: vscode.Range,
    tagnum: ASN1UniversalType,
    test: (el: BERElement) => unknown,
    diags: vscode.Diagnostic[],
): void {
    let el: BERElement;
    try {
        el = new BERElement(
            ASN1TagClass.universal,
            ASN1Construction.primitive,
            tagnum,
            s,
        );
    } catch {
        return; // Not sure what went wrong here.
    }
    try {
        test(el);
    } catch (e) {
        const diag = new vscode.Diagnostic(
            range,
            `${e}`,
            vscode.DiagnosticSeverity.Error,
        );
        diags.push(diag);
    }
}

function provideStringDiagnostics(
    document: vscode.TextDocument,
    s: string,
    value: Value,
    typeType: TypeType,
    diags: vscode.Diagnostic[],
): void {
    if (!value.production) {
        return;
    }
    const loc = value.production.location;
    const range = getRangeFromLocation(document, loc);
    switch (typeType) {
        case (TypeType.DateType): {
            return provideDateDiagnostics(s, range, diags);
        }
        case (TypeType.TimeOfDayType): {
            return provideTimeOfDayDiagnostics(s, range, diags);
        }
        case (TypeType.DateTimeType): {
            if (s[10] !== "T") {
                const diag = new vscode.Diagnostic(
                    range,
                    "malformed datetime. must be in yyyy-mm-ddThh:mm:ss format.",
                    vscode.DiagnosticSeverity.Error,
                );
                diag.code = DIAG_CODE_DATETIME_INVALID;
                diags.push(diag);
                return;
            }
            const d = s.slice(0, 10);
            const t = s.slice(11);
            provideDateDiagnostics(d, range, diags);
            provideTimeOfDayDiagnostics(t, range, diags);
            return;
        }
        case (TypeType.DurationType): {
            if (!s.startsWith("P")) {
                const diag = new vscode.Diagnostic(
                    range,
                    "malformed duration. must start with a capital 'P'.",
                    vscode.DiagnosticSeverity.Error,
                );
                diag.code = DIAG_CODE_DURATION_NO_P;
                diags.push(diag);
                return;  
            }
            return useDecodingToProvideDiagnostics(
                s.slice(1),
                range,
                ASN1UniversalType.duration,
                (el) => el.duration,
                diags,
            );
        }
        case (TypeType.UTCTime): {
            return useDecodingToProvideDiagnostics(
                s,
                range,
                ASN1UniversalType.utcTime,
                (el) => el.utcTime,
                diags,
            );
        }
        case (TypeType.GeneralizedTime): {
            return useDecodingToProvideDiagnostics(
                s,
                range,
                ASN1UniversalType.generalizedTime,
                (el) => el.generalizedTime,
                diags,
            );
        }
        case (TypeType.IRIType): {
            return useDecodingToProvideDiagnostics(
                s,
                range,
                ASN1UniversalType.oidIRI,
                (el) => el.oidIRI,
                diags,
            );
        }
        case (TypeType.RelativeIRIType): {
            return useDecodingToProvideDiagnostics(
                s,
                range,
                ASN1UniversalType.roidIRI,
                (el) => el.relativeOIDIRI,
                diags,
            );
        }
        case (TypeType.PrintableString): {
            return useDecodingToProvideDiagnostics(
                s,
                range,
                ASN1UniversalType.printableString,
                (el) => el.printableString,
                diags,
            );
        }
        case (TypeType.NumericString): {
            return useDecodingToProvideDiagnostics(
                s,
                range,
                ASN1UniversalType.numericString,
                (el) => el.numericString,
                diags,
            );
        }
        // These are the same. I don't know why I have duplicates
        case (TypeType.ISO646String):
        case (TypeType.IA5String): {
            return useDecodingToProvideDiagnostics(
                s,
                range,
                ASN1UniversalType.ia5String,
                (el) => el.ia5String,
                diags,
            );
        }
        default: return;
    }
}

function provideValueAssignmentDiagnostics(
    document: vscode.TextDocument,
    mod: Module,
    assn: ValueAssignment,
    diags: vscode.Diagnostic[],
): void {
    let dereftype: TypeType = assn.type.typeType;
    if (assn.type.typeType === TypeType.DefinedType) {
        const def = assn.type.type;
        const derefassn = resolveDefinedInstantly(mod, def);
        if (!derefassn) {
            // If we can't figure out what type it really is,
            // we cannot validate the value with confidence.
            return;
        }
        // TODO: I think assignmentType will never be Parameterized. Double check.
        const expectedAssignType = ((def.parameters?.length ?? 0) > 0)
            ? AssignmentType.ParameterizedTypeAssignment
            : AssignmentType.TypeAssignment;
        if (derefassn.assignmentType !== expectedAssignType) {
            if (assn.production?.location) {
                const range = getRangeFromLocation(document, assn.production.location);
                const diag = new vscode.Diagnostic(
                    range,
                    "defined type " + def.reference + " does not refer to a type assignment",
                    vscode.DiagnosticSeverity.Error,
                );
                diag.code = DIAG_CODE_VAL_ASSN_TYPE_NOT_TYPE;
                diags.push(diag);
            }
            return;
        }
        dereftype = derefassn.type.typeType;
    }
    if (dereftype === TypeType.DefinedType) {
        // Again, cannot determine the type, so cannot validate the value.
        return;
    }

    const vt = assn.value.valueType;
    const vtext = assn.value.text;
    switch (dereftype) {
        case (TypeType.ObjectIdentifierType): {
            const reparsed: ObjectIdentifierValue | null =
                (vt === ValueType.ObjectIdentifierValue)
                    ? assn.value.value
                    : maybeReparse(
                        assn.value,
                        parserFor.ObjectIdentifierValue,
                        grokerFor.ObjectIdentifierValue,
                    );
            if (!reparsed) {
                // This value might be malformed. Not sure.
                return;
            }
            provideOIDValueDiagnostics(document, reparsed, diags);
            return;
        }
        case (TypeType.DateType):
        case (TypeType.TimeOfDayType):
        case (TypeType.DateTimeType):
        case (TypeType.DurationType):
        case (TypeType.UTCTime):
        case (TypeType.GeneralizedTime):
        case (TypeType.IRIType):
        case (TypeType.RelativeIRIType):
        case (TypeType.PrintableString):
        case (TypeType.NumericString):
        case (TypeType.ISO646String):
        case (TypeType.IA5String):
        {
            let s: string = vtext;
            if (s === undefined) {
                // This value might be malformed. Not sure.
                return;
            }
            if (!s.startsWith('"')) {
                return;
            }
            s = s.slice(1, -1);
            provideStringDiagnostics(document, s, assn.value, dereftype, diags);
            return;
        }
        default: return;
    }
}

function provideAssignmentDiagnostics(
    document: vscode.TextDocument,
    mod: Module,
    assn: Assignment,
    diags: vscode.Diagnostic[],
): void {
    if (assn.assignmentType === AssignmentType.TypeAssignment) {
        provideTypeAssignmentDiagnostics(document, mod, assn, diags);
    }
    if (assn.assignmentType === AssignmentType.ValueAssignment) {
        provideValueAssignmentDiagnostics(document, mod, assn, diags);
    }
}

function provideAssignmentListDiagnostics(
    document: vscode.TextDocument,
    mod: Module,
    diags: vscode.Diagnostic[],
): void {
    for (const assn of Object.values(mod.assignments)) {
        try {
            provideAssignmentDiagnostics(document, mod, assn, diags);
        } catch (e) {
            log.appendLine(`failed to provide diagnostics for assignment ${assn.identifier}: ${e}`);
        }
    }
}

/**
 * Grammatical productions of these types cannot have `Defined*` productions
 * within them. We can skip over these, and therefore lop off entire useless
 * subtrees of the concrete syntax tree (CST), to make scanning for unassigned
 * references faster.
 */
const selfContainedProductions: Set<string> = new Set([
    "ArcIdentifier",
    "AtNotation",
    "BooleanType",
    "BooleanValue",
    "Class",
    "comment",
    "DateTimeType",
    "DateType",
    "DummyReference",
    "DurationType",
    "EmbeddedPDVType",
    "EmptyElementReal",
    "EncodingControlSection",
    "EncodingControlSections",
    "EncodingReference",
    "EnumeratedValue",
    "ExternalType",
    "FirstArcIdentifier",
    "FirstRelativeArcIdentifier",
    "IdentifierList",
    "IntegerValue",
    "IRIType",
    "IRIValue",
    "Level",
    "Literal",
    "NameForm",
    "NullType",
    "NullValue",
    "ObjectIdentifierType",
    "OctetStringType",
    "PresenceConstraint",
    "PropertySettings",
    "Quadruple",
    "RealType",
    "RelativeIRIType",
    "RelativeIRIValue",
    "RelativeOIDType",
    "RestrictedCharacterStringType",
    "SelectionOption",
    "SignedNumber",
    "SpecialRealValue",
    "SubsequentArcIdentifier",
    "SyntaxList",
    "TableColumn",
    "TableRow",
    "TextReal",
    "TimeOfDayType",
    "TimeType",
    "TimeValue",
    "Tuple",
    "UnrestrictedCharacterStringType",
    "UsefulObjectClassReference",
    "UsefulType",
    "VersionNumber",
    "whitespace",
    "WithSyntaxSpec",
    "XMLBooleanValue",
    "XMLEnumeratedValue",
    "XMLIdentifierList",
    "XMLIntegerValue",
    "XMLIRIValue",
    "XMLNullValue",
    "XMLNumericRealValue",
    "XMLObjectIdentifierValue",
    "XMLRealValue",
    "XMLRelativeIRIValue",
    "XMLRelativeOIDValue",
    "XMLRestrictedCharacterStringValue",
    "XMLTimeValue",
]);

const SYMBOL_NOT_DEFINED: string = "symbol not assigned in this module, nor imported";

/*
NOTE: You do not have to check that the import includes the "{}" if it is
parameterized. That is optional, per ITU-T Recommendation X.683 (2021), Section 9.1.

A non-parameterized import is NOT allowed to use the "{}", but we are not going to
check this scenario, because it would be rare and computationally expensive.
*/
function drillForUndefinedSymbols(
    document: vscode.TextDocument,
    mod: Module,
    diags: vscode.Diagnostic[],
    cstnode: Production,
    usedSymbols: Set<string>,
    recursionTTL: number = 100,
): void {
    if (recursionTTL <= 0) {
        return;
    }
    recursionTTL--;
    for (const child of cstnode.children) {
        if (selfContainedProductions.has(child.type)) {
            continue;
        }
        if (child.type.startsWith('Defined')) {
            const text = document.getText();
            const ctx = createGrokContext(text);
            let def: Defined;
            try {
                def = grokerFor.Defined(child, ctx);
            } catch {
                return;
            }
            if (def.module) {
                // Explicit module reference.
                // We cannot say that it wasn't imported or defined.
                return;
            }
            if (builtinRootArcNamesToNumber.has(def.reference)) {
                return;
            }
            usedSymbols.add(def.reference);

            // If there are any parameters, check if they are parameterized.
            const params = child
                .children
                .find((c) => c.type.startsWith("Parameterized"))
                ?.children
                .find((c) => c.type === "ActualParameterList")
                // Yes, ActualParameterList is within itself in my parser
                // implementation. Sorry for being a bad programmer.
                ?.children
                .find((c) => c.type === "ActualParameterList")
                ?.children
                .filter((c) => c.type === "ActualParameter");
            for (const param of params ?? []) {
                drillForUndefinedSymbols(document, mod, diags, param, usedSymbols, recursionTTL);
            }
            if (isDefinedOrImported(mod, def.reference)) {
                return;
            }
            const range = getRangeFromLocation(document, child.location);
            const diag = new vscode.Diagnostic(
                range,
                SYMBOL_NOT_DEFINED,
                vscode.DiagnosticSeverity.Error,
            );
            diag.code = DIAG_CODE_SYMBOL_NOT_DEFINED;
            diags.push(diag);
        } else {
            drillForUndefinedSymbols(document, mod, diags, child, usedSymbols, recursionTTL);
        }
    }
}

function provideMissingSymbolDiagnostics(
    document: vscode.TextDocument,
    mod: Module,
    diags: vscode.Diagnostic[],
    usedSymbols: Set<string>,
): void {
    if (!mod.production) {
        return;
    }
    const body = mod.production.children
        .find((c) => c.type === "ModuleBody");
    if (!body) {
        return;
    }

    // Check that all exported symbols are defined
    const exps = Object.entries(mod.exports?.exportedSymbols ?? {});
    for (const [exp, prod] of exps) {
        // Yes, you can re-export imports.
        if (isDefinedOrImported(mod, exp)) {
            continue;
        }
        const range = getRangeFromLocation(document, prod.location);
        const diag = new vscode.Diagnostic(
            range,
            SYMBOL_NOT_DEFINED,
            vscode.DiagnosticSeverity.Error,
        );
        diag.code = DIAG_CODE_EXPORT_NOT_DEFINED;
        diags.push(diag);
    }

    // Check that all `DefinedValue`s in imported module OIDs are defined
    for (const sfm of Object.values(mod.imports.modules)) {
        if (!sfm.assignedIdentifier || !sfm.production) {
            continue;
        }
        const assid = sfm.production
            .children
            .find((c) => (c.type === "GlobalModuleReference"))
            ?.children
            .find((c) => c.type === "AssignedIdentifier");
        if (!assid) {
            continue;
        }
        drillForUndefinedSymbols(document, mod, diags, assid, usedSymbols, 10);
    }

    // Check that all `Defined*` used in assignments are defined
    const assnlist = body.children
        .find((c) => c.type === "AssignmentList");
    if (!assnlist) {
        return;
    }
    drillForUndefinedSymbols(document, mod, diags, assnlist, usedSymbols);
}

function lineDisablesDiagnostics(line: string): boolean {
    return (
        /^\s*--\s*no_diagnose/.test(line)
        || /^\s*\/\*\s*no_diagnose/.test(line)
    );
}

function syntaxErrorToDiag(
    document: vscode.TextDocument,
    e: ASN1SyntaxError,
    malformedThing: string,
    code: string,
): vscode.Diagnostic {
    const range = getRangeFromLocation(document, e.production.location);
    const diag = new vscode.Diagnostic(
        range,
        e.moduleName
            ? `malformed ${malformedThing}: syntax error in ${e.moduleName}: ${e.message}`
            : `malformed ${malformedThing}: syntax error: ${e.message}`,
        vscode.DiagnosticSeverity.Error,
    );
    diag.code = code;
    return diag;
}

function asn1NonSyntaxErrorToDiag(
    document: vscode.TextDocument,
    e: ASN1SemanticError | ASN1ParserExpectationError,
    malformedThing: string,
    code: string,
    errstring: string,
): vscode.Diagnostic {
    let [start, end] = getRangeForWholeDocument(document);
    const range = e.production
        ? getRangeFromLocation(document, e.production.location)
        : new vscode.Range(start, end);
    let locdesc: string = "";
    if (e.assignment) {
        locdesc += ` in assignment ${e.assignment}`;
    }
    if (e.moduleName) {
        locdesc += ` in module ${e.moduleName}`;
    }
    const diag = new vscode.Diagnostic(
        range,
        `malformed ${malformedThing}: ${errstring}${locdesc}: ${e.message}`,
        vscode.DiagnosticSeverity.Error,
    );
    diag.code = code;
    return diag;
}

function semanticErrorToDiag(
    document: vscode.TextDocument,
    e: ASN1ParserExpectationError,
    malformedThing: string,
    code: string,
): vscode.Diagnostic {
    return asn1NonSyntaxErrorToDiag(document, e, malformedThing, code, "semantic error");
}

function expectationErrorToDiag(
    document: vscode.TextDocument,
    e: ASN1ParserExpectationError,
    malformedThing: string,
    code: string,
): vscode.Diagnostic {
    return asn1NonSyntaxErrorToDiag(document, e, malformedThing, code, "assertion failure");
}

export
async function updateDiagnostics(
    document: vscode.TextDocument,
    diagnosticCollection: vscode.DiagnosticCollection,
): Promise<void> {
    const config = vscode.workspace.getConfiguration("asn1");
    const enableDiagnostics = config.get<boolean>("enableDiagnostics");
    if (!enableDiagnostics) {
        diagnosticCollection.clear();
        return;
    }
    const firstline = document.lineAt(0);
    const firstlineText = firstline.text;
    if (lineDisablesDiagnostics(firstlineText)) {
        const diag = new vscode.Diagnostic(
            firstline.range,
            "diagnostics disabled. remove the 'no_diagnose' to re-enable diagnostics.",
            vscode.DiagnosticSeverity.Warning,
        );
        diag.code = DIAG_CODE_DIAG_DISABLED;
        diagnosticCollection.set(document.uri, [diag]);
        return;
    }
    log.appendLine(`updating diagnostics for file ${document.uri}`);
    const p = await getParserOutputs(document);
    if (!p.lexicalTokens) {
        return; // Should not happen.
    }
    let [start, end] = getRangeForWholeDocument(document);
    let modname: string | undefined;
    let thing: string = "asn.1 lexical token stream";
    let code: string = DIAG_CODE_LEX_ERROR;
    if ("err" in p.lexicalTokens) {
        const e = p.lexicalTokens.err;
        const indexInMessage = e.message.indexOf(AT_INDEX);
        if (e instanceof ASN1SyntaxError) {
            const diag = syntaxErrorToDiag(document, e, thing, code);
            diagnosticCollection.set(document.uri, [diag]);
            return;
        } else if (e instanceof ASN1SemanticError) {
            const diag = semanticErrorToDiag(document, e, thing, code);
            diagnosticCollection.set(document.uri, [diag]);
            return;
        } else if (e instanceof ASN1ParserExpectationError) {
            const diag = expectationErrorToDiag(document, e, thing, code);
            diagnosticCollection.set(document.uri, [diag]);
            return;
        } else if (indexInMessage > -1) {
            /* I checked: this will return after encountering non-digits, so
            I do not have to trim the string to only digits. */
            const index = Number.parseInt(
                e.message.slice(indexInMessage + AT_INDEX.length),
                10,
            );
            if (Number.isSafeInteger(index)) {
                start = document.positionAt(index);
            }
        }
        const range = new vscode.Range(start, end);
        const diag = new vscode.Diagnostic(
            range,
            modname
                ? (`malformed asn.1 lexical token stream in ${modname}: ` + e.message)
                : ("malformed asn.1 lexical token stream: " + e.message),
            vscode.DiagnosticSeverity.Error,
        );
        diag.code = DIAG_CODE_LEX_ERROR;
        diagnosticCollection.set(document.uri, [diag]);
        return;
    }
    // TODO: If the lexical tokens do not have an END, assume the user is not done writing and make only the first line error or something.
    if (!p.parserEndState) {
        return; // Should not happen.
    }
    thing = "asn.1 syntax";
    code = DIAG_CODE_PARSE_ERROR;
    if ("err" in p.parserEndState) {
        const e = p.parserEndState.err;
        if (e instanceof ASN1SyntaxError) {
            const diag = syntaxErrorToDiag(document, e, thing, code);
            diagnosticCollection.set(document.uri, [diag]);
            return;
        } else if (e instanceof ASN1SemanticError) {
            const diag = semanticErrorToDiag(document, e, thing, code);
            diagnosticCollection.set(document.uri, [diag]);
            return;
        } else if (e instanceof ASN1ParserExpectationError) {
            const diag = expectationErrorToDiag(document, e, thing, code);
            diagnosticCollection.set(document.uri, [diag]);
            return;
        }
        const range = new vscode.Range(start, end);
        const diag = new vscode.Diagnostic(
            range,
            "malformed asn.1 syntax: " + e.message,
            vscode.DiagnosticSeverity.Error,
        );
        diag.code = DIAG_CODE_PARSE_ERROR;
        diagnosticCollection.set(document.uri, [diag]);
        return;
    }
    const parsing = p.parserEndState.ok;
    if (parsing.error) {
        const range = new vscode.Range(start, end);
        const diag = new vscode.Diagnostic(
            range,
            "malformed asn.1 syntax: unknown error",
            vscode.DiagnosticSeverity.Error,
        );
        diag.code = DIAG_CODE_PARSE_ERROR;
        diagnosticCollection.set(document.uri, [diag]);
        return;
    }
    if (Object.keys(parsing.syntaxErrors).length > 0) {
        const diags: vscode.Diagnostic[] = [];
        for (const e of Object.values(parsing.syntaxErrors)) {
            const diag = syntaxErrorToDiag(document, e, thing, code);
            diags.push(diag);
        }
        diagnosticCollection.set(document.uri, diags);
        return;
    }
    if (!p.parsedModules) {
        return; // Should not happen
    }
    // TODO: Make this still return the modules that succeeded.
    thing = "asn.1 module";
    code = DIAG_CODE_GROK_ERROR;
    if ("err" in p.parsedModules) {
        const e = p.parsedModules.err;
        if (e instanceof ASN1SyntaxError) {
            const diag = syntaxErrorToDiag(document, e, thing, code);
            diagnosticCollection.set(document.uri, [diag]);
            return;
        } else if (e instanceof ASN1SemanticError) {
            const diag = semanticErrorToDiag(document, e, thing, code);
            diagnosticCollection.set(document.uri, [diag]);
            return;
        } else if (e instanceof ASN1ParserExpectationError) {
            const diag = expectationErrorToDiag(document, e, thing, code);
            diagnosticCollection.set(document.uri, [diag]);
            return;
        }
        const range = new vscode.Range(start, end);
        const diag = new vscode.Diagnostic(
            range,
            "malformed asn.1 module: " + e.message,
            vscode.DiagnosticSeverity.Error,
        );
        diag.code = DIAG_CODE_GROK_ERROR;
        diagnosticCollection.set(document.uri, [diag]);
        return;
    }
    const modules = p.parsedModules.ok;
    const diags: vscode.Diagnostic[] = [];
    for (const module of modules) {
        const usedSymbols: Set<string> = new Set();
        // The specification technically does not forbid duplicate imports, but it does explicitly forbid duplicate assignments.
        provideDuplicateAssignmentDiagnostics(document, module, diags);
        provideAssignmentListDiagnostics(document, module, diags);

        // Ordering is important here: provideMissingSymbolDiagnostics populates
        // usedSymbols, which is used by provideImportDiagnostics.
        provideMissingSymbolDiagnostics(document, module, diags, usedSymbols);
        provideImportDiagnostics(document, module, diags, usedSymbols);
    }
    diagnosticCollection.set(document.uri, diags);
}
