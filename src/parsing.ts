import * as vscode from 'vscode';
import {
	lex,
	parse,
	grok,
	correct,
	type Module,
    type ParseContext,
    type Production,
    type TerminalProductionType,
} from '@wildboar/asn1-parser';
import type {
    FileURIStr,
    Result,
    VersionNumbered,
    VersionNumber,
} from "./types.js";
import { log } from "./logging.js";

/**
 * The stage of parsing to stop at. This is used when subsequent stages are
 * not needed.
 */
export type ParserStopAt =
    | "lexing"
    | "parsing"
    ;

export interface ParserOutputs {
    /**
     * The lexical tokens of the file, an error if lexing failed, or will
     * be unset if explicitly unwanted.
     */
    lexicalTokens?: Result<Production<TerminalProductionType>[], Error>,
    /**
     * The ending parser state of the file, an error if lexing failed, or will
     * be unset if explicitly unwanted.
     * 
     * This contains, among other things, the Concrete Syntax Tree (CST) for
     * the file.
     */
    parserEndState?: Result<ParseContext, Error>,
    /**
     * The parsed modules of the file, which together constitute an Abstract
     * Syntax Tree (AST) for the file, or an error if lexing failed, or will
     * be unset if explicitly unwanted.
     */
    parsedModules?: Result<Module[], Error>,
}

export interface ParsingSuccess {
    /**
     * The lexical tokens of the file.
     */
    lexicalTokens: Production<TerminalProductionType>[],
    /**
     * The ending parser state of the file.
     * 
     * This contains, among other things, the Concrete Syntax Tree (CST) for
     * the file.
     */
    parserEndState: ParseContext,
    /**
     * The parsed modules of the file, which together constitute an Abstract
     * Syntax Tree (AST) for the file.
     */
    parsedModules: Module[],
}

/**
 * Cache of the parser outputs of the last parsing of a document by the
 * file URI string.
 */
const cache = new Map<FileURIStr, VersionNumbered<ParserOutputs>>();

/**
 * Cache of the parser outputs of the last valid parsing of a document by the
 * file URI string.
 */
const lastValidCache = new Map<FileURIStr, ParserOutputs>();

/**
 * @summary Iterate over successfully parsed modules
 * @generator
 * @function
 * @yields A tuple of the file URI and all the ASN.1 modules within it
 */
export function* getParsedModules(): IterableIterator<[vscode.Uri, Module[]]> {
    for (const [uristr, { item }] of cache.entries()) {
        if (!item.parsedModules || ("err" in item.parsedModules)) {
            continue;
        }
        const modules = item.parsedModules.ok;
        try {
            const uri = vscode.Uri.parse(uristr, true);
            yield [uri, modules];
        } catch {
            continue;
        }
    }
}

/**
 * @summary Convert something to an error
 * @description
 * 
 * This just exists for type safety: if something we expect to be an error is
 * not, we try to convert it to one.
 * 
 * @param e Something to be turned into an erro
 * @returns An error
 * @function
 */
function coerceToError(e: unknown): Error {
    if (e instanceof Error) {
        return e;
    }
    return new Error(String(e));
}

/**
 * @summary Get parser outputs for a given document
 * @description
 * 
 * This function returns parser outputs for a given document at a given point
 * in time (determined by the version number) from a cache, or performs the
 * parsing and caches the result.
 * 
 * @param docOrUri The text document or its URI
 * @param stopAt The stage of parsing to stop at
 * @param cancel The cancellation token
 * @returns A promise that resolves to the parser outputs
 * @async
 * @function
 */
