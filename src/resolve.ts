import {
    type Assignment,
    type Module,
    AssignmentType,
    ValueType,
    parserFor,
    grokerFor,
    type NameAndOrNumber,
    type ObjIdComponents,
    type IntegerValue,
    builtinRootArcNamesToNumber,
    type Defined,
    type ObjectIdentifierValue,
    type AssignedIdentifier,
    type ObjectDefn,
    type Object_,
    asn1ModuleOidMatch,
} from "@wildboar/asn1-parser";
import { getFilesContainingModule } from "./indexing.js";
import { getParserOutputsWithLogging } from "./parsing.js";
import {
    getOidNodesFromModuleIdentifier,
} from "./utils.js";
import { maybeReparse } from "./reparse.js";
import { log } from "./logging.js";
import * as vscode from "vscode";

export async function resolveAssignedIdentifier(
    cancel: vscode.CancellationToken,
    assid: NonNullable<AssignedIdentifier>,
    currentModule: Module,
    currentDocUri: vscode.Uri,
    recursionTTL: number = 10,
): Promise<NameAndOrNumber[] | undefined> {
    let oid: NameAndOrNumber[] | undefined;
    if ("components" in assid) {
        if (assid.prefix) {
            const prefix = assid.prefix;
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
                    currentDocUri,
                    recursionTTL - 1,
                );
                if (!oid) {
                    log.appendLine("could not resolve oid prefix for for imported module");
                    return undefined;
                }
            }
        }
        const resolvedComponents = await resolveOIDComponents(
            cancel,
            assid.components,
            currentModule,
            currentDocUri,
            recursionTTL - 1,
        );
        if (!resolvedComponents) {
            log.appendLine("could not resolve oid components for imported module");
            return undefined;
        }
        if (oid) {
            oid.push(...resolvedComponents);
        } else {
            oid = resolvedComponents;
        }
    } else if ("reference" in assid) {
        oid = await resolveOID(
            cancel,
            assid.module,
            assid.reference,
            currentModule,
            currentDocUri,
            recursionTTL - 1,
        );
    }
    return oid;
}

export async function resolveDefined(
    cancel: vscode.CancellationToken,
    moduleref: string | undefined,
    identifier: string,
    currentModule: Module,
    currentDocUri: vscode.Uri,
    recursionTTL: number = 10,
): Promise<[Assignment, Module, vscode.Uri] | undefined> {
    if (cancel.isCancellationRequested) {
        return undefined;
    }
    if (recursionTTL <= 0) {
        log.appendLine("recursion limit exceeded in resolve()");
        return undefined;
    }
    /* ITU-T Rec. X.680, Section 14.5, states that `External*Reference` may
    only be used if the symbol used in `identifier` is imported, so we do
    not search the local assignments if it is used. */
    const assignment = (moduleref && (moduleref !== currentModule.name))
        ? undefined
        : currentModule.assignments[identifier];
    if (assignment) {
        return [ assignment, currentModule, currentDocUri ];
    }

    // Otherwise, the reference must be imported.
    const maybesfm = Object.values(currentModule.imports.modules)
        .find((sfm) => (
            (!moduleref || sfm.identifier === moduleref)
            && (identifier in sfm.symbolList)
        ));
    if (!maybesfm) {
        log.appendLine(`identifier ${identifier} not present in assignments or imports`);
        return undefined;
    }
    const sfm = maybesfm;
    moduleref = sfm.identifier;

    const config = vscode.workspace.getConfiguration("asn1");
    const strict = config.get<boolean>("strictModuleOidMatch", true);

    // Completely resolve the importing module's assigned identifier to an OID.
    let oid: NameAndOrNumber[] | undefined;
    if (sfm.assignedIdentifier) {
        oid = await resolveAssignedIdentifier(
            cancel,
            sfm.assignedIdentifier,
            currentModule,
            currentDocUri,
            recursionTTL - 1,
        );
        if (!oid && strict) {
            log.appendLine(`could not resolve oid for for imported module ${sfm.identifier}`);
            return undefined;
        }
    }

    // Find the module and return the assignment in it.
    for (const file of getFilesContainingModule(moduleref)) {
        if (cancel.isCancellationRequested) {
            return undefined;
        }
        log.appendLine(`checking file ${file} for module ${moduleref}`);
        try {
            const p = await getParserOutputsWithLogging(file, cancel);
            if (!p) {
                continue;
            }
            const modules = p.parsedModules;
            for (const module of modules) {
                if (cancel.isCancellationRequested) {
                    return undefined;
                }
                if (module.name !== moduleref) {
                    // This file could have multiple modules. Skip past all
                    // but the ones having the correct name.
                    log.appendLine(`skipping over module ${module.name}, since we are interested in ${moduleref} in ${file}`);
                    continue;
                }
                if (strict && module.oid && oid) {
                    const modoid = getOidNodesFromModuleIdentifier(module.oid);
                    const impoid = getOidNodesFromModuleIdentifier(oid);
                    if (!modoid) {
                        log.appendLine(`could not resolve module definition object identifier to integers`);
                        return undefined;
                    }
                    if (!impoid) {
                        log.appendLine(`could not resolve imported module object identifier to integers`);
                        return undefined;
                    }
                    if (!asn1ModuleOidMatch(modoid, impoid, sfm.selectionOption)) {
                        log.appendLine(`module ${moduleref} in ${file} didn't match import oid`);
                        continue;
                    }
                }
                const ass = module.assignments[identifier];
                if (ass) {
                    return [ass, module, file];
                }
                // Odd situation: the identifier was not in the module where expected.
                // Just keep iterating. Maybe the module is malformed and is present
                // somewhere else?
                log.appendLine(`identifier ${identifier} not found in module ${moduleref}; going to try other matching modules`);
            }
        } catch (e) {
            log.appendLine(`error resolving ${identifier}: ${e}`);
            continue;
        }
    }

    // Otherwise, we did not find a matching module or that identifier in one of them.
    log.appendLine(`identifier ${identifier} not found in any module with matching name and oid`);
    return undefined;
}

