import * as vscode from 'vscode';
import type { NameAndOrNumber } from '@wildboar/asn1-parser';
import {
    asn1ModuleMatch,
    getDefinedThingAtPosition,
    getOidNodesFromModuleIdentifier,
    getRangeFromLocation,
    positionFallsWithin,
} from "./utils.js";
import { getParserOutputs } from './parsing.js';
import { findAllReferencesFallibly } from "./indexing.js";
import { log } from "./logging.js";
import { LexedTokens } from './types.js';
import { resolveAssignedIdentifier } from "./resolve.js";

// TODO: You need another implementation that finds all references of imported modules too.

const ignoredTokenTypes: Set<string> = new Set([
    "newlineWhitespace",
    "nonNewlineWhitespace",
    "comment",
]);

const moduleReferenceTokens: Set<string> = new Set([
    "objectclassreference",
    "modulereference",
    "typereference",
]);

function startsWithCapitalLetter(s: string): boolean {
    return (s.slice(0, 1).toUpperCase() === s.slice(0, 1));
}

enum DefinedThingParsingState {
    module,
    period,
    identifier,
}

async function getReferencesWithinModule(
    document: vscode.TextDocument,
    modref: string,
    ident: string,
    tokens: LexedTokens,
): Promise<[vscode.Location[], number]> { // Last element is tokens read
    // iterate over lexed tokens.
    // ignore ones that fall before or after the module. (maybe the caller should just slice tokens)
    // for any token that looks like the ident or the module identifier, try to parse the Defined, ignoring comments and whitespace
    // I don't think that string can possibly appear in any other situation.
    // break if you encounter END and return the number of tokens read.
    const text = document.getText();
    const identTokenType: string = (ident.toUpperCase() === ident)
        ? "objectclassreference"
        : (startsWithCapitalLetter(ident)
            ? "typereference"
            : "identifier");

    // TODO: Skip over all tokens until you encounter BEGIN

    // let inAssignmentBody: boolean = false;
    let state: DefinedThingParsingState = DefinedThingParsingState.module;
    const locations: vscode.Location[] = [];
    let endIndex: number | undefined;
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (ignoredTokenTypes.has(token.type)) {
            continue;
        }

        if (
            state !== DefinedThingParsingState.period
            && token.type === identTokenType
        ) {
            const loc = token.location;
            const tokenText = text.slice(loc.startIndex, loc.endIndex);
            // Even if the identifier does not match, we have to reset the state.
            state = DefinedThingParsingState.module;
            if (tokenText === ident) {
                const range = getRangeFromLocation(document, loc);
                locations.push(new vscode.Location(document.uri, range));
                continue;
            }
        }

        if (
            state === DefinedThingParsingState.module
            && moduleReferenceTokens.has(token.type)
        ) {
            const loc = token.location;
            const tokenText = text.slice(loc.startIndex, loc.endIndex);
            if (tokenText === modref) {
                state = DefinedThingParsingState.period;
                continue;
            }
        }

        if (state === DefinedThingParsingState.period) {
            /* Without this condition, if you encounter the module name in the
            imports, the parser waits for a period to occur next. */
            if (token.type === "FROM" || token.type === "comma") {
                state = DefinedThingParsingState.module;
                continue;
            }
            if (token.type === "period") {
                state = DefinedThingParsingState.identifier;
                continue;
            }
        }

        if (token.type === "END") {
            endIndex = i + 1;
            break;
        }
    }

    return [locations, endIndex ?? tokens.length];
}

