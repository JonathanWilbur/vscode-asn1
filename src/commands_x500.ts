/**
 * Module for X.500-specific commands.
 */
import * as vscode from "vscode";
import { getParserOutputs } from "./parsing.js";
import {
    AssignmentType,
    builtinRootArcNamesToNumber,
    ValueType,
    type NameAndOrNumber,
    type ObjectIdentifierValue,
    type Module,
    type Location,
    TypeType,
    TaggingMode,
    type Defined,
    type ObjectAssignment,
    type Object_,
    type ObjectDefn,
    type Setting,
    type Value,
    type CharacterStringValue,
} from "@wildboar/asn1-parser";
import { resolveAssignedIdentifier, resolveDefined, resolveObjectDefn, resolveOID, resolveOIDComponents, resolveOidValue } from "./resolve.js";
import {
    getOidNodesFromModuleIdentifier,
    getRangeFromLocation,
    nameAndOrNumberToIriString,
    nameAndOrNumberToString,
    typeTypesThatCouldBeAnything,
} from "./utils.js";
import type { BOOLEAN, UTF8String } from "@wildboar/asn1";

export type RawASN1Text = string;

export type AttributeUsage =
    | "userApplications"
    | "directoryOperation"
    | "distributedOperation"
    | "dSAOperation"
    ;

export interface OidJSON {
    arcs?: NameAndOrNumber[];
    numeric?: number[];
    referenceModule?: string;
    referenceIdentifier?: string;
}

export interface LocationJSON {
    moduleName: string;
    moduleOid?: OidJSON;
    moduleIri?: string;
    startOffsetIntoFile?: number;
    endOffsetIntoFile?: number;
    startLineOneIndexed?: number;
    startColumnOneIndexed?: number;
    assignmentName?: string;
    assignmentIndex?: number;
    relativeFilePath?: string;
}

export interface SchemaItemJSON<
S,
K extends string,
O extends string,
> {
    objectClass: O,
    location: LocationJSON;
    settings: S;
    rawSettings: Partial<Record<K, string>>;
};

export interface X500AttributeSettingsJSON {
    name: string;
    oid: OidJSON;
    subtypeOfAttributeOid?: OidJSON;
    withSyntaxText?: RawASN1Text;
    equalityMatchingRule?: OidJSON;
    orderingMatchingRule?: OidJSON;
    substringsMatchingRule?: OidJSON;
    singleValue: boolean;
    collective: boolean;
    dummy: boolean;
    noUserMod: boolean;
    usage: AttributeUsage;
    ldapSyntaxOid?: OidJSON;
    ldapNames?: string[];
    ldapDesc?: string;
    obsolete: boolean;
}

export type X500AttributeJSON = SchemaItemJSON<
    X500AttributeSettingsJSON,
    X500AttributeField,
    "ATTRIBUTE"
>;

export interface X500JSONExport {
    ok: boolean;
    note?: string;
    attributes: X500AttributeJSON[];
}

const CANCELLED_EXPORT_RET: X500JSONExport = {
    ok: false,
    note: "Export was cancelled.",
    attributes: [],
};

// const X500_MATCHING_RULE_CSV_HEADER: string [
// // [PARENT                 &ParentMatchingRules]
// //   [SYNTAX                 &AssertionType]
// //   [UNIQUE-MATCH-INDICATOR &uniqueMatchIndicator]
// //   [LDAP-SYNTAX            &ldapSyntax]
// //   [LDAP-NAME              &ldapName]
// //   [LDAP-DESC              &ldapDesc]
// //   ID                      &id }
// ].join(",");

function failExport(): never {
    // TODO: Do something better than this.
    throw new Error("Export failed");
}

type X500AttributeField =
    | "&derivation"
    | "&Type"
    | "&equality-match"
    | "&ordering-match"
    | "&substrings-match"
    | "&single-valued"
    | "&collective"
    | "&dummy"
    | "&no-user-modification"
    | "&usage"
    | "&ldapSyntax"
    | "&ldapName"
    | "&ldapDesc"
    | "&obsolete"
    | "&id"
    ;

