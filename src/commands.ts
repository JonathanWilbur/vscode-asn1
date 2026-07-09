import * as vscode from "vscode";
import { getParserOutputsWithLogging } from "./parsing.js";
import {
    AssignmentType,
    ValueType,
    type NameAndOrNumber,
    type Location,
    TypeType,
} from "@wildboar/asn1-parser";
import {
    resolveAssignedIdentifier,
    resolveOidValue,
} from "./resolve.js";
import {
    getAsn1Files,
    getOidNodesFromModuleIdentifier,
    getRangeFromLocation,
    nameAndOrNumberToIriString,
    nameAndOrNumberToString,
    typeTypesThatCouldBeAnything,
} from "./utils.js";

/**
 * @summary Get the line ending to use for CSV exports
 * @param document The text document
 * @returns The line ending to use
 * @function
 */
export function getExportEol(document?: vscode.TextDocument): "\r\n" | "\n" {
    if (document) {
        const eol = (document.eol === vscode.EndOfLine.CRLF)
            ? "\r\n"
            : "\n";
        return eol;
    }
    const config = vscode.workspace.getConfiguration("asn1");
    const exportEol = config.get<"lf" | "crlf">("exportEndOfLine", "crlf");
    if (exportEol === "crlf") {
        return "\r\n";
    } else {
        return "\n";
    }
}

/**
 * @summary Throw an error that shows the user that the export failed
 * @param document The text document
 * @function
 */
function failExport(document?: vscode.TextDocument): never {
    if (document) {
        const path = vscode.workspace.asRelativePath(document.uri);
        throw new Error(`Export failed for malformed ASN.1 file ${path}`);
    }
    throw new Error("Export failed");
}

/**
 * Information about an `OBJECT IDENTIFIER`
 */
interface OidInfo {
    /**
     * The module name where this object identifier was found
     */
    moduleName: string;
    /**
     * The object identifier for the ASN.1 module in which this object
     * identifier was defined.
     */
    moduleOid?: NameAndOrNumber[];
    /**
     * The internationalized resource identifier (IRI) for the ASN.1 module in
     * which this object identifier was defined.
     */
    moduleIRI?: string;
    /**
     * The assignment name in which this object identifier was defined
     */
    assignmentName?: string;
    /**
     * The zero-based index of the assignment in the `AssignmentList` in which
     * this object identifier was defined
     */
    assignmentIndex?: number;
    /**
     * The arcs of the object identifier
     */
    arcs: NameAndOrNumber[];
    /**
     * URI of the source file
     */
    sourceFile: vscode.Uri;
    /**
     * Location of the assignment within the file where this object identifier
     * was defined
     */
    location?: Location,
}

/**
 * CSV headers row as a string for a CSV export of object identifiers
 */
export const OID_CSV_HEADERS: string[] = [
    "OID_SOURCE",
    "MODULE_NAME",
    "MODULE_OID",
    "MODULE_IRI",
    "OID_NUM",
    "OID_ASN1",
    "OID_IRI",
    "ASSIGNMENT_NAME",
    "LAST_ARC_NAME",
    "LAST_ARC_NUM",
    "FILE_PATH",
    "OID_BASE_URL",
    "ALVESTRAND_URL",
    "START_OFFSET",
    "END_OFFSET",
    "START_LINE",
    "START_COLUMN",
    "ASSIGNMENT_INDEX",
];

/**
 * CSV headers row as a string for a CSV export of ASN.1 imports and exports
 */
export const DEPS_CSV_HEADERS: string[] = [
    "MODULE_NAME",
    "MODULE_OID",
    "MODULE_IRI",
    "RELATION_TYPE",
    "SYMBOL_NAME",
    "USED_PARAM_BRACKETS",
    "FROM_MODULE_NAME",
    "FROM_MODULE_OID",
    "FROM_MODULE_IRI",
    "FROM_MODULE_SEL_OPT",
    "START_OFFSET",
    "END_OFFSET",
    "START_LINE",
    "START_COLUMN",
    "FILE_PATH",
];

/**
 * CSV headers row as a string for a CSV export of ASN.1 modules
 */
