import * as vscode from "vscode";
import { getParsedModules } from "./parsing.js";
import { getSymbolKindFromAssignment } from "./symbols.js";
import { getRangeFromLocation } from "./utils.js";

// This was written by ChatGPT.
/**
 * Returns true if every character of `query` appears in `symbol`
 * in the same order (not necessarily contiguously).
 *
 * Assumes both strings have already been lowercased.
 */
export function fuzzyMatch(query: string, symbol: string) {
    let q = 0;

    for (let s = 0; s < symbol.length && q < query.length; s++) {
        if (symbol[s] === query[q]) {
            q++;
        }
    }

    return q === query.length;
}

async function provideWorkspaceSymbols(
    query: string,
    token: vscode.CancellationToken,
): Promise<vscode.SymbolInformation[]> {
    const q = query.toLowerCase();
    const results: vscode.SymbolInformation[] = [];
    for (const [uri, mods] of getParsedModules()) {
        if (token.isCancellationRequested) {
            return results;
        }
        let document: vscode.TextDocument | undefined;
        for (const mod of mods) {
            if (token.isCancellationRequested) {
                return results;
            }
            for (const assn of Object.values(mod.assignments)) {
                if (token.isCancellationRequested) {
                    return results;
                }
                if (!assn.production) {
                    continue;
                }
                if (!fuzzyMatch(q, assn.identifier.toLowerCase())) {
                    continue;
                }
                try {
                    document ??= await vscode.workspace.openTextDocument(uri);
                    const range = getRangeFromLocation(document, assn.production.location);
                    const result = new vscode.SymbolInformation(
                        assn.identifier,
                        getSymbolKindFromAssignment(assn.assignmentType),
                        mod.name,
                        new vscode.Location(uri, range),
                    );
                    results.push(result);
                } catch {
                    continue;
                }
            }
        }
    }
    return results;
}

export class Asn1WorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {

    // Not useful for this implementation.
    // resolveWorkspaceSymbol(
    //     symbol: vscode.SymbolInformation,
    //     token: vscode.CancellationToken,
    // ): vscode.ProviderResult<vscode.SymbolInformation> {}

    provideWorkspaceSymbols(
        query: string,
        token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.SymbolInformation[]> {
        return provideWorkspaceSymbols(query, token);
    }
}
