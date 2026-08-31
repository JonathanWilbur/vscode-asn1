import * as vscode from "vscode";
import {
    AssignmentType,
    FieldSpecType,
    TypeType,
    ValueType,
    getUnprefixedType,
    translateDefinedSyntaxToDefaultSyntax,
    type Assignment,
    type DefaultSyntax,
    type Defined,
    type EnumeratedType,
    type FieldSpec,
    type Module,
    type ObjectAssignment,
    type ObjectClassAssignment,
    type ObjectClassDefn,
    type Setting,
    type Type,
} from "@wildboar/asn1-parser";
import { resolveDefined } from "./resolve.js";
import { log } from "./logging.js";
import { startsWithLowercaseLetter } from "./utils.js";
import type { FileURIStr, VersionNumber } from "./types.js";

/**
 * Cache of resolved information-object-class ENUMERATED variants, scoped to
 * an importing ASN.1 module at a given document version.
 */
interface ImportingModuleEnumCache {
    /** Document URI this cache was built for */
    readonly uri: FileURIStr;
    /** Document version this cache was built for */
    readonly version: VersionNumber;
    /** Name of the importing ASN.1 module */
    readonly moduleName: string;
    /**
     * Object class reference (`module:identifier`) to field name (with `&`)
     * to the `ENUMERATED` variants of that value field.
     */
    readonly variantsByClassAndField: Map<string, Map<string, Set<string>>>;
    /**
     * Object class references whose ENUMERATED variant index has already been
     * populated (and logged).
     */
    readonly populatedClasses: Set<string>;
    /**
     * Object assignment identifier to its `DefaultSyntax` equivalent, or
     * `null` if translation was attempted and failed.
     */
    readonly defaultSyntaxByObject: Map<string, DefaultSyntax | null>;
    /**
     * Object class reference to the resolved class assignment, the module
     * where it is defined, and that module's file URI. `null` if resolution
     * was attempted and failed.
     */
    readonly resolvedClasses: Map<string, [ObjectClassAssignment, Module, vscode.Uri] | null>;
}

const caches: Map<string, ImportingModuleEnumCache> = new Map();

/**
 * @summary Build a cache key for an importing module at a document version
 * @param uri The document URI
 * @param version The document version
 * @param moduleName The importing ASN.1 module name
 * @returns A cache key
 * @function
 */
function cacheKey(uri: FileURIStr, version: VersionNumber, moduleName: string): string {
    return `${uri}::${version}::${moduleName}`;
}

/**
 * @summary Get or create the implicit-enum-import cache for an importing module
 * @description
 *
 * The cache is scoped to the importing ASN.1 module at a given document
 * version. Stale entries for older versions of the same file are discarded.
 *
 * @param document The current text document
 * @param currentModule The importing ASN.1 module
 * @returns The cache for this module and document version
 * @function
 */
function getImportingModuleCache(
    document: vscode.TextDocument,
    currentModule: Module,
): ImportingModuleEnumCache {
    const uri = document.uri.toString();
    const version = document.version;
    const key = cacheKey(uri, version, currentModule.name);
    const existing = caches.get(key);
    if (existing) {
        return existing;
    }
    for (const [oldKey, oldCache] of caches) {
        if ((oldCache.uri === uri) && (oldCache.version !== version)) {
            caches.delete(oldKey);
        }
    }
    const created: ImportingModuleEnumCache = {
        uri,
        version,
        moduleName: currentModule.name,
        variantsByClassAndField: new Map(),
        populatedClasses: new Set(),
        defaultSyntaxByObject: new Map(),
        resolvedClasses: new Map(),
    };
    caches.set(key, created);
    return created;
}

/**
 * @summary Clear implicit `ENUMERATED` import caches
 * @description
 *
 * Intended to be called upon deactivation of this extension.
 *
 * @function
 */
export function clearImplicitImportCaches(): void {
    caches.clear();
}

/**
 * @summary Determine if an assignment is an information object assignment
 * @param assn The assignment, if any
 * @returns `true` if the assignment defines an information object
 * @function
 */
function isObjectAssignment(assn: Assignment | undefined): assn is ObjectAssignment {
    return (
        !!assn
        && (
            (assn.assignmentType === AssignmentType.ObjectAssignment)
            || (assn.assignmentType === AssignmentType.ParameterizedObjectAssignment)
        )
    );
}

/**
 * @summary Build a stable key for an object class reference
 * @param def The `DefinedObjectClass`
 * @returns A `module:identifier` key
 * @function
 */
