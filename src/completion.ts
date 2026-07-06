import * as vscode from "vscode";
import { getLastValidParserOutputs } from "./parsing.js";
import { inOpenSyntaxRegion, positionFallsWithin } from "./utils.js";
import {
    AssignmentType,
    type ComponentType,
    FieldSpecType,
    lex,
    type ObjectClassAssignment,
    type TokenOrGroupSpec,
    TypeType,
    type Module,
} from "@wildboar/asn1-parser";
import {
    TYPE_IDENTIFIER_DEFINITION,
    ABSTRACT_SYNTAX_DEFINITION,
} from "./definitions/universaltypes.js";
import {
    UNIVERSAL_DEFINITION,
    APPLICATION_DEFINITION,
    PRIVATE_DEFINITION,
} from "./definitions/classes.js";
import { typeTypesThatCouldBeAnything } from "./utils.js";
import type { LexedTokens } from "./types.js";

const COMPLETION_ITEM_TYPE_IDENTIFIER = new vscode.CompletionItem(
    "TYPE-IDENTIFIER",
    vscode.CompletionItemKind.Class,
);
COMPLETION_ITEM_TYPE_IDENTIFIER.documentation = TYPE_IDENTIFIER_DEFINITION;

const COMPLETION_ITEM_ABSTRACT_SYNTAX = new vscode.CompletionItem(
    "ABSTRACT-SYNTAX",
    vscode.CompletionItemKind.Class,
);
COMPLETION_ITEM_ABSTRACT_SYNTAX.documentation = ABSTRACT_SYNTAX_DEFINITION;

const COMPLETION_ITEM_TI_TYPE = new vscode.CompletionItem(
    "&Type",
    vscode.CompletionItemKind.Field,
);
COMPLETION_ITEM_TI_TYPE.detail = "(Open type field)";
COMPLETION_ITEM_TI_TYPE.documentation = new vscode.MarkdownString(
`Ever since the \`ANY\` type was deprecated, it is common to see
\`TYPE-IDENTIFIER.&Type\` with no relational constraints to serve as an
\`ANY\` type.
`);

const COMPLETION_ITEM_AS_TYPE = new vscode.CompletionItem(
    "&Type",
    vscode.CompletionItemKind.Field,
);
COMPLETION_ITEM_AS_TYPE.detail = "(Open type field)";
COMPLETION_ITEM_AS_TYPE.documentation = new vscode.MarkdownString(
`The single ASN.1 type that represents the entire abstract syntax.

This will often be a \`CHOICE\` whose alternatives are several message types
used in a protocol. For example:

\`\`\`asn1
MyPhoneProtocol ::= CHOICE {
    call    HelloMessage,
    chat    UTF8String,
    hangup  NULL
}
\`\`\`

`);

const COMPLETION_ITEM_PROPERTY = new vscode.CompletionItem(
    "&property",
    vscode.CompletionItemKind.Field,
);
COMPLETION_ITEM_PROPERTY.detail =
"BIT STRING whose bits serve as bitflags for properties of the abstract syntax";
COMPLETION_ITEM_PROPERTY.documentation = new vscode.MarkdownString(
`This field's data type is defined as
\`BIT STRING {handles-invalid-encodings(0)}\`, and the default value is
\`{}\` (no bits set).

If \`handles-invalid-encodings\` bit is set, the invalid encodings are not to
be treated as an error during the decoding process, and the decision on how to
treat such invalid encodings is left up to the application.
`);

const COMPLETION_ITEM_ID = new vscode.CompletionItem(
    "&id",
    vscode.CompletionItemKind.Field,
);
COMPLETION_ITEM_ID.detail = "Unique OBJECT IDENTIFIER that identifies the &Type";

const COMPLETION_ITEM_TRUE = new vscode.CompletionItem(
    "TRUE",
    vscode.CompletionItemKind.Value,
);
COMPLETION_ITEM_TRUE.detail = "TRUE BOOLEAN value";

const COMPLETION_ITEM_FALSE = new vscode.CompletionItem(
    "FALSE",
    vscode.CompletionItemKind.Value,
);
COMPLETION_ITEM_FALSE.detail = "FALSE BOOLEAN value";

const COMPLETION_ITEM_ARC0 = new vscode.CompletionItem(
    "itu-t",
    vscode.CompletionItemKind.Value,
);
COMPLETION_ITEM_ARC0.detail = "0";
COMPLETION_ITEM_ARC0.documentation =
"Root object identifier arc referring to the International Telecommunications Union Standardization Sector (ITU-T).";

const COMPLETION_ITEM_ARC1 = new vscode.CompletionItem(
    "iso",
    vscode.CompletionItemKind.Value,
);
COMPLETION_ITEM_ARC1.detail = "1";
COMPLETION_ITEM_ARC1.documentation =
"Root object identifier arc referring to the International Organization for Standardization (ISO).";