const x500AttributeLiteralToSettingExpectation: Map<string, X500AttributeField> = new Map([
    [ "OF", "&derivation" ],
    [ "SYNTAX", "&Type" ],
    [ "EQUALITY", "&equality-match" ],
    [ "ORDERING", "&ordering-match" ],
    [ "SUBSTRINGS", "&substrings-match" ],
    [ "VALUE", "&single-valued" ],
    [ "COLLECTIVE", "&collective" ],
    [ "DUMMY", "&dummy" ],
    [ "MODIFICATION", "&no-user-modification" ],
    [ "USAGE", "&usage" ],
    [ "LDAP-SYNTAX", "&ldapSyntax" ],
    [ "LDAP-NAME", "&ldapName" ],
    [ "LDAP-DESC", "&ldapDesc" ],
    [ "OBSOLETE", "&obsolete" ],
    [ "ID", "&id" ],
]);

function malformedX500SchemaObject(
    modName: string,
    className: string,
    identifier: string,
    message: string,
): never {
    throw new Error(`Error in ${className} object ${identifier} in ${modName}: ${message}`);
}

function oidToJSON(
    arcs: NameAndOrNumber[],
    ref?: Defined,
): OidJSON {
    const nums = getOidNodesFromModuleIdentifier(arcs);
    return {
        arcs,
        numeric: nums ?? undefined,
        referenceModule: ref?.module ?? ref?.computedModule,
        referenceIdentifier: ref?.reference,
    };
}

async function getOidFromSetting<FieldNameType extends string = string>(
    cancel: vscode.CancellationToken,
    document: vscode.TextDocument,
    currentModule: Module,
    identifier: string,
    setting: Setting | undefined,
    fieldName: FieldNameType,
): Promise<OidJSON | undefined> {
    if (!setting) {
        return undefined;
    }
    let def: Defined | undefined;

    if (!("value" in setting)) {
        malformedX500SchemaObject(
            currentModule.name,
            "ATTRIBUTE",
            identifier,
            `field ${fieldName} was not interpreted as a value`
        );
    }
    const value: Value = setting.value;
    if (value.valueType === ValueType.DefinedValue) {
        const ref = value.value;
        const obj = await resolveObjectDefn(
            cancel,
            ref,
            currentModule,
            document.uri,
        );
        if (!obj) {
            throw new Error(`Failed to resolve ${ref.reference} in ${currentModule.name}`);
        }
        if ("tokens" in obj) {

        } else if ("fieldSettings" in obj) {
            
        }
        // Object = DefinedObject | ObjectDefn | ObjectFromObject;
        // return oidToJSON(resolved, ref);
    } else {
        throw new Error(`Failed to resolve an oid in ${identifier} in ${currentModule.name}`);
    }
}

async function getBoolFromSetting<FieldNameType extends string = string>(
    cancel: vscode.CancellationToken,
    document: vscode.TextDocument,
    currentModule: Module,
    identifier: string,
    setting: Setting | undefined,
    fieldName: FieldNameType,
): Promise<BOOLEAN | undefined> {
    if (!setting) {
        return undefined;
    }
    if (!("value" in setting)) {
        malformedX500SchemaObject(
            currentModule.name,
            "ATTRIBUTE", // TODO: This will have to change.
            identifier,
            `field ${fieldName} was not interpreted as a value`
        );
    }
    const value: Value = setting.value;
    if (value.valueType === ValueType.BooleanValue) {
        return value.value;
    } else if (value.valueType === ValueType.DefinedValue) {
        const ref = value.value;
        const resolved = await resolveDefined(
            cancel,
            ref.module ?? ref.computedModule,
            ref.reference,
            currentModule,
            document.uri,
        );
        if (!resolved) {
            throw new Error(`Failed to resolve ${ref.reference}`);
        }
        const [ assn ] = resolved;
        if (assn.assignmentType !== AssignmentType.ValueAssignment) {
            throw new Error(`Resolved ${ref.reference} in ${identifier} in ${currentModule.name} to a ${assn.assignmentType}`);
        }
        if (assn.value.valueType !== ValueType.BooleanValue) {
            throw new Error(`Resolved ${ref.reference} in ${identifier} in ${currentModule.name} to a ${assn.value.valueType}`);
        }
        return assn.value.value;
    } else {
        throw new Error(`Failed to resolve an oid in ${identifier} in ${currentModule.name}`);
    }
}