export async function resolveInteger(
    cancel: vscode.CancellationToken,
    moduleref: string | undefined,
    identifier: string,
    currentModule: Module,
    currentDocUri: vscode.Uri,
    recursionTTL: number = 10,
): Promise<number | undefined> {
    const next = await resolveDefined(
        cancel,
        moduleref,
        identifier,
        currentModule,
        currentDocUri,
        recursionTTL,
    );
    if (!next) {
        return undefined;
    }
    const [assn] = next;
    // TODO: Support XMLValueAssignment
    if (assn.assignmentType !== AssignmentType.ValueAssignment) {
        log.appendLine(`error resolving integer ${identifier}: not a value assignment`);
        return undefined;
    }
    if (assn.value.valueType !== ValueType.IntegerValue) {
        log.appendLine(`error resolving integer ${identifier}: not an integer value`);
        return undefined;
    }
    const int: IntegerValue = assn.value.value;
    if (typeof int === "string") {
        log.appendLine(`error resolving integer ${identifier}: it is a string identifier`);
        return undefined;
    }
    return int;
}

export async function resolveOIDComponent(
    cancel: vscode.CancellationToken,
    arc: ObjIdComponents,
    currentModule: Module,
    currentDocUri: vscode.Uri,
    recursionTTL: number = 10,
    isFirst: boolean = false,
): Promise<NameAndOrNumber | NameAndOrNumber[] | undefined> {
    if (recursionTTL <= 0) {
        log.appendLine("recursion limit exceeded in resolveOIDComponent()");
        return undefined;
    }
    /* Some `DefinedValue` uses in `OBJECT IDENTIFIER`s can be mistaken for
    name-only arcs. In our case, since we need to completely resolve the OID,
    we assume that this mistake has been made and silently convert name-only
    arcs to `DefinedValue` equivalents, and re-execute this function. */
    if (
        !("number" in arc)
        && ("name" in arc)
        && arc.name
        && !builtinRootArcNamesToNumber.has(arc.name)
    ) {
        const name = arc.name;
        return resolveOIDComponent(
            cancel,
            {
                computedModule: Object.values(currentModule.imports.modules)
                    .find((sfm) => Object.keys(sfm.symbolList).includes(name))
                    ?.identifier
                    ?? currentModule.name,
                reference: arc.name,
            },
            currentModule,
            currentDocUri,
            recursionTTL, // We don't decrement. This shouldn't count.
        );
    }
    if ("reference" in arc) {
        // NOTE: This reference may ONLY point to a RELATIVE-OID. NOT an INTEGER.
        if (isFirst && builtinRootArcNamesToNumber.has(arc.reference)) {
            const num = builtinRootArcNamesToNumber.get(arc.reference)!;
            return { name: arc.reference, number: num };
        }
        const roid = await resolveOID(
            cancel,
            arc.module ?? arc.computedModule,
            arc.reference,
            currentModule,
            currentDocUri,
            recursionTTL - 1,
        );
        if (!roid) {
            log.appendLine(`error resolving relative oid ${arc.reference}`);
            return undefined;
        }
        return roid;
    }
    if ((typeof arc.number === "object") && ("reference" in arc.number)) {
        const intref = arc.number;
        const int = await resolveInteger(
            cancel,
            intref.module ?? intref.computedModule,
            intref.reference,
            currentModule,
            currentDocUri,
            recursionTTL - 1,
        );
        if (typeof int === "undefined") {
            log.appendLine(`error resolving integer ${intref.reference}`);
            return undefined;
        }
        return {
            name: arc.name,
            number: int,
        };
    } else if (typeof arc.number === "number") {
        return {
            name: arc.name,
            number: arc.number,
        };
    } else {
        delete arc.production; // Just so this doesn't become huge.
        log.appendLine(`error resolving oid component ${JSON.stringify(arc)}`);
        return undefined;
    }
}