const COMPLETION_ITEM_ARC2 = new vscode.CompletionItem(
    "joint-iso-itu-t",
    vscode.CompletionItemKind.Value,
);
COMPLETION_ITEM_ARC2.detail = "2";
COMPLETION_ITEM_ARC2.documentation =
"Root object identifier arc shared between the International Telecommunications Union Standardization Sector (ITU-T) and the International Organization for Standardization (ISO).";

const COMPLETION_ITEM_MANTISSA = new vscode.CompletionItem(
    "mantissa",
    vscode.CompletionItemKind.Field,
);
COMPLETION_ITEM_MANTISSA.detail = "INTEGER";
COMPLETION_ITEM_MANTISSA.documentation = new vscode.MarkdownString(
    "`mantissa` field of a structured ASN.1 `REAL` value",
);

const COMPLETION_ITEM_BASE = new vscode.CompletionItem(
    "base",
    vscode.CompletionItemKind.Field,
);
COMPLETION_ITEM_BASE.detail = "INTEGER";
COMPLETION_ITEM_BASE.documentation = new vscode.MarkdownString(
    "`base` field of a structured ASN.1 `REAL` value. This may be `2` or `10`.",
);

const COMPLETION_ITEM_EXPONENT = new vscode.CompletionItem(
    "exponent",
    vscode.CompletionItemKind.Field,
);
COMPLETION_ITEM_EXPONENT.detail = "INTEGER";
COMPLETION_ITEM_EXPONENT.documentation = new vscode.MarkdownString(
    "`exponent` field of a structured ASN.1 `REAL` value",
);

const REAL_COMPLETION_ITEMS: vscode.CompletionItem[] = [
    COMPLETION_ITEM_MANTISSA,
    COMPLETION_ITEM_BASE,
    COMPLETION_ITEM_EXPONENT,
];

const COMPLETION_ITEM_UNIVERSAL = new vscode.CompletionItem(
    "UNIVERSAL",
    vscode.CompletionItemKind.Keyword,
);
COMPLETION_ITEM_UNIVERSAL.detail = "ASN.1 Tag Class";
COMPLETION_ITEM_UNIVERSAL.documentation = UNIVERSAL_DEFINITION;

const COMPLETION_ITEM_APPLICATION = new vscode.CompletionItem(
    "APPLICATION",
    vscode.CompletionItemKind.Keyword,
);
COMPLETION_ITEM_APPLICATION.detail = "ASN.1 Tag Class";
COMPLETION_ITEM_APPLICATION.documentation = APPLICATION_DEFINITION;

const COMPLETION_ITEM_PRIVATE = new vscode.CompletionItem(
    "PRIVATE",
    vscode.CompletionItemKind.Keyword,
);
COMPLETION_ITEM_PRIVATE.detail = "ASN.1 Tag Class";
COMPLETION_ITEM_PRIVATE.documentation = PRIVATE_DEFINITION;

const TAG_CLASS_COMPLETION_ITEMS: vscode.CompletionItem[] = [
    COMPLETION_ITEM_UNIVERSAL,
    COMPLETION_ITEM_APPLICATION,
    COMPLETION_ITEM_PRIVATE,
];

function assignmentTypeToCompletionItemKind(assntype: AssignmentType): vscode.CompletionItemKind {
    switch (assntype) {
        case (AssignmentType.ValueAssignment):
        case (AssignmentType.ParameterizedValueAssignment):
        case (AssignmentType.XMLValueAssignment):
            return vscode.CompletionItemKind.Variable;
        case (AssignmentType.TypeAssignment):
        case (AssignmentType.ParameterizedTypeAssignment):
            return vscode.CompletionItemKind.Struct;
        case (AssignmentType.ObjectAssignment):
        case (AssignmentType.ParameterizedObjectAssignment):
            return vscode.CompletionItemKind.Constant;
        case (AssignmentType.ObjectClassAssignment):
        case (AssignmentType.ParameterizedObjectClassAssignment):
            return vscode.CompletionItemKind.Class;
        case (AssignmentType.ObjectSetAssignment):
        case (AssignmentType.ParameterizedObjectSetAssignment):
            return vscode.CompletionItemKind.Enum;
        case (AssignmentType.ValueSetTypeAssignment):
        case (AssignmentType.ParameterizedValueSetTypeAssignment):
            return vscode.CompletionItemKind.Folder;
    }
}

