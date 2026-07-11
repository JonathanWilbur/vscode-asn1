import * as vscode from 'vscode';
import { getOidNodesFromModuleIdentifier } from '../utils.js';
import type { FileURIStr } from '../types.js';
import { getParserOutputsWithLogging } from '../parsing.js';
import {
    asn1ModuleOidMatch,
    SelectionOption,
    type Module,
} from '@wildboar/asn1-parser';

/**
 * Scope of files to include in an operation.
 */
export interface Scope {
    /** URIs of files to include */
    readonly uris?: string[];
    /** Globs of files to include */
    readonly includeGlobs?: string[];
    /** Globs of files to exclude */
    readonly excludeGlob?: string;
    /** If set, filter out ASN.1 modules whose names differ from this */
    readonly moduleName?: string;
    /** If set, filter out ASN.1 modules whose object identifiers differ from this */
    readonly moduleOid?: number[];
    /** Selection option governing how object identifiers match between modules and imports */
    readonly selectionOption?: "successors" | "descendants";
}

async function* getAsn1Files(): AsyncIterableIterator<vscode.Uri, void> {
    const config = vscode.workspace.getConfiguration("asn1");
    const includeFiles = config.get<string>("includeFiles", "**/*.{asn,asn1}");
    const excludeFiles: string | undefined = config.get<string>("excludeFiles");
    for (const document of vscode.workspace.textDocuments) {
        if (document.languageId === "asn1") {
            yield document.uri;
        }
    }
    yield *await vscode.workspace.findFiles(includeFiles, excludeFiles);
}

async function* getFilesForScope(scope?: Scope): AsyncIterableIterator<vscode.Uri, void> {
    if (!scope) {
        yield *getAsn1Files();
        return;
    }
    for (const uristr of scope.uris ?? []) {
        try {
            const uri = vscode.Uri.parse(uristr, true);
            yield uri;
        } catch {
            continue;
        }
    }
    for (const includeGlob of scope.includeGlobs ?? []) {
        const workspaceUris = await vscode.workspace.findFiles(
            includeGlob,
            scope.excludeGlob,
        );
        yield* workspaceUris;
    }
}

async function* getDedupedFilesForScope(scope?: Scope): AsyncIterableIterator<vscode.Uri, void> {
    const encounteredFiles = new Set<FileURIStr>();
    for await (const uri of getFilesForScope(scope)) {
        const key = uri.toString();
        const existing = encounteredFiles.has(key);
        if (existing) {
            continue;
        }
        yield uri;
        encounteredFiles.add(key);
    }
}

export
async function* getModulesForScope(
    scope?: Scope,
    token?: vscode.CancellationToken,
): AsyncIterableIterator<[vscode.TextDocument, Module], void> {
    const selopt = scope?.selectionOption
        ? ((scope.selectionOption === "successors")
            ? SelectionOption.WITH_SUCCESSORS
            : SelectionOption.WITH_DESCENDANTS)
        : undefined;
    for await (const uri of getDedupedFilesForScope(scope)) {
        try {
            const doc = await vscode.workspace.openTextDocument(uri);
            const p = await getParserOutputsWithLogging(uri, token);
            if (!p) {
                continue;
            }
            for (const mod of p.parsedModules) {
                if (scope?.moduleName && scope.moduleName !== mod.name) {
                    continue;
                }
                if (!scope?.moduleOid !== !mod.oid) {
                    continue;
                } else if (scope?.moduleOid && mod.oid) {
                    const hasoid = getOidNodesFromModuleIdentifier(mod.oid);
                    if (!hasoid || !asn1ModuleOidMatch(hasoid, scope.moduleOid, selopt)) {
                        continue;
                    }
                }
                yield [doc, mod];
            }
        } catch {
            continue;
        }
    }
}