function objectClassKey(def: Defined): string {
    return `${def.module ?? def.computedModule ?? ""}:${def.reference}`;
}

/**
 * @summary Look up a field spec, trying with and without a leading ampersand
 * @param fieldSpecs Field specs indexed by primitive field name
 * @param fieldName Field name from default syntax, which may or may not have `&`
 * @returns The field spec and the canonical key used in `fieldSpecs`, or `undefined`
 * @function
 */
function lookupFieldSpec(
    fieldSpecs: { [reference: string]: FieldSpec },
    fieldName: string,
): [FieldSpec, string] | undefined {
    if (fieldName in fieldSpecs) {
        return [fieldSpecs[fieldName], fieldName];
    }
    const withAmp = fieldName.startsWith("&") ? fieldName : `&${fieldName}`;
    if (withAmp in fieldSpecs) {
        return [fieldSpecs[withAmp], withAmp];
    }
    const withoutAmp = fieldName.startsWith("&") ? fieldName.slice(1) : fieldName;
    if (withoutAmp in fieldSpecs) {
        return [fieldSpecs[withoutAmp], withoutAmp];
    }
    return undefined;
}

/**
 * @summary Determine if a field name (aside from `&`) starts with a lowercase letter
 * @param fieldName Primitive field name, with or without a leading `&`
 * @returns `true` if this could be a value field or object field
 * @function
 */
function fieldNameStartsWithLowercase(fieldName: string): boolean {
    const name = fieldName.startsWith("&") ? fieldName.slice(1) : fieldName;
    return startsWithLowercaseLetter(name);
}

/**
 * @summary Determine whether a setting is the given unqualified identifier
 * @param setting A default-syntax field setting
 * @param identifier The identifier being resolved
 * @returns `true` if this setting is that identifier
 * @function
 */
function settingIsIdentifier(setting: Setting, identifier: string): boolean {
    if (!("value" in setting)) {
        return false;
    }
    const value = setting.value;
    if (value.valueType === ValueType.DefinedValue) {
        return (
            (value.value.reference === identifier)
            && !value.value.module
            && !value.value.parameters?.length
        );
    }
    if (value.valueType === ValueType.EnumeratedValue) {
        return value.value.identifier === identifier;
    }
    if ((value.valueType === ValueType.IntegerValue) && (typeof value.value === "string")) {
        return value.value === identifier;
    }
    if (value.text === identifier) {
        return true;
    }
    return false;
}

/**
 * @summary Find the default-syntax field whose setting is this identifier
 * @param defaultSyntax The object in default syntax
 * @param identifier The identifier sought
 * @returns The field name, or `undefined` if no field setting matches
 * @function
 */
function findFieldWithIdentifier(
    defaultSyntax: DefaultSyntax,
    identifier: string,
): string | undefined {
    for (const [fieldName, setting] of Object.entries(defaultSyntax.fieldSettings)) {
        if (settingIsIdentifier(setting, identifier)) {
            return fieldName;
        }
    }
    return undefined;
}

/**
 * @summary Resolve an information object class, following aliases
 * @param cancel The cancellation token
 * @param defined The object class reference
 * @param currentModule The importing ASN.1 module
 * @param currentDocUri The current document URI
 * @returns The class assignment, the module where it is defined, and that file URI
 * @async
 * @function
 */
async function resolveObjectClassAssignment(
    cancel: vscode.CancellationToken,
    defined: Defined,
    currentModule: Module,
    currentDocUri: vscode.Uri,
): Promise<[ObjectClassAssignment, Module, vscode.Uri] | undefined> {
    let moduleref: string | undefined = defined.module ?? defined.computedModule;
    let identifier = defined.reference;
    let searchModule = currentModule;
    let searchUri = currentDocUri;
    for (let i = 0; i < 10; i++) {
        if (cancel.isCancellationRequested) {
            return undefined;
        }
        const resolved = await resolveDefined(
            cancel,
            moduleref,
            identifier,
            searchModule,
            searchUri,
        );
        if (!resolved) {
            return undefined;
        }
        const [assn, nextMod, nextUri] = resolved;
        if (
            (assn.assignmentType !== AssignmentType.ObjectClassAssignment)
            && (assn.assignmentType !== AssignmentType.ParameterizedObjectClassAssignment)
        ) {
            return undefined;
        }
        const ocassn: ObjectClassAssignment = assn;
        if ("fieldSpecs" in ocassn.objectClass) {
            return [ocassn, nextMod, nextUri];
        }
        if ("reference" in ocassn.objectClass) {
            const alias = ocassn.objectClass;
            moduleref = alias.module ?? alias.computedModule;
            identifier = alias.reference;
            searchModule = nextMod;
            searchUri = nextUri;
            continue;
        }
        return undefined;
    }
    return undefined;
}

