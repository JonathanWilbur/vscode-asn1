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
    type SymbolsFromModule,
} from '@wildboar/asn1-parser';
import { drillIntoDefinedInCST } from "./utils.js";
import { getParserOutputs } from './parsing.js';

async function provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    options: { includeDeclaration: boolean },
    token: vscode.CancellationToken,
): Promise<vscode.Location[]> {
    // If the document is invalid ASN.1, all bets are off.
    const p = await getParserOutputs(document.uri);
    if (
        !p.parserEndState
        || ("err" in p.parserEndState)
        || p.parserEndState.ok.error
        || (Object.keys(p.parserEndState.ok.syntaxErrors ?? {}).length > 0)
        || !p.parsedModules
        || ("err" in p.parsedModules)
    ) {
        return Promise.reject(null);
    }
    const cst = p.parserEndState.ok.cst;
    const defined = drillIntoDefinedInCST(document, position, cst);
    if (!defined) {
        // FIXME: This isn't right actually: it could be an identifier in an assignment, too.
        // What the user clicked on was not a `Defined*` production.
        return Promise.reject(null);
    }

    // ... then again, you will have to implement recursive Defined* resolution anyway.

    // 1. Search for the imported module's name + the symbol.
    // 2. Parse all of those files alone. (You can cache the results, too.)
    // 3. Filter the ones that do not match the module OID or the import selection option.
    //    Do not do this if the import's object identifier was not self-contained.
    // 4. If the import statement's object identifier is not totally self-contained,
    //    issue a warning to the user that the object identifier was not used for filtering.

    // Note that you should gracefully handle the situation in ITU-T Rec. X.680, Section 13.9.a,
    // because that is an easy case.

    return Promise.reject(null);
}

export class Asn1ReferenceProvider implements vscode.ReferenceProvider {
    public provideReferences(
        document: vscode.TextDocument, position: vscode.Position,
        options: { includeDeclaration: boolean }, token: vscode.CancellationToken):
        Thenable<vscode.Location[]> {
        return provideReferences(document, position, options, token);
    }
}