export const MODS_CSV_HEADERS: string[] = [
    "MODULE_NAME",
    "MODULE_OID",
    "MODULE_IRI",
    "TAGGING_MODE",
    "EXTENS_IMPLIED",
    "ENCODING_REF",
    "EXPORTS_ALL",
    "ASSIGNMENTS_COUNT",
    "IMPORTED_MODS_COUNT",
    "IMPORTED_SYMS_COUNT",
    "START_OFFSET",
    "END_OFFSET",
    "START_LINE",
    "START_COLUMN",
    "FILE_PATH",
];

/**
 * CSV headers row as a string for a CSV export of ASN.1 assignments
 */
export const ASSNS_CSV_HEADERS: string[] = [
    "MODULE_NAME",
    "MODULE_OID",
    "MODULE_IRI",
    "ASSIGNMENT_NAME",
    "ASSIGNMENT_TYPE",
    "PARAMETERS_COUNT",
    "TYPE_TYPE",
    "TYPE_NAME",
    "VALUE_TYPE",
    "INFO_OBJECT_CLASS",
    // "SET_SIZE",
    // "IS_EXTENSIBLE",
    // "IS_SUBTYPE",
    "ASSIGNMENT_INDEX",
    "DEPENDENCY_INDEX",
    // "LEFT_SIDE",
    // "RIGHT_SIDE",
    "START_OFFSET",
    "END_OFFSET",
    "START_LINE",
    "START_COLUMN",
    "FILE_PATH",
];

/**
 * @summary Convert object identifier information to a CSV row
 * @param info Object identifier information
 * @returns The CSV row as a string
 * @function
 */
function oidInfoToCSVRow(info: OidInfo): string {
    const oidnums = getOidNodesFromModuleIdentifier(info.arcs);
    const modnums = info.moduleOid
        ? getOidNodesFromModuleIdentifier(info.moduleOid)
        : undefined;
    const modiri: string = (
        info.moduleIRI
        && !info.moduleIRI.includes("\"")
        && !info.moduleIRI.includes(",")
    )
        ? info.moduleIRI
        : "";
    const numstr: string = oidnums?.join(".") ?? "";
    const asn1str: string = "{ "
        + info.arcs.map(nameAndOrNumberToString).join(" ")
        + " }";
    const iri: string = "/" + info.arcs.map(nameAndOrNumberToIriString).join("/");
    const lastarc = info.arcs[info.arcs.length - 1];
    const lastname: string = (lastarc && "name" in lastarc)
        ? lastarc.name
        : "";
    const lastnum: string = (lastarc && "number" in lastarc)
        ? lastarc.number.toString()
        : "";
    return [
        (info.assignmentName ? "ASSIGNMENT" : "MODULE"),
        info.moduleName,
        modnums?.join(".") ?? "",
        modiri,
        oidnums?.join(".") ?? "",
        asn1str,
        iri,
        info.assignmentName,
        lastname,
        lastnum,
        vscode.workspace.asRelativePath(info.sourceFile), // To avoid leaking user's full paths.
        numstr
            ? ("https://oid-base.com/get/" + numstr)
            : "",
        numstr
            ? `https://www.alvestrand.no/objectid/${numstr}.html`
            : "",
        info.location?.startIndex.toString() ?? "",
        info.location?.endIndex.toString() ?? "",
        info.location?.lineNumber.toString() ?? "",
        info.location?.columnNumber.toString() ?? "",
        info.assignmentIndex?.toString() ?? "",
    ].join(",");
}

/**
 * @summary Get CSV rows for each object identifier
 * @param document The text document
 * @param token The cancellation token
 * @param rows The exported CSV rows
 * @returns A promise that resolves to nothing
 * @async
 * @function
 */
