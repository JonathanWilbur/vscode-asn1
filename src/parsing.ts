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

type YieldType<T> =
	T extends IterableIterator<infer Y> ? Y : never;

// Inspired by Rust
export type Result<T, E = unknown> =
    { ok: T }
    | { err: E };

export interface ParserOutputs {
    // TODO: Change this to a different type signature when you fix the missing export
    lexicalTokens?: Result<YieldType<ReturnType<typeof lex>>[]>,
    parserEndState?: Result<ParseContext>,
    parsedModules?: Result<Module[]>,
}

export interface VersionNumbered<T> {
    readonly version: number;
    readonly item: T;
}

const cache = new Map<string, VersionNumbered<ParserOutputs>>();

export function getParserOutputs(document: vscode.TextDocument): ParserOutputs {
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
