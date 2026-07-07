import * as vscode from "vscode";
import {
    positionFallsWithin,
    moduleReferenceTokens,
    getDefinedThingAtPosition,
    getRangeFromLocation,
} from "./utils.js";
import { getParserOutputsWithLogging } from "./parsing.js";
import { log } from "./logging.js";
import type {
    Production,
    TerminalProductionType,
    NameAndOrNumber,
} from "@wildboar/asn1-parser";
import { resolveAssignedIdentifier } from "./resolve.js";
import {
    getSymbolReferencesWithinFile,
    getReferencesWithinModule,
} from "./findallref.js";

/**
 * @summary Provide module name highlights
 * @description
 * 
 * Note: this has no intelligence. It assumes that every appearance of this
 * module name is a reference to it, even if used in an import with a
 * non-matching module object identifier. I did it this way because (1) it
 * is way easier (2) it is much faster, which matters a lot for highlighting,
 * which is going to update practically with every keystroke, and (3) it is
 * such a bizarre use case to even have multiple modules in a file, let alone
 * modules that do not relate to each other in some way. A user would probably
 * expect and demand all occurrences of the module name to be highlighted, even
 * if they differ by module object identifier.
 * 
 * @param document The current text document
 * @param cancel The cancellation token
 * @param ident The module name
 * @param lexicalTokens The lexical tokens array for the current text document
 * @returns A promise that resolves to an array of highlights
 * @async
 * @function
 */
async function provideModuleNameHighlights(
    document: vscode.TextDocument,
    cancel: vscode.CancellationToken,
    ident: string,
    lexicalTokens: Production<TerminalProductionType>[],
): Promise<vscode.DocumentHighlight[]> {
    const text = document.getText();
    const ret: vscode.DocumentHighlight[] = [];
    for (const lextok of lexicalTokens) {
        if (cancel.isCancellationRequested) {
            break;
        }
        if (moduleReferenceTokens.has(lextok.type)) {
            const tokenText = text.slice(
                lextok.location.startIndex,
                lextok.location.endIndex,
            );
            if (tokenText === ident) {
                const range = getRangeFromLocation(document, lextok.location);
                ret.push(new vscode.DocumentHighlight(
                    range,
                    vscode.DocumentHighlightKind.Text,
                ));
            }
        }
    }
    return ret;
}

/**
 * @summary Provide document highlights
 * @param document The current text document
 * @param position The cursor position
 * @param cancel The cancellation token
 * @returns A promise that resolves to an array of highlights
 * @async
 * @function
 */
async function provideDocumentHighlights(
    document: vscode.TextDocument,
    position: vscode.Position,
    cancel: vscode.CancellationToken,
): Promise<vscode.DocumentHighlight[]> {
    log.appendLine(`getting highlights for symbol at ${position.line}:${position.character}`);
    const p = await getParserOutputsWithLogging(document.uri, cancel);
    if (!p) {
        return Promise.reject(null);
    }

    const tokens = p.lexicalTokens;
    const modules = p.parsedModules;
    const cst = p.parserEndState.cst;

    const defined = getDefinedThingAtPosition(cancel, document, position, cst);
    if (!defined) {
        log.appendLine("no highlight available: thing at cursor position is not a reference");
        return [];
    }
    let [ modref, ident ] = defined;
    let modoid: NameAndOrNumber[] | undefined;

    const currentModuleIndex = modules
        .findIndex((mod) => (
            mod.production
            && positionFallsWithin(document, position, mod.production)
        ));
    const currentModule = modules[currentModuleIndex];
    if (!currentModule?.production?.location) {
        log.appendLine("user selected a position that does not fall within a module");
        return Promise.reject(null);
    }

    // modname is the modulereference in ModuleIdentifier
    const modname = currentModule.production.children[0].children[0];
    if (positionFallsWithin(document, position, modname)) {
        return provideModuleNameHighlights(document, cancel, ident, tokens);
    }

    const impsfm = Object.values(currentModule.imports.modules)
        .find((sfm) => sfm.identifier === ident);
    if (impsfm?.production) {
        const sfmModName = impsfm.production.children
            .find((c) => c.type === 'GlobalModuleReference')
            ?.children[0];
        if (sfmModName && positionFallsWithin(document, position, sfmModName)) {
            // The user is postioned over the module name that comes after
            // FROM in an import.
            return provideModuleNameHighlights(document, cancel, ident, tokens);
        }
    }

    if (
        !modref // there was no explicit module qualification...
        && (ident in currentModule.assignments) // ...and the identifier was assigned in this module.
    ) {
        // Then the module of the reference is the current module.
        modref = currentModule.name;
        modoid = currentModule.oid;
    }

    // If the module still wasn't discovered, it must be imported.
    if (!modref) {
        // Check if the identifier was imported.
        const impsfm = Object.values(currentModule.imports.modules)
            .find((sfm) => ident in sfm.symbolList);
        if (!impsfm) {
            log.appendLine(`identifier ${ident} not defined anywhere in the current module`);
            return [];
        }
        modref = impsfm.identifier;
        if (impsfm.assignedIdentifier) {
            modoid = await resolveAssignedIdentifier(
                cancel,
                impsfm.assignedIdentifier,
                currentModule,
                document.uri,
            );
        }
    }

    // Gets the unqualified references just within the current module.
    const [locs] = await getReferencesWithinModule(
        cancel,
        document,
        undefined,
        ident,
        tokens,
        currentModuleIndex,
        true,
    );

    // Gets references within other modules within this file.
    const morelocs = await getSymbolReferencesWithinFile(cancel, document.uri, ident, modref, modoid);
    const ret = [...locs, ...morelocs].map((loc) => new vscode.DocumentHighlight(
        loc.range,
        vscode.DocumentHighlightKind.Text,
    ));
    log.appendLine(`found ${ret.length} highlights`);
    return ret;
}

export
class Asn1HighlightProvider implements vscode.DocumentHighlightProvider {
    public provideDocumentHighlights(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
    ): vscode.DocumentHighlight[] | Thenable<vscode.DocumentHighlight[]> {
        return provideDocumentHighlights(document, position, token);
    }
}

export default Asn1HighlightProvider;