export
async function get_oid_csv_rows_from_doc(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
    rows: string[],
): Promise<void> {
    const p = await getParserOutputsWithLogging(document, token);
    if (!p) {
        return failExport(document);   
    }
    const modules = p.parsedModules;
    for (const mod of modules) {
        if (token.isCancellationRequested) {
            return;
        }
        if (mod.oid) {
            const defid = mod
                .production
                ?.children[0]
                ?.children
                .find((c) => c.type === "DefinitiveIdentification")
                ?.children[0];
            const defoid = (defid?.type === "DefinitiveOID")
                ? defid
                : defid?.children.find((c) => c.type === "DefinitiveOID");
            const modrow = oidInfoToCSVRow({
                arcs: mod.oid,
                moduleName: mod.name,
                sourceFile: document.uri,
                location: defoid?.location,
                moduleIRI: mod.iri,
                moduleOid: mod.oid,
            });
            rows.push(modrow);
        }
        for (const assn of Object.values(mod.assignments)) {
            if (token.isCancellationRequested) {
                return;
            }
            if (assn.assignmentType !== AssignmentType.ValueAssignment) {
                continue;
            }
            const v = assn.value;
            if (v.valueType !== ValueType.ObjectIdentifierValue) {
                if (
                    (assn.type.typeType !== TypeType.ObjectIdentifierType)
                    && !typeTypesThatCouldBeAnything.has(assn.type.typeType)
                ) {
                    throw new Error("Yeet " + assn.type.typeType + " -?- " + v.valueType);
                }
                continue;
            }
            const arcs = await resolveOidValue(document, v.value, token, mod);
            if (!arcs) {
                continue;
            }
            const row = oidInfoToCSVRow({
                arcs,
                moduleName: mod.name,
                sourceFile: document.uri,
                assignmentIndex: assn.originalIndex,
                assignmentName: assn.identifier,
                location: assn.production?.location,
                moduleIRI: mod.iri,
                moduleOid: mod.oid,
            });
            rows.push(row);
        }
    }
}

/**
 * @summary Get CSV rows for each import or export
 * @param document The text document
 * @param token The cancellation token
 * @param rows The exported CSV rows
 * @returns A promise that resolves to nothing
 * @async
 * @function
 */
export
async function get_dep_csv_rows_from_doc(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
    rows: string[],
): Promise<void> {
    const p = await getParserOutputsWithLogging(document, token);
    if (!p) {
        return failExport(document);   
    }
    const modules = p.parsedModules;
    for (const mod of modules) {
        if (token.isCancellationRequested) {
            return;
        }
        const modnums = mod.oid
            ? getOidNodesFromModuleIdentifier(mod.oid)
            : undefined;
        const modiri = (
            mod.iri
            && !mod.iri.includes("\"")
            && !mod.iri.includes(",")
        )
            ? mod.iri
            : "";
        for (const [symname, prod] of Object.entries(mod.exports?.exportedSymbols ?? {})) {
            const range = getRangeFromLocation(document, prod.location);
            const symtext = document.getText(range);
            const row = [
                mod.name, // "MODULE_NAME",
                modnums?.join(".") ?? "", // "MODULE_OID",
                modiri, // "MODULE_IRI",
                "EXPORT", // "RELATION_TYPE",
                symname, // "SYMBOL_NAME",
                symtext.endsWith("}") ? "TRUE" : "FALSE", // "USED_PARAM_BRACKETS",
                "", // "FROM_MODULE_NAME",
                "", // "FROM_MODULE_OID",
                "", // "FROM_MODULE_IRI",
                "", // "FROM_MODULE_SEL_OPT",
                prod.location.startIndex.toString() ?? "", // "START_OFFSET",
                prod.location.endIndex.toString() ?? "", // "END_OFFSET",
                prod.location.lineNumber.toString() ?? "", // "START_LINE",
                prod.location.columnNumber.toString() ?? "", // "START_COLUMN",
                // relative to avoid leaking user's full paths.
                vscode.workspace.asRelativePath(document.uri), // FILE_PATH
            ].join(",");
            rows.push(row);
        }

        for (const sfm of Object.values(mod.imports.modules)) {
            const fromModName: string = sfm.identifier;
            let fromModOid: string = ""; 
            if (sfm.assignedIdentifier) {
                const resolved = await resolveAssignedIdentifier(
                    token,
                    sfm.assignedIdentifier,
                    mod,
                    document.uri,
                );
                if (resolved) {
                    fromModOid = getOidNodesFromModuleIdentifier(resolved)?.join(".") ?? "";
                }
            }
            const selopt: string = sfm.selectionOption?.toString().replace(" ", "_") ?? "";
            for (const [symname, prod] of Object.entries(sfm.symbolList)) {
                const symrange = prod && getRangeFromLocation(document, prod.location);
                const symtext: string = symrange
                    ? document.getText(symrange)
                    : "";
                const row = [
                    mod.name, // "MODULE_NAME",
                    modnums?.join(".") ?? "", // "MODULE_OID",
                    modiri, // "MODULE_IRI",
                    "IMPORT", // "RELATION_TYPE",
                    symname, // "SYMBOL_NAME",
                    symtext.endsWith("}") ? "TRUE" : "FALSE", // "USED_PARAM_BRACKETS",
                    fromModName, // "FROM_MODULE_NAME",
                    fromModOid, // "FROM_MODULE_OID",
                    "", // "FROM_MODULE_IRI", (Not even allowed in syntax.)
                    selopt, // "FROM_MODULE_SEL_OPT",
                    prod?.location.startIndex.toString() ?? "", // "START_OFFSET",
                    prod?.location.endIndex.toString() ?? "", // "END_OFFSET",
                    prod?.location.lineNumber.toString() ?? "", // "START_LINE",
                    prod?.location.columnNumber.toString() ?? "", // "START_COLUMN",
                    // relative to avoid leaking user's full paths.
                    vscode.workspace.asRelativePath(document.uri), // FILE_PATH
                ].join(",");
                rows.push(row);
            }
        }
    }
}

