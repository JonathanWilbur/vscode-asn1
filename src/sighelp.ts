import * as vscode from "vscode";
import { inOpenSyntaxRegion, positionFallsWithin } from "./utils.js";
import { getLastValidParserOutputs } from "./parsing.js";
import { resolveDefined } from "./resolve.js";
import { type Module } from "@wildboar/asn1-parser";
import log from "./logging.js";

/**
 * @summary Obtain signature help for a given symbol
 * @param document The text document for which signature help is sought
 * @param token The cancellation token
 * @param currentModule The current ASN.1 module
 * @param defpos The position of the `Defined*` thing before the cursor (the
 *  identifier of the parameterized assignment whose parameters will be used
 *  to provide signature help)
 * @param paramIndex The index of the current parameter
 * @returns A promise that resolves to signature help as a `vscode.SignatureHelp`
 * @async
 * @function
 */
async function makeSigHelpForSymbol(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
    currentModule: Module,
    defpos: vscode.Position,
    paramIndex: number,
): Promise<vscode.SignatureHelp> {
    // NOTE: You cannot use getDefinedThingAtPosition here, because this is a stale module.
    const wordRange = document.getWordRangeAtPosition(
        defpos,
        /\b[A-Za-z][A-Za-z0-9\-\.]*[A-Za-z0-9]\b/,
    );
    const wordText = wordRange && document.getText(wordRange);
    if (!wordText) {
        log.appendLine("could not discern a defined symbol for signature help");
        return Promise.reject(null);
    }
    const parts = wordText.split(".");
    const ref = parts.pop();
    const module = parts.pop();
    if (!ref || parts.length > 0) {
        return Promise.reject(null);
    }
    const resolveResult = await resolveDefined(
        token,
        module,
        ref,
        currentModule,
        document.uri,
    );
    if (!resolveResult) {
        log.appendLine(`could not resolve reference ${ref} for signature help`);
        return Promise.reject(null);
    }
    const [ assn ] = resolveResult;
    if (!assn.parameters?.length || !assn.production) {
        // Not parameterized or no associated CST node.
        log.appendLine(`could not produce signature help for non-parameterized reference ${ref} or assignment missing production`);
        return Promise.reject(null);
    }

    if (positionFallsWithin(document, defpos, assn.production)) {
        // Don't provide signature help as we are defining a parameterized
        // assignment, nor in recursive parameterized assignments.
        return Promise.reject(null);
    }

    const ret = new vscode.SignatureHelp();
    const siginfo = new vscode.SignatureInformation(
        assn.identifier,
        new vscode.MarkdownString(
            "Parameters used to populate this ASN.1:\n"
            + "```asn1\n\n"
            + assn.rightHandSide.trimStart()
            + "\n```\n"
        ),
    );
    const params = assn.parameters ?? [];
    if (!params.every((p) => p.production)) {
        // No CST nodes. Cannot provide offsets into assignment.
        log.appendLine(`could not produce signature help for reference ${ref} because the parameters were missing CST nodes`);
        return Promise.reject(null);
    }

    const assnStart = assn.production.location.startIndex;
    siginfo.activeParameter = paramIndex;
    siginfo.parameters = params
        .map((p) => {
            const label: string | [number, number] = (
                p.production
                && (p.production.location.startIndex > assnStart)
            )
                ? [
                    (p.production.location.startIndex - assnStart),
                    (p.production.location.endIndex - assnStart)
                ]
                : (p.text ?? p.dummyReference);
            let mds = "";
            if (p.assignmentType) {
                mds += "Assumed to refer to a(n) `" + p.assignmentType + "`\n\n";
            }
            if (p.paramGovernor) {
                if (typeof p.paramGovernor === "string") {
                    mds += "Parameter Governor: `" + p.paramGovernor + "`\n";
                } else if ("reference" in p.paramGovernor) {
                    mds += "Parameter Governor: `" + p.paramGovernor.text + "`\n";
                }
            }
            const ret = new vscode.ParameterInformation(
                label,
                mds.length
                    ? new vscode.MarkdownString(mds)
                    : undefined,
            );
            return ret;
        });
    siginfo.label = assn.leftHandSide; // TODO: Trim?
    ret.activeParameter = paramIndex;
    ret.activeSignature = 0;
    ret.signatures = [siginfo];
    return ret;
}

