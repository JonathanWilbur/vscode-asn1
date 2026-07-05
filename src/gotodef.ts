import * as vscode from "vscode";
import { getParserOutputsWithLogging } from "./parsing.js";
import {
    getDefinedThingAtPosition,
    getOidNodesFromModuleIdentifier,
    getRangeFromLocation,
    positionFallsWithin,
} from "./utils.js";
import { log } from "./logging.js";
import { resolveAssignedIdentifier, resolveDefined } from "./resolve.js";
import {
    type SymbolsFromModule,
    type Module,
    asn1ModuleOidMatch,
} from "@wildboar/asn1-parser";
import { getFilesContainingModule } from "./indexing.js";

async function provideModuleDefinition(
    cancel: vscode.CancellationToken,
    document: vscode.TextDocument,
    sfmmod: Module,
    sfm: SymbolsFromModule,
): Promise<vscode.Location> {
    const uris = Array.from(getFilesContainingModule(sfm.identifier));
    if (uris.length > 1 && sfm.selectionOption) {
        log.appendLine(`unable to resolve to a single module for import of module ${sfm.identifier}`);
    } // Otherwise, we can just select the first module that matches.

    const config = vscode.workspace.getConfiguration("asn1");
    const strict = config.get<boolean>("strictModuleOidMatch", true);

    let sfmarcs: number[] | undefined;
    const assid = sfm.assignedIdentifier;
    if (assid && strict) {
        const sfmoid = await resolveAssignedIdentifier(
            cancel,
            assid,
            sfmmod,
            document.uri,
        );
        if (!sfmoid) {
            log.appendLine(`failed to resolve assigned identifier for import of module ${sfm.identifier}`);
            return Promise.reject(null);
        }
        sfmarcs = getOidNodesFromModuleIdentifier(sfmoid) ?? undefined;
        if (!sfmarcs) {
            log.appendLine(`failed to resolve OID for import of module ${sfm.identifier}`);
            return Promise.reject(null);
        }
    }

    for (const docuri of uris) {
        if (cancel.isCancellationRequested) {
            break;
        }
        
        const p = await getParserOutputsWithLogging(docuri, cancel);
        if (!p) {
            continue;
        }
        const modules = p.parsedModules;
        for (const mod of modules) {
            if (cancel.isCancellationRequested) {
                break;
            }
            if (!mod.production) {
                continue;
            }
            if (mod.name !== sfm.identifier) {
                continue;
            }
            
            if (strict && mod.oid && sfmarcs) {
                const modoid = getOidNodesFromModuleIdentifier(mod.oid);
                if (!modoid || !asn1ModuleOidMatch(modoid, sfmarcs, sfm.selectionOption)) {
                    continue;
                }
            }
            const prod = mod.production;
            const modid = prod.children[0].children[0];
            if (modid.type !== 'modulereference') {
                log.appendLine(`Expected a modulereference, but received ${modid.type}`);
            }
            const moddoc = await vscode.workspace.openTextDocument(docuri);
            const range = getRangeFromLocation(moddoc, modid.location);
            return new vscode.Location(docuri, range);
        }
    }
    return Promise.reject(null); // Nothing matched.
}

// TODO: Use VS code diagnostics to report errors.
async function provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    cancel: vscode.CancellationToken,
): Promise<vscode.Location> {
    const p = await getParserOutputsWithLogging(document, cancel);
    if (!p) {
        return Promise.reject(null);
    }
    const modules = p.parsedModules;

    const currentModule = modules
        .find((mod) => (
            mod.production
            && positionFallsWithin(document, position, mod.production)
        ));
    if (!currentModule) {
        log.appendLine("user selected a position that does not fall within a module");
        return Promise.reject(null);
    }

    const farsfm = Object.values(currentModule.imports.modules ?? {})
        .find((sfm) => (
            sfm.production
            && positionFallsWithin(document, position, sfm.production)
        ));
    if (farsfm) {
        const modulereference = farsfm.production
            ?.children
            .find((child) => child.type === 'GlobalModuleReference')
            ?.children[0];
        if (
            modulereference
            && positionFallsWithin(document, position, modulereference)
        ) {
            // The user clicked on the module name in an import statement.
            return provideModuleDefinition(cancel, document, currentModule, farsfm);
        }
    }

    const cst = p.parserEndState.cst;
    const wordRange = document.getWordRangeAtPosition(position);
    const word = wordRange ? document.getText(wordRange) : "<bad range or position>";
    const defined = getDefinedThingAtPosition(cancel, document, position, cst);
    if (!defined) {
        log.appendLine(`word ${word} was not thought to be a "defined" production`);
        return Promise.reject(null);
    }
    const text = document.getText();
    const definedText = text
        .slice(defined[2].location.startIndex, defined[2].location.endIndex);
    const parts = definedText.split(".");
    const identifier = parts.pop()?.trim();
    const moduleref = parts.pop()?.trim();
    if (!identifier || parts.pop()) {
        log.appendLine(`malformed reference ${word}`);
        return Promise.reject(null); // Malformed identifier.
    }

    const res = await resolveDefined(cancel, moduleref, identifier, currentModule, document.uri);
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