export async function resolveOIDComponents(
    cancel: vscode.CancellationToken,
    arcs: ObjIdComponents[],
    currentModule: Module,
    currentDocUri: vscode.Uri,
    recursionTTL: number = 10,
    suppressBuiltInArcs: boolean = false,
): Promise<NameAndOrNumber[] | undefined> {
    const resolvedComponents: NameAndOrNumber[] = [];
    for (const [i, arc] of arcs.entries()) {
        if (cancel.isCancellationRequested) {
            return undefined;
        }
        const resolved = await resolveOIDComponent(
            cancel,
            arc,
            currentModule,
            currentDocUri,
            recursionTTL,
            !suppressBuiltInArcs && (i === 0),
        );
        if (!resolved) {
            return undefined;
        }
        if (Array.isArray(resolved)) {
            resolvedComponents.push(...resolved);
        } else {
            resolvedComponents.push(resolved);
        }
    }
    return resolvedComponents;
}

// NOTE: You do not have to worry about resolving things like ValueFromObject,
// because the BNF specifically only allows DefinedValue as a prefix.
// ObjectIdentifierValue ::=
//    "{" ObjIdComponentsList "}"
// 	| "{" DefinedValue ObjIdComponentsList "}"
export async function resolveOID(
    cancel: vscode.CancellationToken,
    moduleref: string | undefined,
    identifier: string,
    currentModule: Module,
    currentDocUri: vscode.Uri,
    recursionTTL: number = 10,
): Promise<NameAndOrNumber[] | undefined> {
    const components: NameAndOrNumber[] = [];
    while (recursionTTL > 0) {
        if (cancel.isCancellationRequested) {
            return undefined;
        }
        if (builtinRootArcNamesToNumber.has(identifier)) {
            const num = builtinRootArcNamesToNumber.get(identifier)!;
            components.unshift({ name: identifier, number: num });
            return components;
        }
        const next = await resolveDefined(
            cancel,
            moduleref,
            identifier,
            currentModule,
            currentDocUri,
            recursionTTL,
        );
        if (!next) {
            log.appendLine(`oid ${identifier} could not be resolved`);
            return undefined;
        }
        recursionTTL--;
        const [nextass, nextmod, nextdoc] = next;
        // TODO: Support XMLValueAssignment
        if (nextass.assignmentType !== AssignmentType.ValueAssignment) {
            log.appendLine(`identifier ${identifier} did not refer to a value assignment`);
            return undefined;
        }
        if (nextass.value.valueType === ValueType.DefinedValue) {
            const ref = nextass.value.value;
            // I don't really get why this works. You have to return here, not continue.
            return resolveOID(
                cancel,
                ref.computedModule ?? ref.module,
                ref.reference,
                nextmod,
                nextdoc,
                recursionTTL,
            );
        }
        if (nextass.value.valueType === ValueType.RelativeOIDValue) {
            const oid = nextass.value.value;
            const resolvedComponents = await resolveOIDComponents(
                cancel,
                oid,
                nextmod,
                nextdoc,
                recursionTTL - 1,
                true,
            );
            if (!resolvedComponents) {
                log.appendLine(`components of object identifier ${identifier} could not be resolved (#1)`);
                return undefined;
            }
            components.unshift(...resolvedComponents);
            return components;
        }
        let oid: ObjectIdentifierValue;
        if (nextass.value.valueType === ValueType.ObjectIdentifierValue) {
            oid = nextass.value.value;
        } else {
            const reparsed = maybeReparse(
                nextass.value,
                parserFor.ObjectIdentifierValue,
                grokerFor.ObjectIdentifierValue,
            );
            if (!reparsed) {
                log.appendLine(`identifier ${identifier} could not be reparsed as an object identifier value. type was ${nextass.value.valueType}`);
                return undefined;
            }
            oid = reparsed;
        }

        const resolvedComponents = await resolveOIDComponents(
            cancel,
            oid.components,
            nextmod,
            nextdoc,
            recursionTTL - 1,
            !!oid.prefix,
        );
        if (!resolvedComponents) {
            log.appendLine(`components of object identifier ${identifier} could not be resolved (#2)`);
            return undefined;
        }

        if (!oid.prefix) {
            // There is no prefix: no further resolution needed.
            return [
                ...resolvedComponents,
                ...components,
            ];
        }
        components.unshift(...resolvedComponents);
        const prefix = oid.prefix;
        // This is what resolve() does in @wildboar/asn1-parser
        moduleref = prefix.module ?? prefix.computedModule ?? currentModule.name;
        identifier = prefix.reference;
        currentModule = nextmod;
        currentDocUri = nextdoc;
        // recursionTTL was already decremented.
    }
    log.appendLine(`recursion limit reached when trying to resolve object identifier ${identifier}`);
    return undefined;
}

