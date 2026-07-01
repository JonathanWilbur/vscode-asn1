import * as vscode from 'vscode';
import type { NameAndOrNumber, SelectionOption, SymbolsFromModule, Module } from '@wildboar/asn1-parser';
import {
    asn1ModuleMatch,
    getDefinedThingAtPosition,
    getOidNodesFromModuleIdentifier,
    getRangeFromLocation,
    positionFallsWithin,
    startsWithCapitalLetter,
    moduleReferenceTokens,
} from "./utils.js";
import { getParserOutputs } from './parsing.js';
import { findAllModuleReferencesFallibly, findAllReferencesFallibly, getFilesContainingModule } from "./indexing.js";
import { log } from "./logging.js";
import type {
    ASN1ModuleName,
    ASN1Reference,
    FileURIStr,
    LexedTokens,
} from './types.js';
import { resolveAssignedIdentifier } from "./resolve.js";

const ignoredTokenTypes: Set<string> = new Set([
    "newlineWhitespace",
    "nonNewlineWhitespace",
    "comment",
]);

type DefinedThingParsingState = 
    | "module"
    | "period"
    | "identifier"
    ;

/* NOTE: Even when searching for a reference that is supposedly defined in this file,
there is no need to skip over the imports, since the identifier could be re-exported
from another module. If an imported identifier is duplicated with one defined
locally, it is simply a defect. */
export
async function getReferencesWithinModule(
    cancel: vscode.CancellationToken,
    document: vscode.TextDocument,
    modref: string | undefined,
    ident: string,
    tokens: LexedTokens,
    skipModulesCount: number = 0,
    ignoreImportsExports: boolean = false,
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

    // Skip over these modules.
    let z: number = 0;
    while (skipModulesCount > 0 && z < tokens.length) {
        if (tokens[z++].type === "END") {
            skipModulesCount--;
        }
    }

    let pastBegin: boolean = false;
    let ignoreUntilSemicolon: boolean = false;
    let state: DefinedThingParsingState = "module";
    const locations: vscode.Location[] = [];
    let endIndex: number | undefined;
    for (let i = z; i < tokens.length; i++) {
        if (cancel.isCancellationRequested) {
            break;
        }
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

        if (token.type === "END") {
            endIndex = i + 1;
            break;
        }
        
        if (ignoreUntilSemicolon) {
            if (token.type === "semiColon") {
                ignoreUntilSemicolon = false;
            }
            continue;
        }

        if (
            ignoreImportsExports
            && (
                (token.type === "IMPORTS")
                || (token.type === "EXPORTS")
            )
        ) {
            ignoreUntilSemicolon = true;
            continue;
        }

        if (
            state !== "period"
            && token.type === identTokenType
        ) {
            const loc = token.location;
            const tokenText = text.slice(loc.startIndex, loc.endIndex);
            // Even if the identifier does not match, we have to reset the state.
            state = "module";
            if (tokenText === ident) {
                const range = getRangeFromLocation(document, loc);
                locations.push(new vscode.Location(document.uri, range));
                continue;
            }
        }

        if (
            state === "module"
            && moduleReferenceTokens.has(token.type)
        ) {
            const loc = token.location;
            const tokenText = text.slice(loc.startIndex, loc.endIndex);
            if (modref && (tokenText === modref)) {
                state = "period";
                continue;
            }
        }

        if (state === "period") {
            /* Without this condition, if you encounter the module name in the
            imports, the parser waits for a period to occur next. */
            if (token.type === "FROM" || token.type === "comma") {
                state = "module";
                continue;
            }
            if (token.type === "period") {
                state = "identifier";
                continue;
            }
        }
    }

    return [locations, endIndex ?? tokens.length];
}

export
async function getSymbolReferencesWithinFile(
    cancel: vscode.CancellationToken,
    docuri: vscode.Uri,
    ident: string,
    modref?: string, // If absent, search the assignments.
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
    let skipModulesCount: number = 0;

    // All modules in this file could contain the module
    for (let i = 0; i < len; i++) {
        if (cancel.isCancellationRequested) {
            break;
        }
        const mod = modules[i];
        if (modref) {
            const sfm = mod.imports.modules[modref];
            if (!sfm || !(ident in sfm.symbolList)) {
                log.appendLine(`module with index ${i} did not seem to import ${ident} within module ${mod.name} (index ${i}) in file ${docuri}`);
                skipModulesCount++;
                continue; // Try the next module.
            }
            if (modoidarcs && sfm.assignedIdentifier) {
                const impoid = await resolveAssignedIdentifier(
                    cancel,
                    sfm.assignedIdentifier,
                    mod,
                    docuri,
                );
                if (!impoid) {
                    log.appendLine(`could not resolve assigned identifier for module ${mod.name} in ${docuri}`);
                    skipModulesCount++;
                    continue; // Skip: could not resolve assigned identifier.
                }
                // TODO: Make it configurable whether or not this check happens.
                const impoidarcs = getOidNodesFromModuleIdentifier(impoid);
                if (!impoidarcs) {
                    skipModulesCount++;
                    continue;
                }
                if (!asn1ModuleMatch(modoidarcs, impoidarcs, sfm.selectionOption)) {
                    log.appendLine(`non-matching oid used in import statement in module ${mod.name} in ${docuri}`);
                    skipModulesCount++;
                    continue; // Not a matching module.
                }
            }
        }

        const moduleTokens = tokens.slice(j);
        const [ locs, tokensRead ] = await getReferencesWithinModule(
            cancel,
            doc,
            modref,
            ident,
            moduleTokens,
            skipModulesCount,
        );
        j += tokensRead;
        skipModulesCount = 0;
        ret.push(...locs);
    }
    return ret;
}