/**
 * @summary Get CSV rows for each module
 * @param document The text document
 * @param token The cancellation token
 * @param rows The exported CSV rows
 * @returns A promise that resolves to nothing
 * @async
 * @function
 */
export
async function get_module_csv_rows_from_doc(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
    rows: string[],
): Promise<void> {
    const p = await getParserOutputsWithLogging(document, token);
    if (!p) {
        return failExport(document);   
    }
    const modules = p.parsedModules;
    for (const mod of modules) {
        if (token.isCancellationRequested) {
            return;
        }
        const modnums = mod.oid
            ? getOidNodesFromModuleIdentifier(mod.oid)
            : undefined;
        const modiri = (
            mod.iri
            && !mod.iri.includes("\"")
            && !mod.iri.includes(",")
        )
            ? mod.iri
            : "";

        const taggingMode: string = mod.taggingMode;
        const extensImplied: string = mod.extensibilityImplied ? "TRUE" : "FALSE";
        const encodingRef: string = mod.encodingReference?.replace(/\s+INSTRUCTIONS/, "") ?? "";
        const exportsAll: string = mod.exports ? "FALSE" : "TRUE";
        const assnsCount: string = Object.keys(mod.assignments).length.toString();
        const impModsCount: string = Object.keys(mod.imports.modules).length.toString();
        const impSymsCount: string = Object.values(mod.imports.modules)
            .map((sfm) => Object.keys(sfm.symbolList).length)
            .reduce((acc, cur) => acc + cur, 0)
            .toString()
            ;
        const prod = mod.production;
        const row = [
            mod.name, // "MODULE_NAME",
            modnums?.join(".") ?? "", // "MODULE_OID",
            modiri, // "MODULE_IRI",
            taggingMode, // "TAGGING_MODE",
            extensImplied, // "EXTENS_IMPLIED",
            encodingRef, // "ENCODING_REF",
            exportsAll, // "EXPORTS_ALL",
            assnsCount, // "ASSIGNMENTS_COUNT",
            impModsCount, // "IMPORTED_MODS_COUNT",
            impSymsCount, // "IMPORTED_SYMS_COUNT",
            prod?.location.startIndex.toString() ?? "", // "START_OFFSET",
            prod?.location.endIndex.toString() ?? "", // "END_OFFSET",
            prod?.location.lineNumber.toString() ?? "", // "START_LINE",
            prod?.location.columnNumber.toString() ?? "", // "START_COLUMN",
            // relative to avoid leaking user's full paths.
            vscode.workspace.asRelativePath(document.uri), // FILE_PATH
        ].join(",");
        rows.push(row);
    }
}

