import * as vscode from "vscode";
import { positionFallsWithin, startsWithCapitalLetter, getDefinedThingAtPosition } from "./utils.js";
import { getParserOutputs } from "./parsing.js";
import { log } from "./logging.js";
import { type NameAndOrNumber } from "@wildboar/asn1-parser";
import { resolveAssignedIdentifier } from "./resolve.js";
import { getSymbolReferencesWithinFile, getReferencesWithinModule } from "./findallref.js";

// TODO: Dedupe and put in utils
const ignoredTokenTypes: Set<string> = new Set([
    "newlineWhitespace",
    "nonNewlineWhitespace",
    "comment",
]);

// TODO: Dedupe and put in utils
const moduleReferenceTokens: Set<string> = new Set([
    "objectclassreference",
    "modulereference",
    "typereference",
]);

async function provideDocumentHighlights(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
): Promise<vscode.DocumentHighlight[]> {
    log.appendLine(`getting highlights for symbol at ${position}`);
    // const wordRange = document.getWordRangeAtPosition(position);
    // const ident = wordRange && document.getText(wordRange);

    // TODO: Ignore keywords (I think using getDefinedThingAtPosition will fix this)
    // TODO: Handle module name differently?

    // if (!wordRange || !ident) {
    //     return [];
    // }
    // const identTokenType: string = (ident.toUpperCase() === ident)
    //     ? "objectclassreference"
    //     : (startsWithCapitalLetter(ident)
    //         ? "typereference"
    //         : "identifier");

    const p = await getParserOutputs(document.uri);
    if (
        !p.lexicalTokens
        || ("err" in p.lexicalTokens)
        || !p.parserEndState
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

    const tokens = p.lexicalTokens.ok;
    const modules = p.parsedModules.ok;
    const cst = p.parserEndState.ok.cst;

    const defined = getDefinedThingAtPosition(document, position, cst);
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

    // const text = document.getText();

    // // Check if this ident is part of an External*Reference. If so
    // // the module identifier parsed below must match.
    // const identi = tokens
    //     // TODO: This could be faster by bisecting.
    //     .findIndex((tok) => positionFallsWithin(document, position, tok));
    // if (identi < 0) {
    //     return [];
    // }
    // const extRefHaystack = tokens.slice(0, identi);
    // let expectingModRef: boolean = false;
    // /**
    //  * If this is set, it means that the clicked identifier was part of an
    //  * `External*Reference` production, which means that we have to make
    //  * sure that we are only highlighting that identifier from that module.
    //  */
    // let modref: string | undefined;
    // let modoid: NameAndOrNumber[] | undefined;
    // while (extRefHaystack.length > 0) {
    //     // .pop() works without mutating the original array. I checked.
    //     const last = extRefHaystack.pop()!;
    //     if (ignoredTokenTypes.has(last.type)) {
    //         continue;
    //     }
    //     if (expectingModRef) {
    //         if (moduleReferenceTokens.has(last.type)) {
    //             modref = text.slice(last.location.startIndex, last.location.endIndex);
    //         } else {
    //             // Malformed or something: there was a period, but no module
    //             // reference before it...
    //             log.appendLine(`word ${ident} started with a leading period, but no module identifier before that.`);
    //             return [];
    //         }
    //     } else {
    //         if (last.type === "period") {
    //             expectingModRef = true;
    //         } else {
    //             // The most common case: this is not an `External*Reference`.
    //             break;
    //         }
    //     }
    // }

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
                impsfm.assignedIdentifier,
                currentModule,
                document.uri,
            );
        }
    }

    // Gets the unqualified references just within the current module.
    const [locs] = await getReferencesWithinModule(
        document,
        undefined,
        ident,
        tokens,
        currentModuleIndex,
        true,
    );

    // Gets references within other modules within this file.
    const morelocs = await getSymbolReferencesWithinFile(document.uri, ident, modref, modoid);
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