/*
This differs from getSymbolReferencesWithinFile() by using the modoid to
filter out 
*/
async function getModuleReferencesWithinFile(
    cancel: vscode.CancellationToken,
    docuri: vscode.Uri,
    ident: string,
    seloid?: NameAndOrNumber[],
    selopt?: SelectionOption,
): Promise<vscode.Location[]> {
    const doc = await vscode.workspace.openTextDocument(docuri);
    const p = await getParserOutputs(docuri, undefined, cancel);
    if (
        !p.parsedModules
        || ("err" in p.parsedModules)
        || !p.lexicalTokens
        || ("err" in p.lexicalTokens)
        || !p.parserEndState
        // || ("err" in p.parserEndState)
        // || (Object.keys(p.parserEndState.ok.syntaxErrors).length > 0)
    ) {
        // TODO: Everywhere you do this, do better logging of the errors.
        return Promise.reject(null);
    }
    const modules = p.parsedModules.ok;
    const tokens = p.lexicalTokens.ok;
    const selarcs = seloid ? getOidNodesFromModuleIdentifier(seloid) : undefined;
    const ret: vscode.Location[] = [];
    const len = modules.length;
    let j = 0;
    for (let i = 0; i < len; i++) {
        if (cancel?.isCancellationRequested) {
            break;
        }
        const mod = modules[i];
        const modid = mod.production?.children[0]?.children[0];
        if (!modid) {
            continue;
        }

        // Check the module name itself for a match.
        if (
            (mod.name === ident)
            && (!mod.oid === !seloid)
        ) {
            if (!mod.oid) {
                // Both the assertion and the module included no OID.
                // Therefore, assume it was a match.
                const range = getRangeFromLocation(doc, modid.location);
                ret.push(new vscode.Location(docuri, range));
            } else {
                const modarcs = getOidNodesFromModuleIdentifier(mod.oid);
                if (modarcs && selarcs) {
                    const matchesOid = asn1ModuleMatch(modarcs, selarcs, selopt);
                    if (matchesOid) {
                        const range = getRangeFromLocation(doc, modid.location);
                        ret.push(new vscode.Location(docuri, range));
                    }
                }
            }
        }

        // Check the import statements for matches
        const imports = mod.imports?.modules ?? {};
        const sfm = imports[ident];
        if (sfm?.production) {
            const sfmModName = sfm.production.children
                .find((c) => c.type === 'GlobalModuleReference')
                ?.children[0];
            if (sfmModName) {
                if (sfm.assignedIdentifier) {
                    const impoid = await resolveAssignedIdentifier(
                        cancel,
                        sfm.assignedIdentifier,
                        mod,
                        docuri,
                    );
                    if (impoid && selarcs) {
                        // TODO: Make it configurable whether or not this check happens.
                        const impoidarcs = getOidNodesFromModuleIdentifier(impoid);
                        if (impoidarcs && asn1ModuleMatch(selarcs, impoidarcs, sfm.selectionOption)) {
                            // The name and OID matches, so return this module reference.
                            const range = getRangeFromLocation(doc, sfmModName.location);
                            ret.push(new vscode.Location(docuri, range));
                        }
                    }
                } else {
                    // There is only a name, and it matches.
                    const range = getRangeFromLocation(doc, sfmModName.location);
                    ret.push(new vscode.Location(docuri, range));
                }
            }
        }

        // Check for references elsewhere.
        const moduleTokens = tokens.slice(j);
        const [ locs, tokensRead ] = await getReferencesWithinModule(
            cancel,
            doc,
            undefined,
            ident,
            moduleTokens,
            undefined,
            true, // Ignore imports and exports
        );
        j += tokensRead;
        ret.push(...locs);
    }
    return ret;
}