/**
 * @summary Resolve a type to an `ENUMERATED` type, following defined types
 * @param cancel The cancellation token
 * @param type_ The type to resolve
 * @param currentModule The module in which `type_` appears
 * @param currentDocUri The file URI of that module
 * @param recursionTTL Recursion limit
 * @returns The `ENUMERATED` type, or `undefined` if it does not resolve to one
 * @async
 * @function
 */
async function resolveToEnumeratedType(
    cancel: vscode.CancellationToken,
    type_: Type,
    currentModule: Module,
    currentDocUri: vscode.Uri,
    recursionTTL: number = 10,
): Promise<EnumeratedType | undefined> {
    if (recursionTTL <= 0) {
        return undefined;
    }
    const unprefixed = getUnprefixedType(type_);
    if (unprefixed.typeType === TypeType.EnumeratedType) {
        return unprefixed.type;
    }
    if (unprefixed.typeType !== TypeType.DefinedType) {
        return undefined;
    }
    const def = unprefixed.type;
    const resolved = await resolveDefined(
        cancel,
        def.module ?? def.computedModule,
        def.reference,
        currentModule,
        currentDocUri,
        recursionTTL,
    );
    if (!resolved) {
        return undefined;
    }
    const [assn, nextMod, nextUri] = resolved;
    if (
        (assn.assignmentType !== AssignmentType.TypeAssignment)
        && (assn.assignmentType !== AssignmentType.ParameterizedTypeAssignment)
        && (assn.assignmentType !== AssignmentType.ValueSetTypeAssignment)
        && (assn.assignmentType !== AssignmentType.ParameterizedValueSetTypeAssignment)
    ) {
        return undefined;
    }
    if (!("type" in assn)) {
        return undefined;
    }
    return resolveToEnumeratedType(
        cancel,
        assn.type,
        nextMod,
        nextUri,
        recursionTTL - 1,
    );
}

/**
 * @summary Translate an information object to default syntax
 * @param cache The importing-module cache
 * @param assn The object assignment
 * @param oc The object class definition
 * @param currentModule The importing ASN.1 module
 * @returns Default syntax, or `null` if it could not be obtained
 * @function
 */
function getDefaultSyntax(
    cache: ImportingModuleEnumCache,
    assn: ObjectAssignment,
    oc: ObjectClassDefn,
    currentModule: Module,
): DefaultSyntax | null {
    const cached = cache.defaultSyntaxByObject.get(assn.identifier);
    if (typeof cached !== "undefined") {
        return cached;
    }
    let result: DefaultSyntax | null = null;
    if ("fieldSettings" in assn.object) {
        result = assn.object;
    } else if (assn.defaultSyntax) {
        result = assn.defaultSyntax;
    } else if (("tokens" in assn.object) && oc.syntax) {
        try {
            const [translated] = translateDefinedSyntaxToDefaultSyntax(
                assn.object,
                oc.syntax,
                currentModule,
            );
            result = translated;
        } catch (e) {
            log.appendLine(
                `failed to translate defined syntax of ${assn.identifier} in ${currentModule.name}: ${e}`,
            );
            result = null;
        }
    }
    cache.defaultSyntaxByObject.set(assn.identifier, result);
    return result;
}

/**
 * @summary Populate the ENUMERATED-variant index for an object class
 * @description
 *
 * Walks the class's field specs, and for each value field whose type resolves
 * to `ENUMERATED`, indexes those variants under the field name. Logs once
 * when the index is first populated.
 *
 * @param cancel The cancellation token
 * @param cache The importing-module cache
 * @param classKey The object class cache key
 * @param ocassn The resolved object class assignment
 * @param ocmod The module in which the class is defined
 * @param ocuri The file URI of that module
 * @returns The field-to-variants map for this class
 * @async
 * @function
 */
