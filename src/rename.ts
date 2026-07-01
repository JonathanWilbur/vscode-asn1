import * as vscode from "vscode";
import { provideReferencesForSymbol } from "./findallref.js";

// FIXME: You need a separate rename for modules

/**
 * @summary Rename an ASN.1 assigned identifier in imports and in assignments
 * @description
 * 
 * This function renames an identifier established within an ASN.1 assignment
 * (as opposed to a module name).
 * 
 * @param document The text document object
 * @param position The position within the text document in which the user
 *  invoked "rename" (and therefore what symbol is to be renamed).
 * @param newName The new name of the symbol
 * @param token A cancellation token
 * @returns A complete VS Code workspace edit
 * 
 * @function
 */
async function provideRenameForSymbol(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
    token: vscode.CancellationToken,
): Promise<vscode.WorkspaceEdit> {
    const edit = new vscode.WorkspaceEdit();
    const refs = await provideReferencesForSymbol(
        document,
        position,
        token,
    );
    for (const ref of refs) {
        edit.replace(
            ref.uri,
            ref.range,
            newName,
        );
    }
    return edit;
}

export
class Asn1RenameProvider implements vscode.RenameProvider {
    public provideRenameEdits(
        document: vscode.TextDocument, position: vscode.Position,
        newName: string, token: vscode.CancellationToken):
        Thenable<vscode.WorkspaceEdit> {
        return provideRenameForSymbol(document, position, newName, token);
    }
}

export default Asn1RenameProvider;