/**
 * @summary Get CSV rows for each assignment
 * @param document The text document
 * @param token The cancellation token
 * @param rows The exported CSV rows
 * @returns A promise that resolves to nothing
 * @async
 * @function
 */
export
async function get_assignment_csv_rows_from_doc(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
    rows: string[],
): Promise<void> {
    const p = await getParserOutputsWithLogging(document, token);
    if (!p) {
        return failExport(document);   
    }
    const modules = p.parsedModules;
    for (const mod of modules) {
        if (token.isCancellationRequested) {
            return;
        }
        const modnums = mod.oid
            ? getOidNodesFromModuleIdentifier(mod.oid)
            : undefined;
        const modiri = (
            mod.iri
            && !mod.iri.includes("\"")
            && !mod.iri.includes(",")
        )
            ? mod.iri
            : "";

        for (const assn of Object.values(mod.assignments)) {
            const prod = assn.production;
            const typeType = (
                assn.assignmentType === AssignmentType.ValueAssignment
                || assn.assignmentType === AssignmentType.TypeAssignment
                || assn.assignmentType === AssignmentType.ValueSetTypeAssignment
            )
                ? assn.type.typeType.toString()
                : "";
            const typeName = (
                (
                    assn.assignmentType === AssignmentType.ValueAssignment
                    || assn.assignmentType === AssignmentType.TypeAssignment
                    || assn.assignmentType === AssignmentType.ValueSetTypeAssignment
                )
                && assn.type.typeType === TypeType.DefinedType
            )
                ? [
                    assn.type.type.computedModule,
                    assn.type.type.reference,
                ].join(".")
                : "";
            const valueType = (assn.assignmentType === AssignmentType.ValueAssignment)
                ? assn.value.valueType.toString()
                : "";
            const objClassName = (
                assn.assignmentType === AssignmentType.ObjectAssignment
                || assn.assignmentType === AssignmentType.ObjectSetAssignment
            )
                ? [
                    assn.definedObjectClass.computedModule,
                    assn.definedObjectClass.reference,
                ].join(".")
                : "";
            const row = [
                mod.name, // "MODULE_NAME",
                modnums?.join(".") ?? "", // "MODULE_OID",
                modiri, // "MODULE_IRI",
                assn.identifier, // "ASSIGNMENT_NAME",
                assn.assignmentType, // "ASSIGNMENT_TYPE",
                (assn.parameters?.length ?? 0).toString(), // "PARAMETERS_COUNT",
                typeType, // "TYPE_TYPE",
                typeName, // "TYPE_NAME",
                valueType, // "VALUE_TYPE",
                objClassName, // "INFO_OBJECT_CLASS",
                assn.originalIndex?.toString() ?? "", // "ASSIGNMENT_INDEX",
                assn.dependencyIndex?.toString() ?? "", // "DEPENDENCY_INDEX",
                prod?.location.startIndex.toString() ?? "", // "START_OFFSET",
                prod?.location.endIndex.toString() ?? "", // "END_OFFSET",
                prod?.location.lineNumber.toString() ?? "", // "START_LINE",
                prod?.location.columnNumber.toString() ?? "", // "START_COLUMN",
                // relative to avoid leaking user's full paths.
                vscode.workspace.asRelativePath(document.uri), // FILE_PATH
            ].join(",");
            rows.push(row);
        }
    }
}

/**
 * Replacer function to be used in `JSON.stringify()`.
 */
function replacer(this: any, _: string, value: any): any {
    if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Array.isArray(value.children)
    ) {
        const { children, ...rest } = value;
        return {
            ...rest,
            childrenCount: children.length,
        };
    }

    return value;
}

/**
 * @summary Export all ASN.1 modules in the current document to JSON
 * @description
 * 
 * This opens up the resulting JSON in a new tab. Note that there is no
 * equivalent of this for the whole workspace, because the resulting JSON is
 * enormous. I could implement this if you really want.
 * 
 * @param document The text document
 * @param token The cancellation token
 * @returns A promise resolving to nothing
 * @async
 * @function
 */
