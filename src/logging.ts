import * as vscode from 'vscode';

const LANGUAGE: string = "asn1";

/**
 * The log for this extension.
 */
export const log = vscode.window.createOutputChannel("ASN.1", LANGUAGE);

export default log;
