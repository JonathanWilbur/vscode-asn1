import {
    lex,
    type Value,
    type Parser,
    type GrokContext,
    Production,
    type ProductionType,
    createGrokContext,
    LogLevel,
} from "@wildboar/asn1-parser";
import { log } from "./logging.js";

export
function maybeReparse<T>(
    value: Value,
    parser: Parser,
    groker: (cst: Production, ctx: GrokContext) => T,
): T | null {
    log.appendLine(`reparsing value of type ${value.valueType}`);
    if (!value.production?.location) {
        return null;
    }
    const startoffset = value.production.location.startIndex;
    const startline = value.production.location.lineNumber;
    const text = value.text;
    try {
        // TODO: in @wildboar/asn1-parser, make lex() take a startloc?: Location parameter.
        const lexicalTokens = Array.from(lex(text));
        // Update the locations to accurately reflect where they are in the doc.
        // TODO: Remove this once lex() supports startloc
        for (const tok of lexicalTokens) {
            // Don't tell me I can't write to this value, asshole.
            (tok.location.startIndex as number) += startoffset;
            (tok.location.endIndex as number) += startoffset;
            (tok.location.lineNumber as number) += (startline - 1);
            // I am just going to accept the columnNumber being wrong.
        }
        const pr = parser.executor({
            log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, level: LogLevel.silent },
            tokens: lexicalTokens,
            index: 0,
            // FIXME: I don't know what is going on with the type here.
            cst: new Production("empty" as ProductionType, [], {
                startIndex: startoffset,
                endIndex: startoffset,
                lineNumber: startline,
                columnNumber: 1, // I am just going to accept the columnNumber being wrong.
            }),
            syntaxErrors: {},
            discoveredIdentifiers: new Map([]),
            callbackMap: new Map(),
            text,
            definedSyntaxTokens: new Set([]),
            definedEnumItems: new Set([]),
        });
        if (pr.error || Object.keys(pr.syntaxErrors).length > 0) {
            return null;
        }
        const ctx = createGrokContext(text);
        const v = groker(pr.cst, ctx);
        return v;
    } catch {
        return null;
    }
}