function provideDefinedSymbolsAsCompletionItems(
    cancel: vscode.CancellationToken,
    currentModule: Module,
    firstCharUppercase?: boolean,
    assignmentType?: AssignmentType,
): vscode.CompletionItem[] {
    const ret: vscode.CompletionItem[] = [];

    for (const assn of Object.values(currentModule.assignments)) {
        if (cancel.isCancellationRequested) {
            return ret;
        }
        const ident = assn.identifier;
        if (!(
            firstCharUppercase === undefined
            || ((ident.slice(0, 1).toUpperCase() === ident.slice(0, 1)) === firstCharUppercase)
        )) {
            continue;
        }

        const unqualified = new vscode.CompletionItem(
            ident,
            assignmentTypeToCompletionItemKind(assn.assignmentType),
        );
        const assnTypeMatches: boolean = !assignmentType || (assignmentType === assn.assignmentType);
        const firstCharMatches: boolean = (
            firstCharUppercase === undefined
            || ((ident.slice(0, 1).toUpperCase() === ident.slice(0, 1)) === firstCharUppercase)
        );
        if (!assnTypeMatches || !firstCharMatches) {
            // Derank this completion item, but do not remove it.
            // If the user needs a type, for example, it could still come from
            // an object or something else, such as `commonName.&Type`.
            unqualified.sortText = "ZZ" + unqualified.label;
        }
        ret.push(unqualified);
    }

    // Return symbols from imports
    for (const sfm of Object.values(currentModule.imports.modules)) {
        if (cancel.isCancellationRequested) {
            return ret;
        }
        for (const sym of Object.keys(sfm.symbolList)) {
            if (cancel.isCancellationRequested) {
                return ret;
            }
            const firstCharMatches: boolean = (
                firstCharUppercase === undefined
                || ((sym.slice(0, 1).toUpperCase() === sym.slice(0, 1)) === firstCharUppercase)
            );
            const unqualified = new vscode.CompletionItem(sym);
            const qualified = new vscode.CompletionItem(sfm.identifier + "." + sym);
            if (!firstCharMatches) {
                unqualified.sortText = "ZZ" + unqualified.label;
            }
            qualified.sortText = "ZZZ" + sym; // Make sure the fully-qualified versions go at the end.
            ret.push(unqualified);
            ret.push(qualified);
        }
    }

    return ret;
}

// Only for use with INSTANCE OF autocomplete
function provideDefinedObjectClasses(
    cancel: vscode.CancellationToken,
    currentModule: Module,
): vscode.CompletionItem[] {
    const ret: vscode.CompletionItem[] = [];
    for (const assn of Object.values(currentModule.assignments)) {
        if (cancel.isCancellationRequested) {
            return ret;
        }
        if (
            (assn.assignmentType !== AssignmentType.ObjectClassAssignment)
            && (assn.assignmentType !== AssignmentType.ParameterizedObjectClassAssignment)
        ) {
            continue;
        }
        if (
            ("fieldSpecs" in assn.objectClass)
            && !(
                ("&id" in assn.objectClass.fieldSpecs)
                && ("&Type" in assn.objectClass.fieldSpecs)
                && (assn.objectClass.fieldSpecs["&id"].specType === FieldSpecType.FixedTypeValueFieldSpec)
                && (
                    assn.objectClass.fieldSpecs["&id"].type.typeType === TypeType.ObjectIdentifierType
                    || typeTypesThatCouldBeAnything.has(assn.objectClass.fieldSpecs["&id"].type.typeType)
                )
                // We have to check for this, because it is in typeTypesThatCouldBeAnything,
                // but not suitable in this case.
                && assn.objectClass.fieldSpecs["&id"].type.typeType !== TypeType.AnyType
            )
        ) {
            // This object class is unsuitable for use in INSTANCE OF.
            continue;
        }
        const unqualified = new vscode.CompletionItem(
            assn.identifier,
            vscode.CompletionItemKind.Class,
        );
        ret.push(unqualified);
    }

    for (const sfm of Object.values(currentModule.imports.modules)) {
        for (const sym of Object.keys(sfm.symbolList)) {
            if (cancel.isCancellationRequested) {
                return ret;
            }
            if (sym !== sym.toUpperCase()) {
                continue; // Could not be an object class.
            }
            const unqualified = new vscode.CompletionItem(sym);
            const qualified = new vscode.CompletionItem(sfm.identifier + "." + sym);
            qualified.sortText = "ZZZ" + sym; // Make sure the fully-qualified versions go at the end.
            ret.push(unqualified);
            ret.push(qualified);
        }
    }

    return [
        COMPLETION_ITEM_TYPE_IDENTIFIER,
        COMPLETION_ITEM_ABSTRACT_SYNTAX,
        ...ret,
    ];
}

function provideAllDefinedObjectClassFields(
    currentModule: Module,
    trimLeadingAmpersand: boolean = false,
): vscode.CompletionItem[] {
    const fieldSettings: Set<string> = new Set();
    for (const assn of Object.values(currentModule.assignments)) {
        if (!(
            assn.assignmentType === AssignmentType.ObjectClassAssignment
            || assn.assignmentType === AssignmentType.ParameterizedObjectClassAssignment
        )) {
            continue;
        }
        const oc = assn.objectClass;
        if (!("fieldSpecs" in oc)) {
            continue;
        }
        for (const fs of Object.keys(oc.fieldSpecs)) {
            fieldSettings.add(trimLeadingAmpersand ? fs.slice(1): fs);
        }
    }
    return Array.from(fieldSettings.values())
        .map((fs) => new vscode.CompletionItem(fs, vscode.CompletionItemKind.Field));
}