async function getStringFromSetting<FieldNameType extends string = string>(
    cancel: vscode.CancellationToken,
    document: vscode.TextDocument,
    currentModule: Module,
    identifier: string,
    setting: Setting | undefined,
    fieldName: FieldNameType,
): Promise<UTF8String | undefined> {
    if (!setting) {
        return undefined;
    }
    if (!("value" in setting)) {
        malformedX500SchemaObject(
            currentModule.name,
            "ATTRIBUTE", // TODO: This will have to change.
            identifier,
            `field ${fieldName} was not interpreted as a value`
        );
    }
    const value: Value = setting.value;
    let cs: CharacterStringValue;
    if (value.valueType === ValueType.CharacterStringValue) {
        cs = value.value;
    } else if (value.valueType === ValueType.DefinedValue) {
        const ref = value.value;
        const resolved = await resolveDefined(
            cancel,
            ref.module ?? ref.computedModule,
            ref.reference,
            currentModule,
            document.uri,
        );
        if (!resolved) {
            throw new Error(`Failed to resolve ${ref.reference}`);
        }
        const [ assn ] = resolved;
        if (assn.assignmentType !== AssignmentType.ValueAssignment) {
            throw new Error(`Resolved ${ref.reference} in ${identifier} in ${currentModule.name} to a ${assn.assignmentType}`);
        }
        if (assn.value.valueType !== ValueType.CharacterStringValue) {
            throw new Error(`Resolved ${ref.reference} in ${identifier} in ${currentModule.name} to a ${assn.value.valueType}`);
        }
        cs = assn.value.value;
    } else {
        throw new Error(`Failed to resolve an oid in ${identifier} in ${currentModule.name}`);
    }
    if (typeof value.value !== "string") {
        malformedX500SchemaObject(
            currentModule.name,
            "ATTRIBUTE",
            identifier,
            "unusable / not-implemented character string syntax in field " + fieldName,
        );
    }
    return value.value;
}

async function getEnumFromSetting<
    FieldNameType extends string = string,
>(
    _cancel: vscode.CancellationToken,
    document: vscode.TextDocument,
    currentModule: Module,
    identifier: string,
    setting: Setting | undefined,
    fieldName: FieldNameType,
): Promise<string | undefined> {
    if (!setting) {
        return undefined;
    }
    if (!("value" in setting)) {
        malformedX500SchemaObject(
            currentModule.name,
            "ATTRIBUTE", // TODO: This will have to change.
            identifier,
            `field ${fieldName} was not interpreted as a value`
        );
    }
    const value: Value = setting.value;
    if (value.text) {
        return value.text;
    }
    if (value.production) {
        const range = getRangeFromLocation(document, value.production.location);
        return document.getText(range);
    }
    if (value.valueType === ValueType.EnumeratedValue) {
        return value.value.identifier;
    } else if (
        (value.valueType === ValueType.DefinedValue)
        && !value.value.module
        && !value.value.parameters?.length
    ) {
        // Because I think enums can be mistaken for defined values
        return value.value.reference;
    } else {
        malformedX500SchemaObject(
            currentModule.name,
            "ATTRIBUTE",
            identifier,
            "unusable / not-implemented enum value syntax in field " + fieldName,
        );
    }
}

const ATTRIBUTE_USAGES: string[] = [
    "userApplications",
    "dSAOperation",
    "directoryOperation",
    "distributedOperation",
] satisfies AttributeUsage[];

function isAttributeUsage(s: string): s is AttributeUsage {
    return ATTRIBUTE_USAGES.includes(s);
}