async function getOrPopulateClassEnumIndex(
    cancel: vscode.CancellationToken,
    cache: ImportingModuleEnumCache,
    classKey: string,
    ocassn: ObjectClassAssignment,
    ocmod: Module,
    ocuri: vscode.Uri,
): Promise<Map<string, Set<string>>> {
    const existing = cache.variantsByClassAndField.get(classKey);
    if (existing && cache.populatedClasses.has(classKey)) {
        return existing;
    }
    const byField: Map<string, Set<string>> = existing ?? new Map();
    cache.variantsByClassAndField.set(classKey, byField);
    if (!("fieldSpecs" in ocassn.objectClass)) {
        cache.populatedClasses.add(classKey);
        return byField;
    }
    const fieldSpecs = ocassn.objectClass.fieldSpecs;
    for (const [fieldName, spec] of Object.entries(fieldSpecs)) {
        if (spec.specType !== FieldSpecType.FixedTypeValueFieldSpec) {
            continue;
        }
        if (!fieldNameStartsWithLowercase(fieldName)) {
            continue;
        }
        const enumerated = await resolveToEnumeratedType(
            cancel,
            spec.type,
            ocmod,
            ocuri,
        );
        if (!enumerated?.items?.length) {
            continue;
        }
        const variants: Set<string> = new Set();
        for (const item of enumerated.items) {
            variants.add(item.identifier);
        }
        byField.set(fieldName, variants);
    }
    if (!cache.populatedClasses.has(classKey)) {
        let variantCount = 0;
        for (const variants of byField.values()) {
            variantCount += variants.size;
        }
        log.appendLine(
            `populated implicit ENUMERATED import index for object class ${ocassn.identifier}`
            + ` (defined in ${ocmod.name}) with ${variantCount} variant(s)`,
        );
        cache.populatedClasses.add(classKey);
    }
    return byField;
}

/**
 * @summary Determine if an undefined identifier is an implicitly imported ENUMERATED variant
 * @description
 *
 * In ASN.1, `ENUMERATED` variants may be used without importing or qualifying
 * the enumerated type. When an unqualified lowercase identifier appears
 * undefined in an information object, this function checks whether it is a
 * variant of an `ENUMERATED` value field of that object's class.
 *
 * Resolution of the object class and its `ENUMERATED` variants is cached for
 * the importing module at the current document version.
 *
 * @param cancel The cancellation token
 * @param document The current text document
 * @param currentModule The importing ASN.1 module
 * @param assignment The current assignment, if any
 * @param identifier The undefined identifier
 * @returns `true` if the identifier is an implicitly imported `ENUMERATED` variant
 * @async
 * @function
 */
export async function isImplicitlyImportedEnumVariant(
    cancel: vscode.CancellationToken,
    document: vscode.TextDocument,
    currentModule: Module,
    assignment: Assignment | undefined,
    identifier: string,
): Promise<boolean> {
    if (!startsWithLowercaseLetter(identifier)) {
        return false;
    }
    if (!isObjectAssignment(assignment)) {
        return false;
    }
    if (assignment.definedObjectClass.parameters?.length) {
        return false;
    }
    try {
        const cache = getImportingModuleCache(document, currentModule);
        const classKey = objectClassKey(assignment.definedObjectClass);

        let resolvedClass = cache.resolvedClasses.get(classKey);
        if (typeof resolvedClass === "undefined") {
            resolvedClass = await resolveObjectClassAssignment(
                cancel,
                assignment.definedObjectClass,
                currentModule,
                document.uri,
            ) ?? null;
            cache.resolvedClasses.set(classKey, resolvedClass);
        }
        if (!resolvedClass) {
            return false;
        }
        const [ocassn, ocmod, ocuri] = resolvedClass;
        if (!("fieldSpecs" in ocassn.objectClass)) {
            return false;
        }
        const oc: ObjectClassDefn = ocassn.objectClass;

        const defaultSyntax = getDefaultSyntax(cache, assignment, oc, currentModule);
        if (!defaultSyntax) {
            return false;
        }

        const fieldName = findFieldWithIdentifier(defaultSyntax, identifier);
        if (!fieldName) {
            return false;
        }

        const lookedUp = lookupFieldSpec(oc.fieldSpecs, fieldName);
        if (!lookedUp) {
            return false;
        }
        const [spec, canonicalFieldName] = lookedUp;
        if (!fieldNameStartsWithLowercase(canonicalFieldName)) {
            return false;
        }
        if (spec.specType !== FieldSpecType.FixedTypeValueFieldSpec) {
            return false;
        }

        const byField = await getOrPopulateClassEnumIndex(
            cancel,
            cache,
            classKey,
            ocassn,
            ocmod,
            ocuri,
        );
        const variants = byField.get(canonicalFieldName) ?? byField.get(fieldName);
        return !!variants?.has(identifier);
    } catch (e) {
        log.appendLine(
            `failed implicit ENUMERATED import lookup for ${identifier} in ${currentModule.name}: ${e}`,
        );
        return false;
    }
}
