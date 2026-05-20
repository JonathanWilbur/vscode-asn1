import * as vscode from 'vscode';
import {
	lex,
	parse,
	grok,
	correct,
	type Module,
	TaggingMode,
	Production,
	Assignment,
	type Location,
	AssignmentType,
	type NameAndOrNumber,
    // type TerminalProductionType,
    type ParseContext,
} from '@wildboar/asn1-parser';
import type { YieldType, Result, VersionNumbered } from "./types.js";

export enum ParserStopAt {
    lexing = 1,
    parsing = 2,
}

export interface ParserOutputs {
    // TODO: Change this to a different type signature when you fix the missing export
    lexicalTokens?: Result<YieldType<ReturnType<typeof lex>>[]>,
    parserEndState?: Result<ParseContext>,
    parsedModules?: Result<Module[]>,
}

const cache = new Map<string, VersionNumbered<ParserOutputs>>();

export async function getParserOutputs(docOrUri: vscode.Uri | vscode.TextDocument, stopAt?: ParserStopAt): Promise<ParserOutputs> {
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
        outputs.lexicalTokens = { ok: Array.from(lex(text)) };
    } catch (e) {
        outputs.lexicalTokens = { err: e };
        cache.set(key, { version: document.version, item: outputs });
        return outputs;
    }

    if (stopAt === ParserStopAt.lexing) {
        // TODO: Cache this work.
        return outputs;
    }

    // Parse: obtain a hierarchical Concrete Syntax Tree (CST)
    try {
        outputs.parserEndState = { ok: parse(text, outputs.lexicalTokens.ok) };
    } catch (e) {
        outputs.parserEndState = { err: e };
        cache.set(key, { version: document.version, item: outputs });
        return outputs;
    }

    // Grok: convert the Concrete Syntax Tree (CST) into abstract modules
    try {
        const modules = grok(text, outputs.parserEndState.ok);
        correct(modules);
        outputs.parsedModules = { ok: modules };
    } catch (e) {
        outputs.parsedModules = { err: e };
        cache.set(key, { version: document.version, item: outputs });
        return outputs;
    }

    cache.set(key, { version: document.version, item: outputs });
    return outputs;
}