async function getReferencesWithinFile(
    docuri: vscode.Uri,
    modref: string,
    ident: string,
    modoid?: NameAndOrNumber[],
): Promise<vscode.Location[]> {
    const doc = await vscode.workspace.openTextDocument(docuri);
    const text = doc.getText();
    const p = await getParserOutputs(docuri);
    if (
        !p.parserEndState
        || ("err" in p.parserEndState)
        || p.parserEndState.ok.error
        || (Object.keys(p.parserEndState.ok.syntaxErrors ?? {}).length > 0)
        || !p.parsedModules
        || ("err" in p.parsedModules)
        || !p.lexicalTokens
        || ("err" in p.lexicalTokens)
    ) {
        // TODO: Everywhere you do this, do better logging of the errors.
        return Promise.reject(null);
    }
    const cstModules = p.parserEndState.ok.cst.children
        .find((c) => c.type === 'modules')
        ?.children.filter((c) => c.type === 'ModuleDefinition')
        ?? [];
    const modules = p.parsedModules.ok;
    const tokens = p.lexicalTokens.ok;
    if (cstModules.length !== modules.length) {
        // TODO: Log
        return [];
    }
    const modoidarcs = modoid ? getOidNodesFromModuleIdentifier(modoid) : undefined;
    const ret: vscode.Location[] = [];
    const len = modules.length;
    let j = 0;
    for (let i = 0; i < len; i++) {
        const mod = modules[i];
        const cst = cstModules[i];

        const sfm = mod.imports.modules[modref];
        if (!sfm || !(ident in sfm.symbolList)) {
            // The module or the symbol was not imported.
            continue; // Try the next module.
        }
        if (modoidarcs && sfm.assignedIdentifier) {
            const impoid = await resolveAssignedIdentifier(
                sfm.assignedIdentifier,
                mod,
                docuri,
            );
            if (!impoid) {
                continue; // Skip: could not resolve assigned identifier.
            }
            const impoidarcs = getOidNodesFromModuleIdentifier(impoid);
            if (!impoidarcs) {
                continue;
            }
            if (!asn1ModuleMatch(modoidarcs, impoidarcs, sfm.selectionOption)) {
                continue; // Not a matching module.
            }
        }

        const moduleTokens = tokens.slice(j);
        const [ locs, tokensRead ] = await getReferencesWithinModule(doc, modref, ident, moduleTokens);
        j += tokensRead;
        ret.push(...locs);
    }
    return ret;
}

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
    const cst = p.parserEndState.ok.cst;
    const modules = p.parsedModules.ok;
    const defined = getDefinedThingAtPosition(document, position, cst);
    if (!defined) {
        // FIXME: This isn't right actually: it could be an identifier in an assignment, too.
        // What the user clicked on was not a `Defined*` production.
        return Promise.reject(null);
    }
    let [ modref, ident, prod ] = defined;

    // TODO: Copied from elsewhere. Refactor.
    const parseModules = cst.children
        .find((c) => c.type === 'modules')
        ?.children.filter((c) => c.type === 'ModuleDefinition')
        ?? [];
    if (modules.length !== parseModules.length) {
        return Promise.reject(null);
    }
    const parseModuleSelectedIdx = parseModules
        .findIndex((mod) => positionFallsWithin(document, position, mod));
    if (parseModuleSelectedIdx === -1) {
        return Promise.reject(null);
    }
    const currentModule = modules[parseModuleSelectedIdx];
    if (!currentModule) {
        // TODO: Replace with a proper diagnostic error.
        log.appendLine(`assertion failure: no module with index ${parseModuleSelectedIdx}`);
        return Promise.reject(null);
    }

    let modoid: NameAndOrNumber[] | undefined;
    if (ident in currentModule.assignments) {
        modref ??= currentModule.name;
        modoid = currentModule.oid;
    }
        // ?? Object.entries(currentModule.imports.modules)
            // .find(([impmod, sfm]) => ident in sfm.symbolList)
            // ?.[1].identifier;

    // FIXME: Error if the ident is imported and WITH SUCCESSORS or WITH DESCENDANTS is used
    // because the source of the ident could be many files. Suggest using Go to Definition
    // first to "pick" a module. (Maybe this could be forgiven if the module name is unique.)

    // const identIsImported = Object.entries(currentModule.imports.modules)
    //     .find(([_, sfm]) => ident in sfm.symbolList);
    // if (!mod && identIsImported) {

    // }
    if (!modref) {
        log.appendLine(`identifier ${ident} was not defined locally, nor imported; therefore, cannot be found`);
        return Promise.reject(null);
    }

    const ret: vscode.Location[] = [];
    const refuris = findAllReferencesFallibly(modref, ident);
    for (const refuri of refuris) {
        let docuri;
        try {
            docuri = vscode.Uri.parse(refuri, true);
        } catch (e) {
            log.appendLine(`malformed document uri ${refuri}: ${e}`);
            continue;
        }
        try {
            const locs = await getReferencesWithinFile(docuri, modref, ident);
            ret.push(...locs);
        } catch (e) {
            log.appendLine(`failed to get references within file ${refuri}: ${e}`);
            continue;
        }
    }
    return ret;
}

export class Asn1ReferenceProvider implements vscode.ReferenceProvider {
    public provideReferences(
        document: vscode.TextDocument, position: vscode.Position,
        options: { includeDeclaration: boolean }, token: vscode.CancellationToken):
        Thenable<vscode.Location[]> {
        return provideReferences(document, position, options, token);
    }
}
