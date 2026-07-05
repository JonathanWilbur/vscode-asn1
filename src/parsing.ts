import * as vscode from 'vscode';
import {
	lex,
	parse,
	grok,
	correct,
	type Module,
    type ParseContext,
} from '@wildboar/asn1-parser';
import type { YieldType, Result, VersionNumbered } from "./types.js";
import { log } from "./logging.js";

export type ParserStopAt =
    | "lexing"
    | "parsing"
    ;

export interface ParserOutputs {
    // TODO: Change this to a different type signature when you fix the missing export
    lexicalTokens?: Result<YieldType<ReturnType<typeof lex>>[], Error>,
    parserEndState?: Result<ParseContext, Error>,
    parsedModules?: Result<Module[], Error>,
}

export interface ParsingSuccess {
    lexicalTokens: YieldType<ReturnType<typeof lex>>[],
    parserEndState: ParseContext,
    parsedModules: Module[],
}

const cache = new Map<string, VersionNumbered<ParserOutputs>>();

const lastValidCache = new Map<string, ParserOutputs>();

/**
 * Iterates over all files that parsed successfully.
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

function coerceToError(e: unknown): Error {
    if (e instanceof Error) {
        return e;
    }
    return new Error(String(e));
}

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

    if (stopAt === "parsing" || cancel?.isCancellationRequested) {
        return outputs;
    }

    // Grok: convert the Concrete Syntax Tree (CST) into abstract modules
    try {
        const modules = grok(text, outputs.parserEndState.ok);
        correct(modules);
        outputs.parsedModules = { ok: modules };
    } catch (e) {
        outputs.parsedModules = { err: coerceToError(e) };
        cache.set(key, { version: document.version, item: outputs });
        return outputs;
    }

    cache.set(key, { version: document.version, item: outputs });
    if (
        !outputs.parserEndState.ok.error
        && (Object.keys(outputs.parserEndState.ok.syntaxErrors).length === 0)
    ) {
        lastValidCache.set(key, outputs);
    }
    return outputs;
}

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
        return Promise.reject(null);
    }
    return {
        lexicalTokens: p.lexicalTokens.ok,
        parserEndState: p.parserEndState.ok,
        parsedModules: p.parsedModules.ok,
    };
}

export function getLastValidParserOutputs(
    docOrUri: vscode.Uri | vscode.TextDocument,
): ParserOutputs | undefined {
    const uri = docOrUri instanceof vscode.Uri
        ? docOrUri
        : docOrUri.uri;
    const key = uri.toString();
    return lastValidCache.get(key);
}

export function clearParserOutputCaches(): void {
    cache.clear();
    lastValidCache.clear();
}
