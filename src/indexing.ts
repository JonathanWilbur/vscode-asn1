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
import { getParserOutputs, ParserStopAt } from './parsing.js';
import { setImmediate } from "node:timers";
import { log } from "./logging.js";

/*

13.12
When the referenced module has a non-empty "DefinitiveIdentification", the "GlobalModuleReference"
referencing that module shall not have an empty "AssignedIdentifier".

Therefore, if the import uses only the module name, the first string should be the module name.
If the import uses the OID alone, the first string will be the OID alone.
If the import uses the OID WITH SUCCESSORS, the first string will be that OID with the last arc replaced with an asterisk.
If the import uses the OID WITH DESCENDANTS, the first string will be that OID with the a ".$" appended.

When searching for all references:
If the current module has no OID, only search for the modulename:identifier.
If the current module has an OID, search for:
- OID:identifier
- OID with the last arc replaced with *:identifier
- OID with the ".$" appended:identifier

Actually, one problem with this is that you might not have the module that has the OID definitions.

Remember, that the `DefinedValue` could point to an OID that uses a prefix, so
the OID resolution would have to be be recursive, if you accept this.

Actually, it looks like the X.500 specifications (at least) have deprecated the use of `DefinedValue`
for an imported module's identifier. I think this syntax is rarely in use. Further, I think if it is
used, you can simply use the module name alone and give the user a pop-up warning.

This means that you do not need to pre-parse every file: you might be able to search for raw text
in files, then only parse those on demand. I have to see if there is more stuff I need pre-indexing for.

So the process looks like this, when a user clicks "Find all references":
1. Search for the imported module's name + the symbol.
2. Parse all of those files alone. (You can cache the results, too.)
3. Filter the ones that do not match the module OID or the import selection option.
   Do not do this if the import's object identifier was not self-contained.
4. If the import statement's object identifier is not totally self-contained,
   issue a warning to the user that the object identifier was not used for filtering.

Note that you should gracefully handle the situation in ITU-T Rec. X.680, Section 13.9.a,
because that is an easy case.

*/

// TODO: Test this.
// TODO: This could be moved to @wildboar/asn1-parser
// TODO: Make this return a map of imports as well.
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
    const p = await getParserOutputs(document, ParserStopAt.lexing);
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
