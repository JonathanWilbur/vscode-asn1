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

    let pastBegin: boolean = false;
    let state: DefinedThingParsingState = DefinedThingParsingState.module;
    const locations: vscode.Location[] = [];
    let endIndex: number | undefined;
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (ignoredTokenTypes.has(token.type)) {
            continue;
        }
        /* There is nowhere in which a reference can occur before the
        `ModuleBody`, so we skip over everything until we reach BEGIN.
        This is just a small performance enhancement. */
        if (!pastBegin) {
            if (token.type === "BEGIN") {
                pastBegin = true;
            }
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
    const p = await getParserOutputs(docuri);
    if (
        !p.parsedModules
        || ("err" in p.parsedModules)
        || !p.lexicalTokens
        || ("err" in p.lexicalTokens)
    ) {
        // TODO: Everywhere you do this, do better logging of the errors.
        return Promise.reject(null);
    }
    const modules = p.parsedModules.ok;
    const tokens = p.lexicalTokens.ok;
    const modoidarcs = modoid ? getOidNodesFromModuleIdentifier(modoid) : undefined;
    const ret: vscode.Location[] = [];
    const len = modules.length;
    let j = 0;
    for (let i = 0; i < len; i++) {
        const mod = modules[i];
        const sfm = mod.imports.modules[modref];
        if (!sfm || !(ident in sfm.symbolList)) {
            log.appendLine(`module with index ${i} did not seem to import ${ident} within file ${docuri}`);
            continue; // Try the next module.
        }
        if (modoidarcs && sfm.assignedIdentifier) {
            const impoid = await resolveAssignedIdentifier(
                sfm.assignedIdentifier,
                mod,
                docuri,
            );
            if (!impoid) {
                log.appendLine(`could not resolve assigned identifier for module ${mod.name} in ${docuri}`);
                continue; // Skip: could not resolve assigned identifier.
            }
            // TODO: Make it configurable whether or not this check happens.
            const impoidarcs = getOidNodesFromModuleIdentifier(impoid);
            if (!impoidarcs) {
                continue;
            }
            if (!asn1ModuleMatch(modoidarcs, impoidarcs, sfm.selectionOption)) {
                log.appendLine(`non-matching oid used in import statement in module ${mod.name} in ${docuri}`);
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

/**
 * @summary Provide references of an ASN.1 identifier assignment (not a module name)
 * @description
 * 
 * This is named to distinguish it from `provideReferencesForModuleName`. Every
 * reference returned from this is only the identifier, even if prefixed by a
 * module name to become an "external reference" (fully-qualified reference).
 * 
 * @param document The text document
 * @param position The position within the text document where the user invoked
 *  "find all references" (and therefore what symbol is searched for).
 * @param options Options for providing references
 * @param token A cancellation token
 * @returns Locations, including in imports and in assignments, where this
 *  identifier is used.
 * 
 * @function
 */
export
async function provideReferencesForSymbol(
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
        log.appendLine(`defined thing not found at position ${position.line}:${position.character}`);
        return Promise.reject(null);
    }
    let [ modref, ident ] = defined;

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
        log.appendLine(`assertion failure: no module with index ${parseModuleSelectedIdx}`);
        return Promise.reject(null);
    }

    let modoid: NameAndOrNumber[] | undefined;
    if (!modref && (ident in currentModule.assignments)) {
        modref = currentModule.name;
        modoid = currentModule.oid;
    }

    if (!modref) {
        const sfm = Object.values(currentModule.imports.modules)
            .find((s) => ident in s.symbolList);
        if (typeof (sfm?.selectionOption) !== "undefined") {
            log.appendLine(`multiple modules found with name ${sfm.identifier}, therefore no assignment could be selected`);
            vscode.window.showErrorMessage(
                `Could not find a unique ASN.1 module with the name ${sfm.identifier}. `
                + `There are multiple files that have an ASN.1 module with this name in this workspace. `
                + "This means that we cannot identify one assignment for which to check for references. "
                + "Consider using 'Go to Defintion' to navigate to one somewhat arbitrarily,  "
                + "or navigate to the assignment you want manually and retry 'Find All References' there. "
                + "Alternatively, you could either remove `WITH SUCCESSORS` or `WITH DESCENDANTS` from "
                + "the import of that module within this file, so that it points to only one ASN.1 "
                + "module, or you could remove the 'competing' ASN.1 modules so that there is only "
                + "one with that name in this workspace."
            );
            return Promise.reject(null);
        }
        modref = sfm?.identifier;
        if (sfm?.assignedIdentifier) {
            modoid = await resolveAssignedIdentifier(
                sfm.assignedIdentifier,
                currentModule,
                document.uri,
            );
            if (modoid) {
                log.appendLine("resolved current module's oid");
            }
        }
    }


    if (!modref) {
        log.appendLine(`identifier ${ident} was not defined locally, nor imported; therefore, cannot be found`);
        return Promise.reject(null);
    }

    // FIXME: This is not returning the reference the user clicked on, when it is the assignment itself!
    // I confirmed that this is because `findAllReferencesFallibly()` only indexes imports.
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
            const locs = await getReferencesWithinFile(docuri, modref, ident, modoid);
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
        return provideReferencesForSymbol(document, position, options, token);
    }
}