export
async function get_modules_json_from_doc(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
): Promise<string> {
    const p = await getParserOutputsWithLogging(document, token);
    if (!p) {
        return failExport(document);   
    }
    const modules = p.parsedModules;
    const obj = {
        fileUri: vscode.workspace.asRelativePath(document.uri),
        modules,
    };
    return JSON.stringify(obj, replacer, 4);
}

/**
 * @summary Export all object identifiers from the workspace as CSV
 * @description
 * 
 * This opens up the resulting CSV in a new tab.
 * 
 * @param document The text document
 * @param token The cancellation token
 * @returns A promise resolving to nothing
 * @async
 * @function
 */
export
async function export_oid_csv_from_doc(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
): Promise<void> {
    const rows: string[] = [];
    await get_oid_csv_rows_from_doc(document, token, rows);
    const eol = getExportEol(document);
    const csvDocument = await vscode.workspace.openTextDocument({
        language: "csv",
        content: OID_CSV_HEADERS.join(",") + eol + rows.join(eol),
    });

    await vscode.window.showTextDocument(csvDocument);
}

/**
 * @summary Export all object identifiers from the workspace as CSV
 * @description
 * 
 * This opens up the resulting CSV in a new tab.
 *
 * @returns A promise resolving to nothing
 * @async
 * @function
 */
export
async function export_oid_csv_from_workspace(
    token: vscode.CancellationToken,
): Promise<void> {
    const rows: string[] = [];
    const uris = await getAsn1Files();
    for (const uri of uris) {
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            await get_oid_csv_rows_from_doc(doc, token, rows);
        } catch {
            continue;
        }
    }
    const eol = getExportEol();
    const csvDocument = await vscode.workspace.openTextDocument({
        language: "csv",
        content: OID_CSV_HEADERS.join(",") + eol + rows.join(eol),
    });

    await vscode.window.showTextDocument(csvDocument);
}

/**
 * @summary Export all ASN.1 imports and exports in the current document as CSV
 * @description
 * 
 * This opens up the resulting CSV in a new tab.
 *
 * @param document The text document
 * @param token The cancellation token
 * @returns A promise resolving to nothing
 * @async
 * @function
 */
export
async function export_deps_csv_from_doc(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
): Promise<void> {
    const rows: string[] = [];
    await get_dep_csv_rows_from_doc(document, token, rows);
    const eol = getExportEol(document);
    const csvDocument = await vscode.workspace.openTextDocument({
        language: "csv",
        content: DEPS_CSV_HEADERS.join(",") + eol + rows.join(eol),
    });

    await vscode.window.showTextDocument(csvDocument);
}

/**
 * @summary Export all ASN.1 imports and exports in the workspace as CSV
 * @description
 * 
 * This opens up the resulting CSV in a new tab.
 *
 * @param token The cancellation token
 * @returns A promise resolving to nothing
 * @async
 * @function
 */
export
async function export_deps_csv_from_workspace(
    token: vscode.CancellationToken,
): Promise<void> {
    const rows: string[] = [];
    const uris = await getAsn1Files();
    for (const uri of uris) {
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            await get_dep_csv_rows_from_doc(doc, token, rows);
        } catch {
            continue;
        }
    }
    const eol = getExportEol();
    const csvDocument = await vscode.workspace.openTextDocument({
        language: "csv",
        content: DEPS_CSV_HEADERS.join(",") + eol + rows.join(eol),
    });

    await vscode.window.showTextDocument(csvDocument);
}

/**
 * @summary Export all ASN.1 modules from the current document as CSV
 * @description
 * 
 * This opens up the resulting CSV in a new tab.
 * 
 * @param document The text document
 * @param token The cancellation token
 * @returns A promise resolving to nothing
 * @async
 * @function
 */
export
async function export_modules_csv_from_doc(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
): Promise<void> {
    const rows: string[] = [];
    await get_module_csv_rows_from_doc(document, token, rows);
    const eol = getExportEol(document);
    const csvDocument = await vscode.workspace.openTextDocument({
        language: "csv",
        content: MODS_CSV_HEADERS.join(",") + eol + rows.join(eol),
    });

    await vscode.window.showTextDocument(csvDocument);
}

