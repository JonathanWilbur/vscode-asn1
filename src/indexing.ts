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
    VersionNumber,
    VersionNumbered,
    ImportKey,
    ModuleInfo,
} from "./types.js";
import { getParserOutputs } from './parsing.js';
import { setImmediate } from "node:timers";
import { log } from "./logging.js";
import { getAsn1Files } from './utils.js';
import type {
    Production,
    TerminalProductionType,
} from '@wildboar/asn1-parser';

// TODO: This could be ported to `@wildboar/asn1-parser` instead
/**
 * @internal Only exported for testing purposes.
 * @summary Without fully parsing a file, obtain the module and their imports
 * @param tokens The lexical tokens from lexing the file
 * @param text The text of the file
 * @yields A module, along with its OID and its imports
 * @generator
 */
export function* getModuleNamesAndImportsFromTokenStream(
    tokens: Production<TerminalProductionType>[],
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

        const moduleEndIndex = tokens
            .slice(i)
            .findIndex((t) => t.type === "END");
        if (moduleEndIndex === -1) {
            return; // No module end.
        }
        const importsStartIndex = tokens
            .slice(i, moduleEndIndex)
            .findIndex((t) => t.type === "IMPORTS");
        if (importsStartIndex > -1) {
            i += importsStartIndex;
            let symbolsImported: string[] = [];
            let readingModuleName: boolean = false;
            while (i < (i + moduleEndIndex)) {
                const importToken = tokens[i++];
                if (importToken.type === "semiColon") {
                    break;
                }
                if (importToken.type.endsWith("reference") || importToken.type === "identifier") {
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

        i += (moduleEndIndex + 1);
        const loc = token.location;
        yield {
            name: text.slice(loc.startIndex, loc.endIndex),
            imports: importsIndex,
        };
    }
}

/**
 * Mapping of files by URI to the ASN.1 modules contained in it.
 * 
 * Value includes a version number so you can tell if it is out-of-date.
 */
const filesToModules: Map<FileURIStr, VersionNumbered<Map<ASN1ModuleName, ModuleInfo>>> = new Map();

/**
 * Mapping of ASN.1 module names to files that contain them by URI and version number.
 * 
 * Values include a version number so you can tell if it is out-of-date.
 */
const modulesToFiles: Map<ASN1ModuleName, Map<FileURIStr, VersionNumber>> = new Map();

/**
 * Globally defined named bits from `BIT STRING { ident (n), ... }` productions.
 *
 * Entries are never removed except by {@link clearNamedBitAndIntegerIndexes}.
 */
const namedBits: Set<string> = new Set();

/**
 * Globally defined named integers and `ENUMERATED` variant identifiers.
 *
 * Entries are never removed except by {@link clearNamedBitAndIntegerIndexes}.
 */
const namedIntegersAndEnums: Set<string> = new Set();

/**
 * Lexical token types that carry no identifier information and can be skipped
 * when scanning for named bits, named integers, and enumerated variants.
 */
const ignorableLexicalTokenTypes: Set<string> = new Set([
    "comment",
    "newlineWhitespace",
    "nonNewlineWhitespace",
]);

/**
 * @summary Find the next non-ignorable lexical token index
 * @param tokens The lexical tokens from lexing an ASN.1 file
 * @param start The index at which to begin searching
 * @returns The index of the next significant token, or `tokens.length` if none remain
 * @author Cursor Grok 4.6
 * @function
 */
function nextSignificantTokenIndex(
    tokens: Production<TerminalProductionType>[],
    start: number,
): number {
    let i = start;
    while (i < tokens.length && ignorableLexicalTokenTypes.has(tokens[i]!.type)) {
        i++;
    }
    return i;
}

/**
 * @summary Collect identifiers from a brace-delimited named-number or enumeration list
 * @description
 *
 * Starting at a `{` token, walk until the matching `}` and insert every
 * `identifier` that appears at brace-depth 1 and parenthesis-depth 0 into
 * `dest`. Nested braces (for example exception specs) are skipped. This is
 * intentionally sloppy: the cache is append-only and may include false
 * positives.
 *
 * @param tokens The lexical tokens from lexing an ASN.1 file
 * @param text The text of the file
 * @param openBraceIndex The index of the opening `{` token
 * @param dest The set into which collected identifiers are inserted
 * @returns The index immediately after the matching `}`, or `tokens.length`
 * @author Cursor Grok 4.6
 * @function
 */
function collectIdentifiersInBraces(
    tokens: Production<TerminalProductionType>[],
    text: string,
    openBraceIndex: number,
    dest: Set<string>,
): number {
    let braceDepth = 1;
    let parenDepth = 0;
    let i = openBraceIndex + 1;
    while (i < tokens.length && braceDepth > 0) {
        const token = tokens[i]!;
        if (token.type === "curlyOpening") {
            braceDepth++;
        } else if (token.type === "curlyClosing") {
            braceDepth--;
        } else if (token.type === "parenthesisOpening") {
            parenDepth++;
        } else if (token.type === "parenthesisClosing") {
            parenDepth--;
        } else if (
            token.type === "identifier"
            && braceDepth === 1
            && parenDepth === 0
        ) {
            dest.add(text.slice(token.location.startIndex, token.location.endIndex));
        }
        i++;
    }
    return i;
}

/**
 * @summary Index named bits, named integers, and enumerated variants from a token stream
 * @description
 *
 * Scans a lexed ASN.1 file for:
 *
 * - `ENUMERATED { ident, ... }` variants
 * - `INTEGER { ident (n), ... }` named integers
 * - `BIT STRING { ident (n), ... }` named bits
 *
 * Names are added to process-wide sets and are never removed by this function.
 *
 * @param tokens The lexical tokens from lexing the file
 * @param text The text of the file
 * @author Cursor Grok 4.6
 * @function
 */
export function indexNamedBitsAndIntegersFromTokenStream(
    tokens: Production<TerminalProductionType>[],
    text: string,
): void {
    let i = 0;
    while (i < tokens.length) {
        const token = tokens[i]!;
        if (token.type === "ENUMERATED" || token.type === "INTEGER") {
            const next = nextSignificantTokenIndex(tokens, i + 1);
            if (next < tokens.length && tokens[next]!.type === "curlyOpening") {
                i = collectIdentifiersInBraces(
                    tokens,
                    text,
                    next,
                    namedIntegersAndEnums,
                );
                continue;
            }
        } else if (token.type === "BIT") {
            const afterBit = nextSignificantTokenIndex(tokens, i + 1);
            if (afterBit < tokens.length && tokens[afterBit]!.type === "STRING") {
                const afterString = nextSignificantTokenIndex(tokens, afterBit + 1);
                if (
                    afterString < tokens.length
                    && tokens[afterString]!.type === "curlyOpening"
                ) {
                    i = collectIdentifiersInBraces(
                        tokens,
                        text,
                        afterString,
                        namedBits,
                    );
                    continue;
                }
            }
        }
        i++;
    }
}

/**
 * @summary Whether `identifier` is a globally indexed named bit
 * @param identifier The identifier to look up
 * @returns `true` if the identifier was indexed as a named bit
 * @author Cursor Grok 4.6
 * @function
 */
export function isKnownNamedBit(identifier: string): boolean {
    return namedBits.has(identifier);
}

/**
 * @summary Whether `identifier` is a globally indexed named integer or enumerated variant
 * @param identifier The identifier to look up
 * @returns `true` if the identifier was indexed as a named integer or `ENUMERATED` variant
 * @author Cursor Grok 4.6
 * @function
 */
export function isKnownNamedIntegerOrEnum(identifier: string): boolean {
    return namedIntegersAndEnums.has(identifier);
}

/**
 * @summary Clear the named-bit and named-integer / enumerated-variant indexes
 * @description
 *
 * This is intended to be called when the user asks to re-index these caches,
 * and upon deactivating the extension.
 *
 * @author Cursor Grok 4.6
 * @function
 */
export function clearNamedBitAndIntegerIndexes(): void {
    namedBits.clear();
    namedIntegersAndEnums.clear();
}

/**
 * @summary Index an ASN.1 file
 * @param docOrUri The text document, or a URI to it
 * @returns A promise that resolves to nothing
 * @async
 * @function
 */
export async function indexAsn1File(
    docOrUri: vscode.Uri | vscode.TextDocument,
): Promise<void> {
    const document = docOrUri instanceof vscode.Uri
        ? await vscode.workspace.openTextDocument(docOrUri)
        : docOrUri;
    if (document.languageId !== "asn1") {
        return;
    }
    const p = await getParserOutputs(document, "lexing");
    if (!p.lexicalTokens || "err" in p.lexicalTokens) {
        log.appendLine(`malformed asn.1 file ${document.uri} could not be indexed: ${p.lexicalTokens?.err ?? "<unknown lexing error>"}`);
        return;
    }
    const text = document.getText();
    const tokens = p.lexicalTokens.ok;
    indexNamedBitsAndIntegersFromTokenStream(tokens, text);
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

/**
 * @summary Index all ASN.1 files
 * @returns A promise that resolves to nothing
 * @async
 * @function
 */
export async function indexAsn1Files(): Promise<void> {
    const uris = await getAsn1Files();
    for (const uri of uris) {
        // To give other extensions a chance to run.
        await new Promise(resolve => setImmediate(resolve));
        await indexAsn1File(uri);
    }
    log.appendLine(`${new Date()}: total of ${uris.length} asn.1 files indexed`);
}

/**
 * @summary Iterate over file URIs that contain a given module name
 * @param modname The module name sought
 * @yields File URIs that contain the module name
 */
export
function* getFilesContainingModule(
    modname: string,
): IterableIterator<vscode.Uri, void> {
    const files = modulesToFiles.get(modname);
    if (!files) {
        return;
    }
    for (const uristr of files.keys()) {
        try {
            yield vscode.Uri.parse(uristr, true);
        } catch (e) {
            log.appendLine(`malformed document uri ${uristr}: ${e}`);
            continue;
        }
    }
}

/**
 * @summary Fallibly find all references to a symbol
 * @description
 * 
 * This function's name includes "fallibly" to clarify that it naïvely returns
 * all files that contain modules that _could_ import that symbol, but some
 * of these can be false positives, generally by the imported module object
 * identifiers not matching. The caller will have to check this.
 * 
 * @param modname Name of the module from whence the `identifier` was defined
 * @param identifier The identifier sought
 * @yields File URIs (as strings) of files in which the symbol might appear
 */
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

/**
 * @summary Fallibly find all references to a module by name
 * @description
 * 
 * This function's name includes "fallibly" to clarify that it naïvely returns
 * all files that contain modules that _could_ import that module, but some
 * of these can be false positives, generally by the imported module object
 * identifiers not matching. The caller will have to check this.
 * 
 * @param modname Name of the module sought
 * @yields File URIs (as strings) of files in which the module might appear
 */
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

/**
 * @summary Re-index an ASN.1 file
 * @description
 * 
 * This is intended to be called on ASN.1 file changes.
 * 
 * @param uri The URI of the file to be re-indexed
 * @returns A Promise that resolves to nothing
 * @async
 * @function
 */
export
async function reindexAsn1File(uri: vscode.Uri): Promise<void> {
    deindexAsn1File(uri);
    await indexAsn1File(uri);
    log.appendLine(`${new Date()}: asn.1 file ${uri} reindexed`);
}

/**
 * @summary De-index an ASN.1 file
 * @description
 * 
 * This is intended by to called on ASN.1 file deletion.
 * 
 * @param uri The URI of the file to be de-indexed
 * @function
 */
export function deindexAsn1File(uri: vscode.Uri): void {
    const uristr = uri.toString();
    const modules = filesToModules.get(uristr);
    if (modules) {
        // For every module in the file, remove the file from the reverse
        // lookup inde.
        for (const mod of modules.item.values()) {
            const files = modulesToFiles.get(mod.name);
            if (files) {
                files.delete(uristr);
            }
        }
    }
    // Remove the file from the forward lookup index.
    filesToModules.delete(uristr);
}

/**
 * @summary Clear all ASN.1 module indexes used by this extension
 * @description
 * 
 * This is intended to be called upon deactivating the extension.
 * 
 * @function
 */
export
function clearAsn1ModuleIndexes(): void {
    filesToModules.clear();
    modulesToFiles.clear();
}
