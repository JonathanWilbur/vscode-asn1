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
} from "@wildboar/asn1-parser";
import { resolveOID, resolveOIDComponents } from "./resolve.js";
import {
    getOidNodesFromModuleIdentifier,
    nameAndOrNumberToIriString,
    nameAndOrNumberToString,
    typeTypesThatCouldBeAnything,
} from "./utils.js";

function failExport(): never {
    // TODO: Do something better than this.
    throw new Error("Export failed");
}

interface OidInfo {
    moduleName: string;
    moduleOid?: NameAndOrNumber[];
    moduleIRI?: string;
    assignmentName?: string;
    assignmentIndex?: number;
    arcs: NameAndOrNumber[];
    sourceFile: vscode.Uri;
    location?: Location,
}

const CSV_HEADER: string = [
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
].join(",");

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

async function resolveOidValue(
    document: vscode.TextDocument,
    val: ObjectIdentifierValue,
    cancel: vscode.CancellationToken,
    currentModule: Module,
): Promise<NameAndOrNumber[] | undefined> {
    let oid: NameAndOrNumber[] | undefined;
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
                return failExport();
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

// TODO: Support cancellation somehow?
export
async function get_csv_rows_from_doc(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
    rows: string[],
): Promise<void> {
    const p = await getParserOutputs(document, undefined, token);
    if (!p.parsedModules || ("err" in p.parsedModules)) {
        return failExport();   
    }
    const modules = p.parsedModules.ok;
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

export
async function export_oid_csv_from_doc(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
): Promise<void> {
    const rows: string[] = [];
    await get_csv_rows_from_doc(document, token, rows);
    // TODO: Allow a user to override this.
    const eol = (document.eol === vscode.EndOfLine.CRLF)
        ? "\r\n"
        : "\n";

    const csvDocument = await vscode.workspace.openTextDocument({
        language: "csv",
        content: CSV_HEADER + eol + rows.join(eol),
    });

    await vscode.window.showTextDocument(csvDocument);
}

export
async function export_oid_csv_from_workspace(
    token: vscode.CancellationToken,
): Promise<void> {
    const rows: string[] = [];
    const uris = await vscode.workspace.findFiles("**/*.asn1");
    for (const uri of uris) {
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            await get_csv_rows_from_doc(doc, token, rows);
        } catch {
            continue;
        }
    }

    // TODO: Allow a user to override this.
    const eol = "\r\n";

    const csvDocument = await vscode.workspace.openTextDocument({
        language: "csv",
        content: CSV_HEADER + eol + rows.join(eol),
    });

    await vscode.window.showTextDocument(csvDocument);
}
