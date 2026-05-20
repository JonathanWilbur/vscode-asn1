import * as vscode from 'vscode';

const LANGUAGE: string = "asn1";

export const log = vscode.window.createOutputChannel("ASN.1", LANGUAGE);

export default log;