export
function resolveDefinedInstantly(
    currentModule: Module,
    defined: Defined,
    recursionTTL: number = 10,
): Assignment | undefined {
    if (recursionTTL <= 0) {
        return undefined;
    }
    if (defined.module) {
        return undefined;
    }
    if (defined.computedModule !== currentModule.name) {
        return undefined;
    }
    return currentModule.assignments[defined.reference];
}

function failExport(identifier?: string): never {
    if (identifier) {
        throw new Error(`Resolving OID value ${identifier} failed`);
    }
    throw new Error("Resolving an OID value failed");
}

export
async function resolveOidValue(
    document: vscode.TextDocument,
    val: ObjectIdentifierValue,
    cancel: vscode.CancellationToken,
    currentModule: Module,
): Promise<NameAndOrNumber[] | undefined> {
    let oid: NameAndOrNumber[] | undefined;
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
                return failExport(prefix.reference);
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
        return failExport();
    }
    if (oid) {
        oid.push(...resolvedComponents);
    } else {
        oid = resolvedComponents;
    }
    return oid;
}

// export type Object_ = DefinedObject | ObjectDefn | ObjectFromObject;
export async function resolveObjectDefn(
    cancel: vscode.CancellationToken,
    object: Object_,
    currentModule: Module,
    currentDocUri: vscode.Uri,
    recursionTTL: number = 10,
): Promise<ObjectDefn | undefined> {
    if (recursionTTL <= 0) {
        return undefined;
    }
    if ("reference" in object) {
        const ref = object;
        const resolved = await resolveDefined(
            cancel,
            ref.module ?? ref.computedModule,
            ref.reference,
            currentModule,
            currentDocUri,
        );
        if (!resolved) {
            return undefined;
        }
        const [assn, mod, newdocuri] = resolved;
        if (assn.assignmentType !== AssignmentType.ObjectAssignment) {
            throw new Error(`${ref.reference} in ${mod.name} was not an object assignment`);
        }
        return resolveObjectDefn(
            cancel,
            assn.object,
            mod,
            newdocuri,
            recursionTTL - 1,
        );
    } else if ("referencedObjects" in object) {
        // Not supported. Very complicated to implement.
        return undefined;
    } else if ("tokens" in object) {
        return object; // Already an ObjectDefn (DefinedSyntax)
    } else if ("fieldSettings" in object) {
        return object; // Already an ObjectDefn (DefaultSyntax)
    } else {
        return undefined; // Unrecognized syntax.
    }
}