/**
 * @summary Get references from modules that have defined an identifier
 * @description
 * 
 * This function is distinguished from other functions that search for
 * modules that import a symbol and scan them for references to that
 * symbol: this function searches the modules that have defined those
 * symbols to return the assignment itself as well as references within
 * that same module.
 * 
 * @param modref The name of the module in which the reference is defined
 * @param modoid The resolved object identifier of the module in which the reference is defined
 * @param ident The identifier whose assignment (and other uses) are to be found
 * @param selopt The selection option governing which ASN.1 module OIDs match
 * @returns A promise resolving the VS Code locations within the workspace
 *  where the sought identifier is defined and used within the modules where it
 *  is defined.
 * 
 * @function
 */
async function getReferencesFromAssigningModules(
    cancel: vscode.CancellationToken,
    modref: ASN1ModuleName,
    modoid: NameAndOrNumber[] | undefined,
    ident: ASN1Reference,
    selopt?: SelectionOption,
): Promise<vscode.Location[]> {
    const ret: vscode.Location[] = [];
    // ... iterate over all possible files that might have a matching module.
    for (const definingDocUriStr of getFilesContainingModule(modref)) {
        if (cancel.isCancellationRequested) {
            break;
        }
        // Decode the URI
        let docuri;
        try {
            docuri = vscode.Uri.parse(definingDocUriStr, true);
        } catch (e) {
            log.appendLine(`malformed document uri ${definingDocUriStr}: ${e}`);
            continue;
        }

        // Obtain the ASN.1 modules within this file.
        const p2 = await getParserOutputs(docuri);
        if (!p2.parsedModules || ("err" in p2.parsedModules)) {
            continue;
        }
        const mods = p2.parsedModules.ok; 

        // Filter out the non-matching ASN.1 modules in that file.
        for (const mod of mods) {
            if (!mod.oid !== !modoid) {
                continue;
            }
            if (mod.oid && modoid) {
                const oid1 = getOidNodesFromModuleIdentifier(mod.oid);
                const impoid = getOidNodesFromModuleIdentifier(modoid);
                if (!oid1 || !impoid || !asn1ModuleMatch(oid1, impoid, selopt)) {
                    continue;
                }
            }
            // At this point the module is a match: return references from the
            // assignments.
            const locs = await getSymbolReferencesWithinFile(cancel, docuri, ident);
            ret.push(...locs);
        }
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
    cancel: vscode.CancellationToken,
): Promise<vscode.Location[]> {
    // If the document is invalid ASN.1, all bets are off.
    const p = await getParserOutputs(document.uri, undefined, cancel);
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
    const defined = getDefinedThingAtPosition(cancel, document, position, cst);
    if (!defined) {
        log.appendLine(`defined thing not found at position ${position.line}:${position.character}`);
        return Promise.reject(null);
    }
    let [ modref, ident ] = defined;

    const currentModule = modules
        .find((mod) => (
            mod.production
            && positionFallsWithin(document, position, mod.production)
        ));
    if (!currentModule) {
        log.appendLine("user selected a position that does not fall within a module");
        return Promise.reject(null);
    }

    const ret: vscode.Location[] = [];
    let modoid: NameAndOrNumber[] | undefined;
    if (!modref && (ident in currentModule.assignments)) {
        modref = currentModule.name;
        modoid = currentModule.oid;
        ret.push(new vscode.Location(document.uri, position));
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
                cancel,
                sfm.assignedIdentifier,
                currentModule,
                document.uri,
            );
            if (modoid) {
                log.appendLine("resolved current module's oid");
            }
        }

        /* We have all imports indexed, but not all assignments. Our search for
        references uses these imports, but to find references within files
        where a given identifier is actually defined, we have to traverse the
        imports of this module and find all modules that satisfy the import,
        then query their `assignments`. */
        if (modref) { // If the symbol was imported...
            const refs = await getReferencesFromAssigningModules(
                cancel, modref, modoid, ident, sfm?.selectionOption);
            ret.push(...refs);
        }
    }

    if (!modref) {
        log.appendLine(`identifier ${ident} was not defined locally, nor imported; therefore, cannot be found`);
        return Promise.reject(null);
    }

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
            const locs = await getSymbolReferencesWithinFile(cancel, docuri, ident, modref, modoid);
            ret.push(...locs);
        } catch (e) {
            log.appendLine(`failed to get references within file ${refuri}: ${e}`);
            continue;
        }
    }
    return ret;
}

/**
 * @description
 * 
 * Module identifiers can appear in three places, as far as I can tell:
 * 
 * 1. As the module name
 * 2. As the module name within an import
 * 3. As a qualifier in a `Defined*` thing, such as a `DefinedValue`
 * 
 * These three cases, respectively, are identified as follows:
 * 
 * 1. Check if the index has that 
 * 
 * @param document 
 * @param position 
 * @param options 
 * @param token 
 */