function provideSpecificDefinedObjectClassFields(
    currentModule: Module,
    objectClassName: string,
    trimLeadingAmpersand: boolean = false,
): vscode.CompletionItem[] {
    const assn = currentModule.assignments[objectClassName];
    if (
        !assn
        || (assn.assignmentType !== AssignmentType.ObjectClassAssignment)
        || !("fieldSpecs" in assn.objectClass)
    ) {
        return provideAllDefinedObjectClassFields(currentModule, trimLeadingAmpersand);
    }
    return Object.keys(assn.objectClass.fieldSpecs)
        .map((fs) => new vscode.CompletionItem(
            trimLeadingAmpersand ? fs.slice(1) : fs,
            vscode.CompletionItemKind.Field,
        ));
}

function suggestOidPrefixes(
    cancel: vscode.CancellationToken,
    currentModule: Module,
): vscode.CompletionItem[] {
    const valueSuggestions = provideDefinedSymbolsAsCompletionItems(
        cancel,
        currentModule,
        false,
        AssignmentType.ValueAssignment,
    );
    return [
        COMPLETION_ITEM_ARC0,
        COMPLETION_ITEM_ARC1,
        COMPLETION_ITEM_ARC2,
        ...valueSuggestions,
    ];
}

function getFirstLiterals(
    cancel: vscode.CancellationToken,
    t: TokenOrGroupSpec,
): string[] {
    if (cancel.isCancellationRequested) {
        return [];
    }
    if (typeof t === "string") {
        if (t.startsWith("&")) {
            return [];
        }
        return [t];
    } else {
        let firstRequiredIndex = t
            .findIndex((subt) => typeof subt !== "string");
        if (firstRequiredIndex < 0) {
            firstRequiredIndex = 10_000;
        }
        const optionalsSlice = t
            .slice(0, firstRequiredIndex + 1);
        return optionalsSlice
            .flatMap((subt) => getFirstLiterals(cancel, subt));
    }
}

// Only suitable for the first token.
function suggestObjectFirstLiteralTokens(
    cancel: vscode.CancellationToken,
    currentModule: Module,
    oca: ObjectClassAssignment,
): vscode.CompletionItem[] {
    if ("reference" in oca.objectClass) {
        return [];
    }
    const ret: vscode.CompletionItem[] = [];

    // Defined syntax suggestions
    if (oca.objectClass.syntax) {
        const syntax = oca.objectClass.syntax;
        const definedSuggestions = syntax
            .flatMap((t) => getFirstLiterals(cancel, t))
            .map((s) => new vscode.CompletionItem(
                s,
                vscode.CompletionItemKind.Text,
            ))
            ;
        ret.push(...definedSuggestions);
    }

    // Default syntax suggestions
    for (const fs of Object.keys(oca.objectClass.fieldSpecs)) {
        if (cancel.isCancellationRequested) {
            return ret;
        }
        ret.push(new vscode.CompletionItem(
            fs,
            vscode.CompletionItemKind.Field,
        ));
    }

    const otherSuggestions = provideDefinedSymbolsAsCompletionItems(cancel, currentModule);
    ret.push(...otherSuggestions);
    return ret;
}

function suggestObjectsForSet(
    currentModule: Module,
    objectClassRef: string,
): vscode.CompletionItem[] {
    const unqualifiedItems: vscode.CompletionItem[] = [];
    const qualifiedItems: vscode.CompletionItem[] = [];
    for (const assn of Object.values(currentModule.assignments)) {
        if (!(
            (assn.assignmentType === AssignmentType.ObjectAssignment)
            || (assn.assignmentType === AssignmentType.ObjectSetAssignment)
        )) {
            continue;
        }
        if (assn.definedObjectClass.reference !== objectClassRef) {
            continue;
        }
        if (assn.definedObjectClass.module) {
            continue;
        }
        unqualifiedItems.push(new vscode.CompletionItem(
            assn.identifier,
            vscode.CompletionItemKind.Constant, // This is used for objects elsewhere.
        ));
    }
    for (const sfm of Object.values(currentModule.imports.modules)) {
        for (const symbol of Object.keys(sfm.symbolList)) {
            const unqualified = new vscode.CompletionItem(symbol);
            const qualified = new vscode.CompletionItem(sfm.identifier + "." + symbol);
            qualified.sortText = "ZZZ" + qualified.label; // To make sure it shows up last.
            unqualifiedItems.push(unqualified);
            qualifiedItems.push(qualified);
        }
    }
    return [
        ...unqualifiedItems,
        ...qualifiedItems,
    ];
}

