import * as vscode from "vscode";
import type { Location } from "@wildboar/asn1-parser";
import { getParserOutputs } from "./parsing.js";
import { getRangeFromLocation } from "./utils.js";

function foldingRangeFromLocation(
    document: vscode.TextDocument,
    loc: Location,
): vscode.FoldingRange | null {
    const range = getRangeFromLocation(document, loc);
    if (range.start.line >= range.end.line) {
        return null;
    }
    return new vscode.FoldingRange(range.start.line, range.end.line);
}

async function provideFoldingRanges(
    document: vscode.TextDocument,
    _context: vscode.FoldingContext,
    token: vscode.CancellationToken,
): Promise<vscode.FoldingRange[]> {
    const p = await getParserOutputs(document.uri, undefined, token);
    if (
        !p.parserEndState
        || ("err" in p.parserEndState)
        || p.parserEndState.ok.error
        || (Object.keys(p.parserEndState.ok.syntaxErrors ?? {}).length > 0)
        || !p.parsedModules
        || ("err" in p.parsedModules)
    ) {
        return [];
    }
    const modules = p.parsedModules.ok;
    const cst = p.parserEndState.ok.cst;
    const parseModules = cst.children
        .find((c) => c.type === 'modules')
        ?.children.filter((c) => c.type === 'ModuleDefinition')
        ?? [];
    if (modules.length !== parseModules.length) {
        return [];
    }
    const ranges: vscode.FoldingRange[] = [];
    for (const [i, module] of modules.entries()) {
        if (token.isCancellationRequested) {
            break;
        }
        const moduleRange = foldingRangeFromLocation(
            document,
            parseModules[i].location,
        );
        if (moduleRange) {
            ranges.push(moduleRange);
        }
        for (const ass of Object.values(module.assignments)) {
            if (token.isCancellationRequested) {
                break;
            }
            if (!ass.production) {
                continue;
            }
            const assRange = foldingRangeFromLocation(
                document,
                ass.production.location,
            );
            if (assRange) {
                ranges.push(assRange);
            }
        }
    }
    return ranges;
}

export class Asn1FoldingRangeProvider implements vscode.FoldingRangeProvider {
    provideFoldingRanges(
        document: vscode.TextDocument,
        context: vscode.FoldingContext,
        token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.FoldingRange[]> {
        return provideFoldingRanges(document, context, token);
    }
}