export
async function provideReferencesForModuleName(
    document: vscode.TextDocument,
    position: vscode.Position,
    cancel: vscode.CancellationToken,
    modoid?: NameAndOrNumber[], // Module must match in the ID or in imports to count
    selopt?: SelectionOption, // How the module must match.
): Promise<vscode.Location[]> {
    const wordRange = document.getWordRangeAtPosition(position);
    const wordText = wordRange && document.getText(wordRange);
    if (!wordRange || !wordText) {
        return [];
    }
    const fileUriStrings: Set<FileURIStr> = new Set(getFilesContainingModule(wordText));
    for (const uristr of findAllModuleReferencesFallibly(wordText)) {
        fileUriStrings.add(uristr);
    }
    const ret: vscode.Location[] = [];
    for (const modurlstr of fileUriStrings.values()) {
        if (cancel.isCancellationRequested) {
            break;
        }
        // Decode the URI
        let docuri;
        try {
            docuri = vscode.Uri.parse(modurlstr, true);
        } catch (e) {
            log.appendLine(`malformed document uri ${modurlstr}: ${e}`);
            continue;
        }
        try {
            const locs = await getModuleReferencesWithinFile(cancel, docuri, wordText, modoid, selopt);
            ret.push(...locs);
        } catch (e) {
            log.appendLine(`failed to get references within file ${docuri}: ${e}`);
            continue;
        }
    }
    return ret;
}

/**
 * @description
 * 
 * Module identifiers can appear in three places, as far as I can tell:
 * 
 * 1. As the module name
 * 2. As the module name within an import
 * 3. As a qualifier in a `Defined*` thing, such as a `DefinedValue`
 * 
 * @param document 
 * @param position 
 * @param options 
 * @param token 
 */
export
async function isModuleReference(
    document: vscode.TextDocument,
    position: vscode.Position,
    cancel: vscode.CancellationToken,
): Promise<[Module, NameAndOrNumber[]?, SelectionOption?] | null> {
    const wordRange = document.getWordRangeAtPosition(position);
    const wordText = wordRange && document.getText(wordRange);
    if (!wordRange || !wordText || !startsWithCapitalLetter(wordText)) {
        return null;
    }

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

    for (const mod of modules) {
        if (cancel.isCancellationRequested) {
            break;
        }
        if (mod.production) {
            // modname is the modulereference in ModuleIdentifier
            const modname = mod.production.children[0].children[0];
            if (positionFallsWithin(document, position, modname)) {
                return [mod, mod.oid];
            }
        }

        // The user might have clicked on the module name after the FROM
        const sfm: SymbolsFromModule = (mod.imports?.modules ?? {})[wordText];
        const importedModuleName = sfm
            ?.production
            ?.children
            .find((child) => child.type === 'GlobalModuleReference')
            ?.children[0]; // modulereference
        if (
            importedModuleName
            && positionFallsWithin(document, position, importedModuleName)
        ) {
            // Yes, the user clicked the module name after FROM.
            log.appendLine(`Identifier ${wordText} was found in the module identifier of an import and interpreted as a module name`);
            let modoid: NameAndOrNumber[] | undefined;
            if (sfm.assignedIdentifier) {
                modoid = await resolveAssignedIdentifier(
                    cancel, sfm.assignedIdentifier, mod, document.uri);
            }
            return [mod, modoid, sfm.selectionOption];
        }
    }

    const defined = getDefinedThingAtPosition(cancel, document, position, cst);
    if (!defined) {
        return null;
    }
    let [ modref ] = defined;
    if (modref === wordText) {
        log.appendLine(`Identifier ${wordText} was found in the module qualifier of a defined reference`);
        const moduleIndex = modules
            .findIndex((m) => m.production && positionFallsWithin(document, position, m.production));
        const mod = modules[moduleIndex];
        const sfm = mod.imports.modules[modref];
        let modoid: NameAndOrNumber[] | undefined;
        if (sfm?.assignedIdentifier) {
            modoid = await resolveAssignedIdentifier(
                cancel, sfm.assignedIdentifier, mod, document.uri);
        }
        return [mod, modoid, sfm?.selectionOption];
    }

    log.appendLine(`Identifier ${wordText} was assumed to be a non-module identifier`);
    return null;
}

export
async function provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
): Promise<vscode.Location[]> {
    const isModRef = await isModuleReference(document, position, token);
    if (isModRef) {
        const [ _, modoid, selopt ] = isModRef ?? [];
        return provideReferencesForModuleName(
            document,
            position,
            token,
            modoid,
            selopt,
        );
    } else {
        return provideReferencesForSymbol(
            document,
            position,
            token,
        );
    }
}

export class Asn1ReferenceProvider implements vscode.ReferenceProvider {
    public provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        _options: { includeDeclaration: boolean },
        token: vscode.CancellationToken,
    ):
        Thenable<vscode.Location[]> {
        return provideReferences(document, position, token);
    }
}

// TODO: Do I need to clean up open documents?