function suggestValuesForSet(currentModule: Module): vscode.CompletionItem[] {
    const unqualifiedItems: vscode.CompletionItem[] = [];
    const qualifiedItems: vscode.CompletionItem[] = [];
    for (const assn of Object.values(currentModule.assignments)) {
        if (
            (assn.assignmentType === AssignmentType.ValueAssignment)
            || (assn.assignmentType === AssignmentType.XMLValueAssignment)
        ) {
            unqualifiedItems.push(new vscode.CompletionItem(
                assn.identifier,
                vscode.CompletionItemKind.Variable, // This is used for values elsewhere.
            ));
        }
        // Value sets can appear within value sets.
        else if (assn.assignmentType === AssignmentType.ValueSetTypeAssignment) {
            unqualifiedItems.push(new vscode.CompletionItem(
                assn.identifier,
                vscode.CompletionItemKind.Folder, // This is used for value sets elsewhere.
            ));
        }
    }
    // Any symbol could be a member of a value set.
    for (const sfm of Object.values(currentModule.imports.modules)) {
        for (const symbol of Object.keys(sfm.symbolList)) {
            const unqualified = new vscode.CompletionItem(symbol);
            const qualified = new vscode.CompletionItem(sfm.identifier + "." + symbol);
            qualified.sortText = "ZZZ" + qualified.label; // To make sure it shows up last.
            unqualifiedItems.push(unqualified);
            qualifiedItems.push(qualified);
        }
    }
    return [
        ...unqualifiedItems,
        ...qualifiedItems,
    ];
}

function suggestValueAfterCurlyOpen(
    cancel: vscode.CancellationToken,
    currentModule: Module,
    typeName: string,
): vscode.CompletionItem[] {
    const typeassn = currentModule.assignments[typeName];
    if (typeassn.assignmentType !== AssignmentType.TypeAssignment) {
        return [];
    }
    if (typeassn.type.typeType === TypeType.BitStringType) {
        if (!typeassn.type.type.namedBitList) {
            return [];
        }
        const nbl = typeassn.type.type.namedBitList;
        return nbl.map((nb) => {
            const ci = new vscode.CompletionItem(
                nb.identifier,
                vscode.CompletionItemKind.EnumMember,
            );
            if (typeof nb.number === "number") {
                ci.detail = nb.number.toString();
            } else if (typeof nb.number === "object") {
                ci.detail = nb.number.text;
            }
            return ci;
        });
    }
    if (typeassn.type.typeType === TypeType.ObjectIdentifierType) {
        return suggestOidPrefixes(cancel, currentModule);
    }
    if (
        (typeassn.type.typeType === TypeType.SequenceType)
        || (typeassn.type.typeType === TypeType.SetType)
    ) {
        const t = typeassn.type.type;
        const components: ComponentType[] = [
            ...t.rootComponentTypeList1 ?? [],
            ...t.rootComponentTypeList2 ?? [],
            ...(t.extensionAdditionList ?? [])
                .flatMap((eal) => ("componentTypeList" in eal)
                    ? eal.componentTypeList
                    : eal),
        ];
        const ret: vscode.CompletionItem[] = [];
        for (const component of components) {
            if (cancel.isCancellationRequested) {
                return ret;
            }
            if ("componentsOf" in component) {
                continue;
            }
            const ci = new vscode.CompletionItem(
                component.namedType.identifier,
                vscode.CompletionItemKind.Field,
            );
            if (component.namedType.type.typeType === TypeType.DefinedType) {
                ci.detail = component.namedType.type.text;
            }
            ret.push(ci);
        }
        return ret;
    }
    if (
        (typeassn.type.typeType === TypeType.SequenceOfType)
        || (typeassn.type.typeType === TypeType.SetOfType)
        || (typeassn.type.typeType === TypeType.RelativeOIDType)
    ) {
        return provideDefinedSymbolsAsCompletionItems(
            cancel,
            currentModule,
            false,
            AssignmentType.ValueAssignment,
        );
    }
    if (typeassn.type.typeType === TypeType.RealType) {
        return REAL_COMPLETION_ITEMS;
    }
    return [];
}

