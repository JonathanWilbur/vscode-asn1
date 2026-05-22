import * as vscode from "vscode";
import { getParserOutputs } from "./parsing.js";
import { drillIntoDefinedInCST, positionFallsWithin } from "./utils.js";
import { log } from "./logging.js";
import { resolveDefined } from "./resolve.js";

// TODO: Use VS code diagnostics to report errors.
async function provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
): Promise<vscode.Location> {
    const p = await getParserOutputs(document);
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
    const modules = p.parsedModules.ok;
    const cst = p.parserEndState.ok.cst;
    const wordRange = document.getWordRangeAtPosition(position);
    const word = wordRange ? document.getText(wordRange) : "<bad range or position>";
    const defined = drillIntoDefinedInCST(document, position, cst);
    if (!defined) {
        log.appendLine(`word ${word} was not thought to be a "defined" production`);
        return Promise.reject(null);
    }
    const text = document.getText();
    const definedText = text
        .slice(defined.location.startIndex, defined.location.endIndex);
    const parts = definedText.split(".");
    const identifier = parts.pop()?.trim();
    const moduleref = parts.pop()?.trim();
    if (!identifier || parts.pop()) {
        log.appendLine(`malformed reference ${word}`);
        return Promise.reject(null); // Malformed identifier.
    }
    // TODO: @wildboar/asn1-parser: Associate a production with a module and a "moduleIndexWithinFile"
    // TODO: @wildboar/asn1-parser: link CST nodes with their parents in the tree
    const parseModules = cst.children
        .find((c) => c.type === 'modules')
        ?.children.filter((c) => c.type === 'ModuleDefinition')
        ?? [];
    if (modules.length !== parseModules.length) {
        log.appendLine(`modules.length !== parseModules.length: ${modules.length} !== ${parseModules.length}`);
        return Promise.reject(null);
    }
    const parseModuleSelectedIdx = parseModules
        .findIndex((mod) => positionFallsWithin(document, position, mod));
    if (parseModuleSelectedIdx === -1) {
        log.appendLine(`no parsed module falls within ${position.line}:${position.character}`);
        return Promise.reject(null);
    }
    const currentModule = modules[parseModuleSelectedIdx];
    if (!currentModule) {
        // TODO: Replace with a proper diagnostic error.
        log.appendLine(`assertion failure: no module with index ${parseModuleSelectedIdx}`);
        return Promise.reject(null);
    }

    const res = await resolveDefined(moduleref, identifier, currentModule, document.uri);
    if (!res) {
        log.appendLine(`failed to resolve ${word}`);
        return Promise.reject(null);
    }
    const [ assn, _, docuri ] = res;
    if (!assn.production) {
        log.appendLine(`no location associated with assignment for ${word}`);
        return Promise.reject(null);
    }
    const assnloc = assn.production.location;
    const destdoc = await vscode.workspace.openTextDocument(docuri);
    const gotopos = destdoc.positionAt(assnloc.startIndex);
    const codeloc = new vscode.Location(docuri, gotopos);
    return Promise.resolve(codeloc);
    // /* ITU-T Rec. X.680, Section 14.5, states that `External*Reference` may
    // only be used if the symbol used in `identifier` is imported, so we do
    // not search the local assignments if it is used. */
    // const assignment = moduleref
    //     ? undefined
    //     : currentModule.assignments[identifier];
    // if (assignment?.production) {
    //     // The identifier is assigned locally in the current module.
    //     const loc = assignment.production.location;
    //     const gotopos = document.positionAt(loc.startIndex);
    //     const codeloc = new vscode.Location(document.uri, gotopos);
    //     return Promise.resolve(codeloc);
    // }
    // // ...otherwise, go to the import if it is present.
    // const modulesToSearch = moduleref
    //     ? [currentModule.imports.modules[moduleref]]
    //     : Object.values(currentModule.imports.modules);

    // for (const sfm of modulesToSearch) {
    //     // TODO: @wildboar/asn1: Change the non-present value to `null` instead.
    //     const hasSymbol = (identifier in sfm.symbolList);
    //     if (!hasSymbol) {
    //         continue;
    //     }

    //     // TODO: Support drilling into the symbol in the imported module:
    //     //  - This requires pre-indexing where all modules are (probably by ghetto-parsing using just the lexical token stream)
    //     //  - It will also require configuration to find ASN.1 files in the workspace.
    //     //  - Find the module by the sfm.identifier or sfm.assignedIdentifier.
    //     //  - Parse the found module completely, or try parsing just a line on which the identifier appears as an assignment.
    //     //  - Modules sometimes re-export, so this process may be recursive.

    //     const symbol = sfm.symbolList[identifier];
    //     // FIXME: @wildboar/asn1: No production associated with individual imported symbols
    //     const loc = symbol?.location
    //         ?? sfm.production?.location
    //         ?? currentModule.imports.production?.location;
    //     if (!loc) {
    //         // No associated CST productions found that are specific enough to go to.
    //         return Promise.reject(null);
    //     }
    //     const gotopos = document.positionAt(loc.startIndex);
    //     const codeloc = new vscode.Location(document.uri, gotopos);
    //     return Promise.resolve(codeloc);
    // }

    // The identifier was not present in the assignments, nor imported.
    // return Promise.reject(null);
}

export
class Asn1DefinitionProvider implements vscode.DefinitionProvider {

    public provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
    ):
        Thenable<vscode.Location> {
		return provideDefinition(document, position, token);
    }
}