/**
 * @summary Get signature help, given a cursor position within a document
 * @description
 * 
 * In this implementation, signature help is provided only for `Defined*` that
 * refers to a parameterized assignment. So for example, if there is an
 * assignment that is like
 * 
 * ```asn1
 * NamedType{T} ::= SEQUENCE { name UTF8String, type T }
 * ```
 * 
 * and the user types `NamedType{`, they will get signature help for `{T}`.
 * 
 * @param document The document in which to provide signature help
 * @param position The cursor position in the document
 * @param token The cancellation token
 * @returns A promise that resolves to signature help as a `vscode.SignatureHelp`
 * @async
 * @function
 */
async function provideSignatureHelp(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
): Promise<vscode.SignatureHelp> {
    const line = document.lineAt(position.line);
    const lineTextBeforeCursor = line.text.slice(0, position.character);
    if (inOpenSyntaxRegion(lineTextBeforeCursor)) {
        // Don't provide signature help, because we are in a comment, string, etc.
        return Promise.reject(null);
    }

    const outputs = getLastValidParserOutputs(document.uri);
    if (
        !outputs
        || !outputs.parsedModules
        || ("err" in outputs.parsedModules)
    ) {
        log.appendLine(`could not provide signature help in ${document.uri} because it was never valid`);
        return Promise.reject(null);
    }
    const modules = outputs.parsedModules.ok;
    let currentModule = modules
        .find((mod) => (
            mod.production
            && positionFallsWithin(document, position, mod.production)
        ));
    currentModule ??= ((modules.length === 1) ? modules[0] : undefined);
    if (!currentModule) {
        log.appendLine("could not provide signature help outside of a module");
        return Promise.reject(null);
    }

    const trimmed = lineTextBeforeCursor.trimEnd();
    const lastSigChar = trimmed[trimmed.length - 1];
    if (lastSigChar === "{") {
        const definedColumn = trimmed
            .slice(0, -1) // Trim the "{"
            .trimEnd()
            .length - 1;
        if (definedColumn < 0) {
            return Promise.reject(null);
        }
        const defpos = new vscode.Position(position.line, definedColumn);
        return makeSigHelpForSymbol(
            document,
            token,
            currentModule,
            defpos,
            0,
        );
    }
    let i = trimmed.length - 1;
    let depth: number = 0;
    let paramIndex: number = 0;
    while (i >= 0) {
        if (token.isCancellationRequested) {
            return Promise.reject(null);
        } 
        const chari = trimmed.charAt(i);
        if (chari === ",") {
            if (depth === 0) {
                paramIndex++;
            }
        } else if (chari === "}") {
            depth++;
        } else if (chari === "{") {
            if (depth === 0) {
                break;
            }
            depth--;
        }
        i--;
    }
    if (i === 0) {
        return Promise.reject(null);
    }
    // Otherwise, we balanced curly brackets: whatever came before might be an identifier.
    const beforeCurly = trimmed.slice(0, i).trimEnd(); // Remember, upper is EXCLUSIVE.
    const defpos = new vscode.Position(position.line, beforeCurly.length - 1);
    return makeSigHelpForSymbol(
        document,
        token,
        currentModule,
        defpos,
        paramIndex,
    );
}

export class Asn1SignatureHelpProvider implements vscode.SignatureHelpProvider {
    provideSignatureHelp(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        // context: vscode.SignatureHelpContext,
    ): vscode.ProviderResult<vscode.SignatureHelp> {
        return provideSignatureHelp(document, position, token);
    }
}
