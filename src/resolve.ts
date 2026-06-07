import {
    type Defined,
    type Assignment,
    type SymbolsFromModule,
    type Module,
    ObjectIdentifierValue,
    AssignmentType,
    TypeType,
    ValueType,
    NameAndOrNumber,
    NameAndOrNumberForm,
    ObjIdComponents,
    IntegerValue,
    builtinRootArcNamesToNumber,
    // AssignedIdentifier, // FIXME: Not exported.
} from "@wildboar/asn1-parser";
import { getFilesContainingModule } from "./indexing.js";
import { getParserOutputs } from "./parsing.js";
import {
    asn1ModuleMatch,
    getOidNodesFromModuleIdentifier,
} from "./utils.js";
import { log } from "./logging.js";
import * as vscode from "vscode";

export async function resolveAssignedIdentifier(
    assid: NonNullable<SymbolsFromModule["assignedIdentifier"]>,
    currentModule: Module,
    currentDocUri: vscode.Uri,
    recursionTTL: number = 10,
): Promise<NameAndOrNumber[] | undefined> {
    let oid: NameAndOrNumber[] | undefined;
    if ("components" in assid) {
        if (assid.prefix) {
            const prefix = assid.prefix;
            // TODO: @wildboar/asn1-parser: fix this
            /* It seems that the built-in OID root arc values can be mistaken
            for the `DefinedValue` prefix. We check for these values here and
            convert them to numbers. */
            if (!prefix.module && builtinRootArcNamesToNumber.has(prefix.reference)) {
                const num = builtinRootArcNamesToNumber.get(prefix.reference);
                oid = [{ name: prefix.reference, number: num }];
            } else {
                oid = await resolveOID(
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
    moduleref: string | undefined,
    identifier: string,
    currentModule: Module,
    currentDocUri: vscode.Uri,
    recursionTTL: number = 10,
): Promise<[Assignment, Module, vscode.Uri] | undefined> {
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

    // Completely resolve the importing module's assigned identifier to an OID.
    let oid: NameAndOrNumber[] | undefined;
    if (sfm.assignedIdentifier) {
        oid = await resolveAssignedIdentifier(
            sfm.assignedIdentifier,
            currentModule,
            currentDocUri,
            recursionTTL - 1,
        );
        if (!oid) {
            log.appendLine(`could not resolve oid for for imported module ${sfm.identifier}`);
            return undefined;
        }
    }

    // Find the module and return the assignment in it.
    for (const file of getFilesContainingModule(moduleref)) {
        log.appendLine(`checking file ${file} for module ${moduleref}`);
        try {
            const uri = vscode.Uri.parse(file, true);
            const p = await getParserOutputs(uri);
            if (
                !p.parserEndState
                || ("err" in p.parserEndState)
                || p.parserEndState.ok.error
                || (Object.keys(p.parserEndState.ok.syntaxErrors ?? {}).length > 0)
                || !p.parsedModules
                || ("err" in p.parsedModules)
            ) {
                log.appendLine(`malformed asn.1 file url ${file}: import will not be resolved`);
                continue;
            }
            const modules = p.parsedModules.ok;
            for (const module of modules) {
                if (module.name !== moduleref) {
                    // This file could have multiple modules. Skip past all
                    // but the ones having the correct name.
                    log.appendLine(`skipping over module ${module.name}, since we are interested in ${moduleref} in ${file}`);
                    continue;
                }
                if (module.oid && oid) {
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
                    if (!asn1ModuleMatch(modoid, impoid, sfm.selectionOption)) {
                        log.appendLine(`module ${moduleref} in ${file} didn't match import oid`);
                        continue;
                    }
                }
                const ass = module.assignments[identifier];
                if (ass) {
                    return [ass, module, uri];
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
    moduleref: string | undefined,
    identifier: string,
    currentModule: Module,
    currentDocUri: vscode.Uri,
    recursionTTL: number = 10,
): Promise<number | undefined> {
    const next = await resolveDefined(
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
    arc: ObjIdComponents,
    currentModule: Module,
    currentDocUri: vscode.Uri,
    recursionTTL: number = 10,
): Promise<NameAndOrNumber | NameAndOrNumber[] | undefined> {
    if (recursionTTL <= 0) {
        log.appendLine("recursion limit exceeded in resolveOIDComponent()");
        return undefined;
    }
    if ("reference" in arc) {
        // TODO: Ensure this code only runs for the first arc.
        if (builtinRootArcNamesToNumber.has(arc.reference)) {
            const num = builtinRootArcNamesToNumber.get(arc.reference)!;
            return { name: arc.reference, number: num };
        }
        const roid = await resolveOID(
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
        // TODO: Do you need to handle resolving names here?
        delete arc.production; // Just so this doesn't become huge.
        log.appendLine(`error resolving oid component ${JSON.stringify(arc)}`);
        return undefined;
    }
}

export async function resolveOIDComponents(
    arcs: ObjIdComponents[],
    currentModule: Module,
    currentDocUri: vscode.Uri,
    recursionTTL: number = 10,
): Promise<NameAndOrNumber[] | undefined> {
    const resolvedComponents: NameAndOrNumber[] = [];
    for (const arc of arcs) {
        const resolved = await resolveOIDComponent(
            arc,
            currentModule,
            currentDocUri,
            recursionTTL,
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
    moduleref: string | undefined,
    identifier: string,
    currentModule: Module,
    currentDocUri: vscode.Uri,
    recursionTTL: number = 10,
): Promise<NameAndOrNumber[] | undefined> {
    const components: NameAndOrNumber[] = [];
    while (recursionTTL > 0) {
        if (builtinRootArcNamesToNumber.has(identifier)) {
            const num = builtinRootArcNamesToNumber.get(identifier)!;
            components.unshift({ name: identifier, number: num });
            return components;
        }
        const next = await resolveDefined(
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
                oid,
                nextmod,
                nextdoc,
                recursionTTL - 1,
            );
            if (!resolvedComponents) {
                log.appendLine(`components of object identifier ${identifier} could not be resolved (#1)`);
                return undefined;
            }
            components.unshift(...resolvedComponents);
            return components;
        }
        if (nextass.value.valueType !== ValueType.ObjectIdentifierValue) {
            // FIXME: If not, try parsing it as an OID value, unless the type
            // totally contradicts it being an OID value.
            log.appendLine(`identifier ${identifier} did not refer to an object identifier value assignment. type was ${nextass.value.valueType}`);
            return undefined;
        }
        const oid = nextass.value.value;

        const resolvedComponents = await resolveOIDComponents(
            oid.components,
            nextmod,
            nextdoc,
            recursionTTL - 1,
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

// export async function recursivelyResolveDefined(
//     moduleref: string | undefined,
//     asn1ModuleId: SymbolsFromModule["assignedIdentifier"] | undefined,
//     identifier: string,
//     currentModule: Module,
//     currentDocUri: vscode.Uri,
//     recursionTTL: number = 10,
// ): ReturnType<typeof resolveDefined> {
//     do {
//         const next = await resolveDefined(
//             moduleref,
//             asn1ModuleId,
//             identifier,
//             currentModule,
//             currentDocUri,
//             recursionTTL,
//         );
//         if (!next) {
//             return undefined;
//         }
//         const [nextass, nextdoc] = next;
        
//     } while ();
// }