async function getX500AttributeJSONFromDefaultSyntax(
    cancel: vscode.CancellationToken,
    document: vscode.TextDocument,
    currentModule: Module,
    identifier: string,
    defaultSyntax: Map<X500AttributeField, Setting>,
    location: LocationJSON,
): Promise<X500AttributeJSON> {
    const name: string = identifier;
    let withSyntaxText: RawASN1Text | undefined;
    let ldapNames: string[] | undefined;

    const oidField = defaultSyntax.get("&id");
    if (!oidField) {
        malformedX500SchemaObject(
            currentModule.name,
            "ATTRIBUTE",
            identifier,
            "missing &id"
        );
    }
    const common = [
        cancel,
        document,
        currentModule,
        identifier,
    ] as const;
    const oid = await getOidFromSetting<X500AttributeField>(
        ...common,
        defaultSyntax.get("&id"),
        "&id",
    );
    if (!oid) {
        malformedX500SchemaObject(
            currentModule.name,
            "ATTRIBUTE",
            identifier,
            "missing &id"
        );
    }
    const subtypeOfAttributeOid = await getOidFromSetting<X500AttributeField>(
        ...common,
        defaultSyntax.get("&equality-match"),
        "&equality-match",
    );
    const emroid = await getOidFromSetting<X500AttributeField>(
        ...common,
        defaultSyntax.get("&equality-match"),
        "&equality-match",
    );
    const omroid = await getOidFromSetting<X500AttributeField>(
        ...common,
        defaultSyntax.get("&ordering-match"),
        "&ordering-match",
    );
    const smroid = await getOidFromSetting<X500AttributeField>(
        ...common,
        defaultSyntax.get("&substrings-match"),
        "&substrings-match",
    );
    const ldapoid = await getOidFromSetting<X500AttributeField>(
        ...common,
        defaultSyntax.get("&ldapSyntax"),
        "&ldapSyntax",
    );
    const ldapDesc = await getStringFromSetting<X500AttributeField>(
        ...common,
        defaultSyntax.get("&ldapSyntax"),
        "&ldapSyntax",
    );
    const singleValue = (await getBoolFromSetting<X500AttributeField>(
        ...common,
        defaultSyntax.get("&single-valued"),
        "&single-valued",
    )) ?? false;
    const collective = (await getBoolFromSetting<X500AttributeField>(
        ...common,
        defaultSyntax.get("&collective"),
        "&collective",
    )) ?? false;
    const dummy = (await getBoolFromSetting<X500AttributeField>(
        ...common,
        defaultSyntax.get("&dummy"),
        "&dummy",
    )) ?? false;
    const noUserMod = (await getBoolFromSetting<X500AttributeField>(
        ...common,
        defaultSyntax.get("&no-user-modification"),
        "&no-user-modification",
    )) ?? false;
    const obsolete = (await getBoolFromSetting<X500AttributeField>(
        ...common,
        defaultSyntax.get("&obsolete"),
        "&obsolete",
    )) ?? false;
    const usage: string = (await getEnumFromSetting<X500AttributeField>(
        ...common,
        defaultSyntax.get("&usage"),
        "&usage",
    ) ?? "userApplications");
    if (!isAttributeUsage(usage)) {
        throw new Error();
    }

    const rawSettings: X500AttributeJSON["rawSettings"] = {};
    for (const [settingName, setting] of defaultSyntax.entries()) {
        if (setting.text) {
            rawSettings[settingName] = setting.text;
        } else if (setting.production) {
            const range = getRangeFromLocation(document, setting.production.location);
            rawSettings[settingName] = document.getText(range);
        } else if ("value" in setting) {
            const value = setting.value;
            if (
                (value.valueType === ValueType.DefinedValue)
                && !value.value.module
                && !value.value.parameters?.length
            ) {
                rawSettings[settingName] = value.value.reference;
            } else if (value.valueType === ValueType.EnumeratedValue) {
                rawSettings[settingName] = value.value.identifier;
            }
        } 
    }

    return {
        objectClass: "ATTRIBUTE",
        location,
        settings: {
            name: identifier,
            oid,
            subtypeOfAttributeOid,
            equalityMatchingRule: emroid,
            orderingMatchingRule: omroid,
            substringsMatchingRule: smroid,
            ldapSyntaxOid: ldapoid,
            ldapDesc,
            singleValue,
            collective,
            dummy,
            noUserMod,
            obsolete,
            usage,
        },
        rawSettings,
    };
}

