/**
 * @module
 * 
 * Functions for indexing and looking up what files contain what ASN.1 modules
 * and what ASN.1 modules are in what files.
 */
import * as vscode from 'vscode';
import type {
    FileURIStr,
    ASN1ModuleName,
    LexedTokens,
    VersionNumber,
    VersionNumbered,
    ImportKey,
    ModuleInfo,
} from "./types.js";
import { getParserOutputs } from './parsing.js';
import { setImmediate } from "node:timers";
import { log } from "./logging.js";

// TODO: Test this.
// TODO: This could be moved to @wildboar/asn1-parser
/**
 * @internal Only exported for testing purposes.
 * @param tokens 
 * @param text 
 * @returns 
 */
export function* getModuleNamesAndImportsFromTokenStream(
    tokens: LexedTokens,
    text: string,
): IterableIterator<ModuleInfo> {
    let i = 0;
    let importsIndex: Set<ImportKey> = new Set();
    while (i < tokens.length) {
        const token = tokens[i++];
        if (
            (token.type !== 'typereference')
            && (token.type !== 'objectclassreference')
        ) {
            // Skip everything up until the first module identifier.
            continue;
        }

        const importsStartIndex = tokens
            .slice(i)
            .findIndex((t) => t.type === "IMPORTS");
        if (importsStartIndex > -1) {
            i += importsStartIndex;
            let symbolsImported: string[] = [];
            let readingModuleName: boolean = false;
            while (i < tokens.length) {
                const importToken = tokens[i++];
                if (importToken.type === "semiColon") {
                    break;
                }
                if (importToken.type.endsWith("reference")) {
                    if (readingModuleName) {
                        const loc = importToken.location;
                        const modname = text.slice(loc.startIndex, loc.endIndex);
                        for (const symbol of symbolsImported) {
                            importsIndex.add(`${modname}:${symbol}`); 
                        }
                        symbolsImported = [];
                        readingModuleName = false;
                    } else {
                        const loc = importToken.location;
                        const ident = text.slice(loc.startIndex, loc.endIndex);
                        symbolsImported.push(ident);
                    }
                }
                if (importToken.type === "FROM") {
                    readingModuleName = true;
                }
            }
        }

        // Now loop until we find end.
        const moduleEndIndex = tokens
            .slice(i)
            .findIndex((t) => t.type === "END");
        if (moduleEndIndex === -1) {
            return; // No module end.
        }
        i += (moduleEndIndex + 1);
        const loc = token.location;
        yield {
            name: text.slice(loc.startIndex, loc.endIndex),
            imports: importsIndex,
        };
    }
}

const filesToModules: Map<FileURIStr, VersionNumbered<Map<ASN1ModuleName, ModuleInfo>>> = new Map();
const modulesToFiles: Map<ASN1ModuleName, Map<FileURIStr, VersionNumber>> = new Map();

export async function indexAsn1File(docOrUri: vscode.Uri | vscode.TextDocument) {
    const document = docOrUri instanceof vscode.Uri
        ? await vscode.workspace.openTextDocument(docOrUri)
        : docOrUri;
    if (document.languageId !== "asn1") {
        return;
    }
    const text = document.getText();
    const p = await getParserOutputs(document, "lexing");
    if (!p.lexicalTokens || "err" in p.lexicalTokens) {
        log.appendLine(`malformed asn.1 file ${document.uri} could not be indexed: ${p.lexicalTokens?.err ?? "<unknown lexing error>"}`);
        return;
    }
    const tokens = p.lexicalTokens.ok;
    const uristr = document.uri.toString();
    const modulesFound: Map<ASN1ModuleName, ModuleInfo> = new Map();
    const modulesAndImports = getModuleNamesAndImportsFromTokenStream(tokens, text);
    for (const modinfo of modulesAndImports) {
        modulesFound.set(modinfo.name, modinfo);
        const files = modulesToFiles.get(modinfo.name);
        if (files) {
            const indexedVersion = files.get(uristr);
            if (
                (typeof indexedVersion === "undefined")
                || (document.version > indexedVersion)
            ) {
                files.set(uristr, document.version);
            }
        } else {
            modulesToFiles.set(modinfo.name, new Map([[uristr, document.version]]));
        }
    }
    const ftm = filesToModules.get(uristr);
    if (document.version > (ftm?.version ?? -1)) {
        const newftm = { version: document.version, item: modulesFound };
        filesToModules.set(uristr, newftm);
    }
}

export async function indexAsn1Files(): Promise<void> {
    const uris = await vscode.workspace.findFiles(
        "**/*.{asn,asn1}",
        "**/{node_modules,dist,out,build,.git}/**", // TODO: Configurable ignores.
    );

    // TODO: Change this to use multithreading / worker threads
    for (const uri of uris) {
        // To give other extensions a chance to run.
        await new Promise(resolve => setImmediate(resolve));
        await indexAsn1File(uri);
    }
    log.appendLine(`${new Date()}: total of ${uris.length} asn.1 files indexed`);
}

// FIXME: Make this return the decoded URLs instead. It would clean up a lot of boilerplate.
export
function* getFilesContainingModule(
    modname: string,
): IterableIterator<FileURIStr> {
    const files = modulesToFiles.get(modname);
    if (!files) {
        return;
    }
    yield *files.keys();
}

export
function* findAllReferencesFallibly(
    modname: string,
    identifier: string,
): IterableIterator<FileURIStr> {
    const key: ImportKey = `${modname}:${identifier}`;
    fileloop:
    for (const [fileuri, { item: modmap }] of filesToModules.entries()) {
        for (const { imports } of modmap.values()) {
            for (const importedSymbol of imports.values()) {
                if (importedSymbol === key) {
                    yield fileuri;
                    // No need to examine this file any further.
                    continue fileloop;
                }
            }
        }
    }
}

export
function* findAllModuleReferencesFallibly(
    modname: string,
): IterableIterator<FileURIStr> {
    fileloop:
    for (const [fileuri, { item: modmap }] of filesToModules.entries()) {
        for (const { imports } of modmap.values()) {
            for (const importedSymbol of imports.values()) {
                if (importedSymbol.startsWith(modname + ":")) {
                    yield fileuri;
                    // No need to examine this file any further.
                    continue fileloop;
                }
            }
        }
    }
}

// export
// function* getModulesWithinFile(
//     uristr: FileURIStr,
// ): IterableIterator<ASN1ModuleName> {
//     const modules = filesToModules.get(uristr);
//     if (!modules) {
//         return;
//     }
//     yield *modules.item.values();
// }

// Intended to be called upon file changes.
export
async function reindexAsn1File(uri: vscode.Uri) {
    const uristr = uri.toString();
    filesToModules.delete(uristr);
    // FIXME: Not done yet.
    // modulesToFiles
}

// TODO: deindexAsn1File()

export
function clearAsn1ModuleIndexes() {
    filesToModules.clear();
    modulesToFiles.clear();
}