export async function getParserOutputs(
    docOrUri: vscode.Uri | vscode.TextDocument,
    stopAt?: ParserStopAt,
    cancel?: vscode.CancellationToken,
): Promise<ParserOutputs> {
    /* I confirmed: openTextDocument does not open a tab or something in the
    user interface--it just opens a file for use by the extension. It also
    clearly says in the JSDoc for it that it immediately returns if the file
    is already open. */
    const document = docOrUri instanceof vscode.Uri
        ? await vscode.workspace.openTextDocument(docOrUri)
        : docOrUri;
    const key = document.uri.toString();
    const cached = cache.get(key);
    if (cached && cached.version === document.version) {
        return cached.item;
    }

    const text = document.getText();
    const outputs: ParserOutputs = {};

    // Lex: obtain a stream of lexical tokens
    try {
        const lexicalTokens = Array.from(lex(text));
        outputs.lexicalTokens = { ok: lexicalTokens };
    } catch (e) {
        outputs.lexicalTokens = { err: coerceToError(e) };
        cache.set(key, { version: document.version, item: outputs });
        return outputs;
    }

    if (stopAt === "lexing" || cancel?.isCancellationRequested) {
        return outputs;
    }

    // Parse: obtain a hierarchical Concrete Syntax Tree (CST)
    try {
        outputs.parserEndState = { ok: parse(text, outputs.lexicalTokens.ok) };
    } catch (e) {
        outputs.parserEndState = { err: coerceToError(e) };
        cache.set(key, { version: document.version, item: outputs });
        return outputs;
    }

    // Sorry, it's kind of a two-part process determining if there was a parser error.
    const parserState = outputs.parserEndState.ok;
    if (
        parserState.error
        || (Object.keys(parserState.syntaxErrors).length > 0)
    ) {
        cache.set(key, { version: document.version, item: outputs });
        return outputs;
    }

    if (stopAt === "parsing" || cancel?.isCancellationRequested) {
        return outputs;
    }

    // Grok: convert the Concrete Syntax Tree (CST) into abstract modules
    try {
        const modules = grok(text, outputs.parserEndState.ok);
        // TODO: Should you use setImmediate or something to yield to the scheduler?
        if (cancel?.isCancellationRequested) {
            return outputs;
        }
        correct(modules);
        outputs.parsedModules = { ok: modules };
    } catch (e) {
        outputs.parsedModules = { err: coerceToError(e) };
        cache.set(key, { version: document.version, item: outputs });
        return outputs;
    }

    cache.set(key, { version: document.version, item: outputs });
    lastValidCache.set(key, outputs);
    return outputs;
}

/**
 * @summary Get parser outputs successfully, or log errors
 * @param docOrUri The text document or its URI
 * @param cancel The cancellation token
 * @returns Parser outputs, or `null` if parsing failed
 * @async
 * @function
 */
export async function getParserOutputsWithLogging(
    docOrUri: vscode.Uri | vscode.TextDocument,
    cancel?: vscode.CancellationToken,
): Promise<ParsingSuccess | null> {
    const p = await getParserOutputs(docOrUri, undefined, cancel);
    if (
        !p.lexicalTokens
        || ("err" in p.lexicalTokens)
        || !p.parserEndState
        || ("err" in p.parserEndState)
        || p.parserEndState.ok.error
        || (Object.keys(p.parserEndState.ok.syntaxErrors ?? {}).length > 0)
        || !p.parsedModules
        || ("err" in p.parsedModules)
    ) {
        const e =
            ((p.lexicalTokens && ("err" in p.lexicalTokens))
                ? p.lexicalTokens.err
                : undefined)
            ?? ((p.parserEndState && ("err" in p.parserEndState))
                ? p.parserEndState.err
                : undefined)
            ?? ((p.parsedModules && ("err" in p.parsedModules))
                ? p.parsedModules.err
                : undefined)
            ;
        log.appendLine(`the current module seems to be malformed: ${e}`);
        if (e?.stack) {
            log.appendLine(e.stack);
        }
        return Promise.reject(null);
    }
    return {
        lexicalTokens: p.lexicalTokens.ok,
        parserEndState: p.parserEndState.ok,
        parsedModules: p.parsedModules.ok,
    };
}

/**
 * @summary Get the last valid parser outputs for this module
 * @description
 * 
 * As a user types, the ASN.1 file could temporarily be invalid, but for the
 * purposes of completion suggestions (among possible other uses), we need
 * some idea of what symbols to suggest. The best idea is to suggest
 * productions from the last valid parsing of the file.
 * 
 * In the future, this could compare document versions to determine if the
 * last valid version is too old, or perhaps compare sizes to determine if
 * they are too different.
 * 
 * @param docOrUri The text document or its URI
 * @returns Parser outputs, or `undefined` if never parsed or never valid
 * @function
 */
export function getLastValidParserOutputs(
    docOrUri: vscode.Uri | vscode.TextDocument,
): ParserOutputs | undefined {
    const uri = docOrUri instanceof vscode.Uri
        ? docOrUri
        : docOrUri.uri;
    const key = uri.toString();
    return lastValidCache.get(key);
}

/**
 * @summary Clear parser output caches
 * @description
 * 
 * This is intended to be called upon deactivation of this extension.
 * 
 * @function
 */
export function clearParserOutputCaches(): void {
    cache.clear();
    lastValidCache.clear();
}

/**
 * @summary VS Code command to get the most recently parsed document version.
 * @param uri Uniform Resource Identifier
 * @returns The most recently parsed document version, valid or not.
 * @function
 */
export function get_last_parsed_doc_version_cmd(
    uri: vscode.Uri,
): VersionNumber | undefined {
    return cache.get(uri.toString())?.version;
}