async function parseX500Attribute(
    cancel: vscode.CancellationToken,
    document: vscode.TextDocument,
    currentModule: Module,
    identifier: string,
    obj: ObjectDefn,
    loc: LocationJSON,
): Promise<X500AttributeJSON> {
    const defaultSyntax: Map<X500AttributeField, Setting> = new Map();
    if ("tokens" in obj) {
        const tokens = obj.tokens;
        let expecting: X500AttributeField | undefined;
        for (const token of tokens) {
            const settingExpectation = x500AttributeLiteralToSettingExpectation.get(token.toString());
            if (settingExpectation) {
                expecting = settingExpectation;
            }
            if (typeof token === "string") {
                continue;
            }
            const setting: Setting = token;
            if (!expecting) {
                malformedX500SchemaObject(
                    currentModule.name,
                    "ATTRIBUTE",
                    identifier,
                    "setting not expected",
                );
            }
            defaultSyntax.set(expecting, setting);
            expecting = undefined;
        }
    } else {
        const settings = obj.fieldSettings;
        for (const [name, setting] of Object.entries(settings)) {
            defaultSyntax.set(name as X500AttributeField, setting);
        }
    }
    return getX500AttributeJSONFromDefaultSyntax(
        cancel,
        document,
        currentModule,
        identifier,
        defaultSyntax,
        loc,
    );
}

export
async function get_x500_schema_json_from_doc(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
): Promise<X500JSONExport> {
    const p = await getParserOutputs(document, undefined, token);
    if (!p.parsedModules || ("err" in p.parsedModules)) {
        return failExport();
    }
    const ret: X500JSONExport = {
        ok: false,
        note: "Fields with names ending with 'Text' may contain any valid ASN.1--not just references like 'caseIgnoreMatch'.",
        attributes: [],
    };
    const relativeFilePath: string = vscode.workspace.asRelativePath(document.uri);
    const modules = p.parsedModules.ok;
    for (const mod of modules) {
        if (token.isCancellationRequested) {
            return CANCELLED_EXPORT_RET;
        }
        const modnums = mod.oid
            ? getOidNodesFromModuleIdentifier(mod.oid)
            : undefined;

        for (const assn of Object.values(mod.assignments)) {
            if (assn.assignmentType !== AssignmentType.ObjectAssignment) {
                continue;
            }
            if (assn.parameters?.length) {
                continue; // We don't handle parameterized assignments.
            }
            // TODO: This will have to change if you support SEARCH-RULE, OPERATIONAL-BINDING, etc.
            if (assn.definedObjectClass.computedModule !== "InformationFramework") {
                continue;
            }
            const prod = assn.production;
            const objClassName = [
                assn.definedObjectClass.computedModule,
                assn.definedObjectClass.reference,
            ].join(".");
            const location: LocationJSON = {
                moduleName: mod.name,
                moduleOid: {
                    arcs: mod.oid,
                    numeric: modnums ?? undefined,
                },
                moduleIri: mod.iri,
                assignmentName: assn.identifier,
                assignmentIndex: assn.originalIndex,
                startOffsetIntoFile: prod?.location.startIndex,
                endOffsetIntoFile: prod?.location.endIndex,
                startLineOneIndexed: prod?.location.lineNumber,
                startColumnOneIndexed: prod?.location.columnNumber,
                relativeFilePath,
            };
            switch (objClassName) {
                case ("InformationFramework.ATTRIBUTE"): {
                    if ("reference" in assn.object || "referencedObjects" in assn.object) {
                        // This isn't a real, novel assignment. It's just an alias.
                        continue;
                    }
                    const attr = await parseX500Attribute(
                        token,
                        document,
                        mod,
                        assn.identifier,
                        assn.object,
                        location,
                    );
                    ret.attributes.push(attr);
                    break;
                }
                default: continue;
            }
        }
    }
    ret.ok = true;
    return ret;
}

export async function export_x500_schema_json_from_doc_cmd(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const document = editor?.document;
    if (!document) {
        return; // TODO: Show error message.
    }
    const cts = new vscode.CancellationTokenSource();
    const json = await get_x500_schema_json_from_doc(document, cts.token);
    const jsonDocument = await vscode.workspace.openTextDocument({
        language: "json",
        content: JSON.stringify(json, undefined, 4),
    });
    await vscode.window.showTextDocument(jsonDocument);
}
