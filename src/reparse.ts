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

/**
 * @summary Try to re-parse an ASN.1 value as something else
 * @description
 * 
 * Due to shortcomings of `@wildboar/asn1-parser` as well as the ASN.1 language
 * itself, some value grammars are identical to the grammars of others.
 * This function exists so you can attempt to re-parse a value of one type as a
 * value of another if you think the value type you have is wrong.
 * 
 * @param value The ASN.1 value to be re-parsed
 * @param parser The `Parser` (from `@wildboar/asn1-parser` to use)
 * @param groker The "groking" function that converts the resulting
 *  Concrete Syntax Tree (CST) from parsing into the thing of type `T`
 * @returns The thing of type `T`, or `null` if there were errors
 *  when parsing it.
 * @function
 */
export
function maybeReparse<T>(
    value: Value,
    parser: Parser,
    groker: (cst: Production, ctx: GrokContext) => T,
): T | null {
    log.appendLine(`reparsing value of type ${value.valueType}`);
    if (!value.production?.location || !value.text) {
        return null;
    }
    const startoffset = value.production.location.startIndex;
    const startline = value.production.location.lineNumber;
    const text = value.text;
    try {
        const lexicalTokens = Array.from(lex(text, value.production.location));
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
        ctx.textStartsAtOffset = startoffset;
        const v = groker(pr.cst, ctx);
        return v;
    } catch {
        return null;
    }
}