/**
 * @summary Export all ASN.1 modules from the workspace as CSV
 * @description
 * 
 * This opens up the resulting CSV in a new tab.
 *
 * @param token The cancellation token
 * @returns A promise resolving to nothing
 * @async
 * @function
 */
export
async function export_modules_csv_from_workspace(
    token: vscode.CancellationToken,
): Promise<void> {
    const rows: string[] = [];
    const uris = await getAsn1Files();
    for (const uri of uris) {
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            await get_module_csv_rows_from_doc(doc, token, rows);
        } catch {
            continue;
        }
    }
    const eol = getExportEol();
    const csvDocument = await vscode.workspace.openTextDocument({
        language: "csv",
        content: MODS_CSV_HEADERS.join(",") + eol + rows.join(eol),
    });

    await vscode.window.showTextDocument(csvDocument);
}

/**
 * @summary Export all ASN.1 assignments from the current document as CSV
 * @description
 * 
 * This opens up the resulting CSV in a new tab.
 * 
 * @param document The text document
 * @param token The cancellation token
 * @returns A promise resolving to nothing
 * @async
 * @function
 */
export
async function export_assignments_csv_from_doc(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
): Promise<void> {
    const rows: string[] = [];
    await get_assignment_csv_rows_from_doc(document, token, rows);
    const eol = getExportEol(document);
    const csvDocument = await vscode.workspace.openTextDocument({
        language: "csv",
        content: ASSNS_CSV_HEADERS.join(",") + eol + rows.join(eol),
    });

    await vscode.window.showTextDocument(csvDocument);
}

const NO_DOC_OPEN = "No document open. This command requires an open ASN.1 file.";

/**
 * @summary Export all ASN.1 assignments from the workspace as CSV
 * @description
 * 
 * This opens up the resulting CSV in a new tab.
 *
 * @param token The cancellation token
 * @returns A promise resolving to nothing
 * @async
 * @function
 */
export
async function export_assignments_csv_from_workspace(
    token: vscode.CancellationToken,
): Promise<void> {
    const rows: string[] = [];
    const uris = await getAsn1Files();
    for (const uri of uris) {
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            await get_assignment_csv_rows_from_doc(doc, token, rows);
        } catch {
            continue;
        }
    }
    const eol = getExportEol();
    const csvDocument = await vscode.workspace.openTextDocument({
        language: "csv",
        content: ASSNS_CSV_HEADERS.join(",") + eol + rows.join(eol),
    });

    await vscode.window.showTextDocument(csvDocument);
}

/**
 * @summary VS Code command to export all ASN.1 imports and exports in the current document as CSV
 * @description
 * 
 * This opens up the resulting CSV in a new tab.
 * 
 * This operation may be cancelled in a popup.
 *
 * @returns A promise resolving to nothing
 * @async
 * @function
 */
export async function export_deps_csv_from_doc_cmd(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const document = editor?.document;
    if (!document) {
        vscode.window.showErrorMessage(NO_DOC_OPEN);
        return;
    }
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: true,
            title: "Processing..."
        },
        async (_progress, token) => {
            await export_deps_csv_from_doc(document, token);
        },
    );
}

/**
 * @summary VS Code command to export all ASN.1 imports and exports in the workspace as CSV
 * @description
 * 
 * This opens up the resulting CSV in a new tab.
 * 
 * This operation may be cancelled in a popup.
 *
 * @returns A promise resolving to nothing
 * @async
 * @function
 */
export async function export_deps_csv_from_workspace_cmd(): Promise<void> {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: true,
            title: "Processing..."
        },
        async (_progress, token) => {
            await export_deps_csv_from_workspace(token);
        },
    );
}

/**
 * @summary VS Code command to export all object identifiers from the current document as CSV
 * @description
 * 
 * This opens up the resulting CSV in a new tab.
 * 
 * This operation may be cancelled in a popup.
 *
 * @returns A promise resolving to nothing
 * @async
 * @function
 */