function suggestAfterCurlyOpen(
    cancel: vscode.CancellationToken,
    document: vscode.TextDocument,
    position: vscode.Position,
    currentModule: Module,
    lineTextBeforeCursor: string,
): vscode.CompletionItem[] {
    if (
        !cancel.isCancellationRequested
        && /\sOBJECT\s+IDENTIFIER\s+::=\s+\{/.test(lineTextBeforeCursor)
    ) {
        return suggestOidPrefixes(cancel, currentModule);
    }

    // Maybe later. I'm so done working on completions.
    // if (
    //     !cancel.isCancellationRequested
    //     && /\sEMBEDDED\s+PDV\s+::=\s+\{/.test(lineTextBeforeCursor)
    // ) {
    //     return [];
    // }

    // if (
    //     !cancel.isCancellationRequested
    //     && /\sCHARACTER\s+STRING\s+::=\s+\{/.test(lineTextBeforeCursor)
    // ) {
    //     return [];
    // }

    if (
        !cancel.isCancellationRequested
        && /\sREAL\s+::=\s+\{/.test(lineTextBeforeCursor)
    ) {
        return REAL_COMPLETION_ITEMS;
    }

    // If the curly is prefixed by an identifier that is defined, we can
    // assume that this is a parameterized `Defined*` thing and suggest
    // parameter values.
    const definedColumn = lineTextBeforeCursor
        .trimEnd()
        .slice(0, -1) // Trim the "{"
        .trimEnd()
        .length - 1;
    if (definedColumn >= 0) {
        const defpos = new vscode.Position(position.line, definedColumn);
        const wordRange = document.getWordRangeAtPosition(defpos);        
        const reference = wordRange && document.getText(wordRange);
        if (reference) {
            const isDefined =
                currentModule.assignments[reference]
                || Object.values(currentModule.imports.modules)
                    .some((sfm) => Object
                        .keys(sfm.symbolList)
                        .some((sym) => sym === reference));
            if (isDefined) {
                return provideDefinedSymbolsAsCompletionItems(cancel, currentModule);
            }
        }
    }

    // Ignore if this is an imported symbol, such as Attribute{}
    if (cancel.isCancellationRequested || !/\s::=\s*\{$/.test(lineTextBeforeCursor)) {
        return [];
    }
    // Anything after this CANNOT be a Type Assignment or an XML Value Assignment.
    // It cannot be an Object Class Assignment either.

    // It can only be one of these (or the parameterized equivalents)
    // - valuereference Type "::=" Value
    // - typereference Type "::=" ValueSet
    // - objectreference DefinedObjectClass "::=" Object
    // - objectsetreference DefinedObjectClass "::=" ObjectSet
    // The parameters, if present, go after the identifier.
    // That means we can check if the last lexeme (after removing comments and whitespace)
    // is an object class reference, then all we have to check is whether
    // the first character is uppercase or lowercase to decide between the last two
    // alternatives.

    const lastEq = cancel.isCancellationRequested
        ? -1
        : lineTextBeforeCursor.lastIndexOf("::=");
    if (lastEq < 0) {
        return []; // Does not look like an assignment.
    }
    const lhs = lineTextBeforeCursor.slice(0, lastEq).trim();
    if (lhs.includes("::=") || lhs.length === 0) {
        return []; // Two ::= in the same line. Not sure WTF is going on here.
    }

    let lexemes: LexedTokens;
    try {
        lexemes = Array.from(lex(lhs));
    } catch {
        return [];
    }
    const nonCommentLexemes = lexemes.filter((l) => l.type !== "comment");
    const significantLexemes = nonCommentLexemes
        .filter((l) => (
            (l.type !== "newlineWhitespace")
            && (l.type !== "nonNewlineWhitespace")
        ));

    const first = significantLexemes.shift();
    const last = significantLexemes.pop();
    if (!first || !last) {
        return [];
    }
    let isIdentUpper: boolean;
    if (first.type === "identifier") {
        isIdentUpper = false;
    } else if (first.type === "typereference") {
        isIdentUpper = true;
    } else {
        return [];
    }

    if (last.type !== "objectclassreference") {
        // It must be one of:
        // - valuereference Type "::=" Value
        // - typereference Type "::=" ValueSet
        if (isIdentUpper) {
            // It must be: typereference Type "::=" ValueSet
            return suggestValuesForSet(currentModule);
        } else {
            const typetext = lhs.slice(last.location.startIndex, last.location.endIndex);
            // It must be: valuereference Type "::=" Value
            return suggestValueAfterCurlyOpen(cancel, currentModule, typetext);
        }
    }

    // The last thing before the ::= is an all-uppercased identifier.
    // This can be a type reference or an object class reference.
    // So we have to look up what it is.
    const typetext = lhs.slice(last.location.startIndex, last.location.endIndex);
    const typeassn = currentModule.assignments[typetext];
    if (!typeassn) {
        return []; // No idea what this reference is.
    }
    if (typeassn.assignmentType === AssignmentType.ObjectClassAssignment) {
        if (isIdentUpper) {
            // It must be: objectsetreference DefinedObjectClass "::=" ObjectSet
            return suggestObjectsForSet(currentModule, typetext);
        } else {
            // It must be: objectreference DefinedObjectClass "::=" Object
            return suggestObjectFirstLiteralTokens(cancel, currentModule, typeassn);
        }
    } else if (
        (typeassn.assignmentType === AssignmentType.TypeAssignment)
        || (typeassn.assignmentType === AssignmentType.ValueSetTypeAssignment)
    ) {
        if (isIdentUpper) {
            // It must be: typereference Type "::=" ValueSet
            return suggestValuesForSet(currentModule);
        } else {
            // It must be: valuereference Type "::=" Value
            return suggestValueAfterCurlyOpen(cancel, currentModule, typetext);
        }
    } else {
        return []; // Anything else is invalid.
    }
}

function lookupObjectClassNameBeforePeriod(
    document: vscode.TextDocument,
    position: vscode.Position,
    currentModule: Module,
    lineEndingWithObjectClassName: string,
    trimLeadingAmpersand: boolean = false,
): vscode.CompletionItem[] | null {
    const line = lineEndingWithObjectClassName; // Just for a shorter name.
    if (lineEndingWithObjectClassName.length < 1) {
        return null;
    }
    const wordPos = new vscode.Position(position.line, line.length - 1);
    const wordRange = document.getWordRangeAtPosition(wordPos);
    const objectClassRef = wordRange && document.getText(wordRange);
    if (objectClassRef) {
        const typeassn = currentModule.assignments[objectClassRef];
        if (!typeassn) {
            return null;
        }
        return provideSpecificDefinedObjectClassFields(
            currentModule,
            objectClassRef,
            trimLeadingAmpersand
        );
    }
    return null;
}

/**
 * @description
 * 
 * This function was written just for clarity as to what rejecting with `null`
 * does. Returning a promise that resolves with `[]` also does the same exact
 * thing.
 * 
 * This function also makes it easy to set a break point at every case where
 * the default completions are returned.
 *
 * @returns The default VS Code completion items
 */
function getVSCodeDefaultCompletions(): Promise<vscode.CompletionItem[]> {
    return Promise.reject(null);
}

/* Unfortunately, this implementation does not detect if the user is in a block
comment very well. I haven't found an algorithm for checking this that is
acceptably fast enough. */
async function provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext,
): Promise<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
    const line = document.lineAt(position.line);
    const lineTextBeforeCursor = line.text.slice(0, position.character);
    if (inOpenSyntaxRegion(lineTextBeforeCursor)) {
        // Don't provide completions, because we are in a comment
        // or string or something.
        return getVSCodeDefaultCompletions();
    }
    // Try to avoid suggestions if the user is typing out a block comment.
    if (context.triggerCharacter && line.text.trimEnd().endsWith("*/")) {
        // Avoid providing 
        return getVSCodeDefaultCompletions();
    }

    const trimmed = lineTextBeforeCursor.trimEnd();
    const lastSigChar = trimmed[trimmed.length - 1];

    // These can be provided without previous module parsing, because we know
    // all valid values for these already.
    if (lastSigChar === "." && !trimmed.endsWith("..")) {
        if (/\bTYPE-IDENTIFIER\s*\.$/.test(lineTextBeforeCursor)) {
            return [
                COMPLETION_ITEM_TI_TYPE,
                COMPLETION_ITEM_ID,
            ];
        }
        if (/\bABSTRACT-SYNTAX\s*\.$/.test(lineTextBeforeCursor)) {
            return [
                COMPLETION_ITEM_AS_TYPE,
                COMPLETION_ITEM_ID,
                COMPLETION_ITEM_PROPERTY,
            ];
        }
        if (/\sBOOLEAN\s+DEFAULT\s+$/.test(lineTextBeforeCursor)) {
            return [
                COMPLETION_ITEM_FALSE,
                COMPLETION_ITEM_TRUE,
            ];
        }
    }

    const outputs = getLastValidParserOutputs(document.uri);
    if (
        !outputs
        || !outputs.parsedModules
        || ("err" in outputs.parsedModules)
    ) {
        return getVSCodeDefaultCompletions();
    }
    const modules = outputs.parsedModules.ok;
    const currentModule = modules
        .find((mod) => (
            mod.production
            && positionFallsWithin(document, position, mod.production)
        ));
    if (!currentModule) {
        return getVSCodeDefaultCompletions(); // User isn't even within an ASN.1 module.
    }

    const whitespaceWasTrimmedFromEnd: boolean = trimmed.length !== lineTextBeforeCursor.length;
    if (whitespaceWasTrimmedFromEnd) {
        if (/\sDEFAULT\s+$/.test(lineTextBeforeCursor)) {
            // We don't know if this is supposed to be a type or a value yet.
            let preferUpper: boolean | undefined;
            const classFieldHaystack = lineTextBeforeCursor.slice(0, -7);
            if (/&[A-Z]/.test(classFieldHaystack)) {
                preferUpper = true; // This is an object class' set field or type field
            } else if (/&[a-z]/.test(classFieldHaystack)) {
                preferUpper = false; // This is an object class' value field or object field
            }
            return provideDefinedSymbolsAsCompletionItems(token, currentModule, preferUpper);
        }

        if (/\sINSTANCE\s+OF\s+$/.test(lineTextBeforeCursor)) {
            return provideDefinedObjectClasses(token, currentModule);
        }

        if (
            /\sCOMPONENTS\s+OF\s+$/.test(lineTextBeforeCursor)
            || /\sSEQUENCE\s+OF\s+$/.test(lineTextBeforeCursor)
            || /\sSET\s+OF\s+$/.test(lineTextBeforeCursor)
            // This is only syntactically valid as part of "SET SIZE (1..MAX) OF" et al.
            || /\)\s+OF\s+$/.test(lineTextBeforeCursor)
        ) {
            // This MUST be a type identifier, but the type could come from an object...
            return provideDefinedSymbolsAsCompletionItems(token, currentModule, true);
        }
    }

    if (lastSigChar === "|" || trimmed.endsWith("::=")) {
        return provideDefinedSymbolsAsCompletionItems(token, currentModule);
    } else if (lastSigChar === "[" && !trimmed.endsWith("[[")) {
        /* This could be for an `OptionalGroup`, but the tag class names are allowed there too. */
        return TAG_CLASS_COMPLETION_ITEMS;
    } else if (lastSigChar === ":") {
        // These are the encoding references defined in ITU-T Recommendation X.680 (2021).
        // If the user types these in, the next possible suggestions are tag classes.
        if (/(TAG|XER|PER)\s*:$/.test(trimmed)) {
            return TAG_CLASS_COMPLETION_ITEMS;
        }

        // If preceeded by a number, ":" it is likely for a `VersionNumber` in `ExtensionAdditionGroup`
        // We can't recommend anything in this case, because what comes next is a component identifier.
        if (/\d+\s*:$/.test(trimmed)) {
            return getVSCodeDefaultCompletions();
        }
    
        /* This works for `ChoiceValue`, `ExceptionIdentification`,
        `OpenTypeFieldVal`, and `UserDefinedConstraintParameter` */
        return provideDefinedSymbolsAsCompletionItems(token, currentModule);
    } else if (lastSigChar === "&") {
        // If the thing before the dot is an object or OS with known class, suggest fields for it
        const trimmedBeforeAmpersand = trimmed.slice(0, -1).trimEnd();
        if (trimmedBeforeAmpersand.endsWith(".")) {
            const trimmedBeforePeriod = trimmed.slice(0, -1).trimEnd();
            const objClassFields = lookupObjectClassNameBeforePeriod(
                document,
                position,
                currentModule,
                trimmedBeforePeriod,
                true,
            );
            if (objClassFields) {
                return objClassFields;
            }
        }
        return provideAllDefinedObjectClassFields(currentModule, true);
    } else if (lastSigChar === "{") {
        return suggestAfterCurlyOpen(token, document, position, currentModule, lineTextBeforeCursor);
    } else if (lastSigChar === "." && !trimmed.endsWith("..") && !trimmed.includes(">")) {
        // If the thing before the dot is an object or OS with known class, suggest fields for it
        const moreTrimmed = trimmed.slice(0, -1).trimEnd();
        const objClassFields = lookupObjectClassNameBeforePeriod(
            document,
            position,
            currentModule,
            moreTrimmed,
            false,
        );
        if (objClassFields) {
            return objClassFields;
        }
        return provideDefinedSymbolsAsCompletionItems(token, currentModule);
    } else if (lastSigChar === "<" && !trimmed.includes(">")) {
        return provideDefinedSymbolsAsCompletionItems(token, currentModule);
    } else if (lastSigChar === ",") {
        // This code will probably be used for signature help.
        let i = trimmed.length - 2;
        let depth: number = 0;
        while (i >= 0) {
            if (token.isCancellationRequested) {
                return getVSCodeDefaultCompletions();
            }
            const chari = trimmed.charAt(i);
            if (chari === "}") {
                depth++;
            } else if (chari === "{") {
                if (depth === 0) {
                    break;
                }
                depth--;
            }
            i--;
        }
        if (i === 0) {
            return getVSCodeDefaultCompletions();
        }
        // Otherwise, we balanced curly brackets: whatever came before might be an identifier.
        const beforeCurly = trimmed.slice(0, i).trimEnd(); // Remember, upper is EXCLUSIVE.
        const wordPos = new vscode.Position(position.line, beforeCurly.length - 1);
        const wordRange = document.getWordRangeAtPosition(wordPos);
        const wordText = wordRange && document.getText(wordRange);
        if (wordText) {
            const typeassn = currentModule.assignments[wordText];
            if (!typeassn?.parameters?.length) {
                return getVSCodeDefaultCompletions();
            }
            // Looks like a parameterized `Defined*` thing. Suggest other
            // `Defined*` things as parameters.
            return provideDefinedSymbolsAsCompletionItems(token, currentModule);
        }
    }

    // Decision: not providing completion for @ identifiers.
    // Too hard, rarely used, and the identifiers are local to the type
    // assignment, which is necessarily in flux as the user types.
    return getVSCodeDefaultCompletions();
}

export class Asn1CompletionItemProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext,
    ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
        return provideCompletionItems(document, position, token, context);
    }
}