export async function export_oid_csv_from_doc_cmd(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const document = editor?.document;
    if (!document) {
        vscode.window.showErrorMessage(NO_DOC_OPEN);
        return;
    }
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: true,
            title: "Processing..."
        },
        async (_progress, token) => {
            await export_oid_csv_from_doc(document, token);
        },
    );
}

/**
 * @summary VS Code command to export all object identifiers from the workspace as CSV
 * @description
 * 
 * This opens up the resulting CSV in a new tab.
 * 
 * This operation may be cancelled in a popup.
 *
 * @returns A promise resolving to nothing
 * @async
 * @function
 */
export async function export_oid_csv_from_workspace_cmd(): Promise<void> {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: true,
            title: "Processing..."
        },
        async (_progress, token) => {
            await export_oid_csv_from_workspace(token);
        },
    );
}

/**
 * @summary VS Code command to export all ASN.1 modules from the current document as CSV
 * @description
 * 
 * This opens up the resulting CSV in a new tab.
 * 
 * This operation may be cancelled in a popup.
 *
 * @returns A promise resolving to nothing
 * @async
 * @function
 */
export async function export_modules_csv_from_doc_cmd(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const document = editor?.document;
    if (!document) {
        vscode.window.showErrorMessage(NO_DOC_OPEN);
        return;
    }
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: true,
            title: "Processing..."
        },
        async (_progress, token) => {
            await export_modules_csv_from_doc(document, token);
        },
    );
}

/**
 * @summary VS Code command to export all ASN.1 modules from the workspace as CSV
 * @description
 * 
 * This opens up the resulting CSV in a new tab.
 * 
 * This operation may be cancelled in a popup.
 *
 * @returns A promise resolving to nothing
 * @async
 * @function
 */
export async function export_modules_csv_from_workspace_cmd(): Promise<void> {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: true,
            title: "Processing..."
        },
        async (_progress, token) => {
            await export_modules_csv_from_workspace(token);
        },
    );
}

/**
 * @summary VS Code command to export all ASN.1 assignments from the current document as CSV
 * @description
 * 
 * This opens up the resulting CSV in a new tab.
 * 
 * This operation may be cancelled in a popup.
 *
 * @returns A promise resolving to nothing
 * @async
 * @function
 */
export async function export_assignments_csv_from_doc_cmd(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const document = editor?.document;
    if (!document) {
        vscode.window.showErrorMessage(NO_DOC_OPEN);
        return;
    }
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: true,
            title: "Processing..."
        },
        async (_progress, token) => {
            await export_assignments_csv_from_doc(document, token);
        },
    );
}

/**
 * @summary VS Code command to export all ASN.1 assignments from the workspace as CSV
 * @description
 * 
 * This opens up the resulting CSV in a new tab.
 * 
 * This operation may be cancelled in a popup.
 *
 * @returns A promise resolving to nothing
 * @async
 * @function
 */
export async function export_assignments_csv_from_workspace_cmd(): Promise<void> {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: true,
            title: "Processing..."
        },
        async (_progress, token) => {
            await export_assignments_csv_from_workspace(token);
        },
    );
}

/**
 * @summary VS Code command to export all ASN.1 modules in the current document to JSON
 * @description
 * 
 * This opens up the resulting JSON in a new tab. Note that there is no
 * equivalent of this for the whole workspace, because the resulting JSON is
 * enormous. I could implement this if you really want.
 * 
 * This operation may be cancelled in a popup.
 * 
 * @returns A promise resolving to nothing
 * @async
 * @function
 */
export async function export_modules_json_from_doc_cmd(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const document = editor?.document;
    if (!document) {
        vscode.window.showErrorMessage(NO_DOC_OPEN);
        return;
    }
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: true,
            title: "Processing..."
        },
        async (_progress, token) => {
            const jsonstr = await get_modules_json_from_doc(document, token);
            const jsonDocument = await vscode.workspace.openTextDocument({
                language: "json",
                content: jsonstr,
            });
            await vscode.window.showTextDocument(jsonDocument);
        },
    );
}
