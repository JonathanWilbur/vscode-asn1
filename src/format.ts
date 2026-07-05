import * as vscode from "vscode";
import { type Production, type Module } from "@wildboar/asn1-parser";
import { getParserOutputsWithLogging } from "./parsing.js";
import { getRangeFromLocation } from "./utils.js";

function isEmptyProduction(prod: Production): boolean {
    return (prod.location.endIndex <= prod.location.startIndex);
}

function firstAndLast(prod?: Production): [ Production, Production ] | null {
    if (
        !prod
        || isEmptyProduction(prod)
        || (prod.children.length <= 1)
    ) {
        return null;
    }
    const first = prod.children[0];
    const last = prod.children[prod.children.length - 1];
    return [first, last];
}

const ignoredTokenTypes: Set<string> = new Set([
    "newlineWhitespace",
    "nonNewlineWhitespace",
]);

function separateBy(
    document: vscode.TextDocument,
    cstnode1: Production,
    cstnode2: Production,
    sep: string,
    commasep: boolean = false,
): vscode.TextEdit | null {
    const spaceBetween = new vscode.Range(
        document.positionAt(cstnode1.location.endIndex),
        document.positionAt(cstnode2.location.startIndex),
    );
    // We do this because we do not want to apply this formatting if it
    // would delete comments.
    const nonWsTextBetween = document
        .getText(spaceBetween)
        .trim();
    // If we are separating by commas, we can tolerate a comma between these items.
    if (commasep && (nonWsTextBetween === ",")) {
        return new vscode.TextEdit(spaceBetween, sep);
    }
    const isOnlyWhitespace = (nonWsTextBetween.length === 0);
    if (!isOnlyWhitespace) {
        return null;
    }
    return new vscode.TextEdit(spaceBetween, sep);
}

function separateAllBy(
    document: vscode.TextDocument,
    cstnodes: Production[],
    sep: string,
    edits: vscode.TextEdit[],
): void {
    const nonws = cstnodes.filter((c) => c.type !== "whitespace");
    if (nonws.length <= 1) {
        return;
    }
    for (let i = 1; i < nonws.length; i++) {
        const c1 = nonws[i - 1];
        const c2 = nonws[i];
        const edit = separateBy(document, c1, c2, sep);
        edit && edits.push(edit);
    }
}

function formatDefinitiveOidComponent(
    document: vscode.TextDocument,
    edits: vscode.TextEdit[],
    cstnode: Production,
): number {
    const alt = (cstnode.type === "DefinitiveObjIdComponent")
        ? cstnode.children[0]
        : cstnode;
    if (alt.type !== "DefinitiveNameAndNumberForm") {
        return (cstnode.location.endIndex - cstnode.location.startIndex);
    }
    const ident = alt.children[0];
    const num = alt.children
        .find((c) => c.type === "DefinitiveNumberForm");
    if (!ident || !num) {
        return (cstnode.location.endIndex - cstnode.location.startIndex);
    }
    separateAllBy(document, alt.children, "", edits);
    const identlen = (ident.location.endIndex - ident.location.startIndex);
    const numlen = (num.location.endIndex - num.location.startIndex);
    return identlen + numlen + 2; // +2 for the parens
}

function formatDefinitiveOid(
    document: vscode.TextDocument,
    edits: vscode.TextEdit[],
    cstnode: Production,
    eol: string,
    linemax: number,
): void {
    const range = getRangeFromLocation(document, cstnode.location);
    const text = document.getText(range);
    if (text.includes("--") || text.includes("*")) {
        return; // There were comments. Do nothing.
    }
    let list = (cstnode.type === "DefinitiveOIDandIRI")
        ? cstnode.children[0]
        : cstnode;
    if (list.type === "DefinitiveOID") {
        // Ensure no space after opening curly or before closing curly.
        separateAllBy(document, list.children, "", edits);
        const clist = list.children.find((c) => c.type === "DefinitiveObjIdComponentList");
        if (!clist) {
            return;
        }
        list = clist;
    }
    // list is now DefinitiveObjIdComponentList
    const arcs = list.children
        .filter((c) => c.type === "DefinitiveObjIdComponent");
    if (arcs.length <= 1) {
        return;
    }
    const len0 = formatDefinitiveOidComponent(document, edits, arcs[0]);
    let col: number = len0 + 1; // +1 for the opening curly.
    let prevarc = arcs[0];
    for (let i = 1; i < arcs.length; i++) {
        const arc = arcs[i];
        const arclen = formatDefinitiveOidComponent(document, edits, arc);
        let sep;
        // If adding a space and then the arc would exceed line length limits...
        if ((col + 1 + arclen) >= linemax) {
            sep = eol; // ...separate the arcs with a newline instead and
            col = arclen; // ...set the column to the arc length.
        } else { // ...otherwise...
            sep = " "; // ...separate arcs by single spaces, and...
            col += (1 + arclen); // ...add the arc length plus one (for the space) to the column
        }
        const edit = separateBy(document, prevarc, arc, sep);
        edit && edits.push(edit);
        prevarc = arc;
    }
}

function formatDefinitiveIdentification(
    document: vscode.TextDocument,
    edits: vscode.TextEdit[],
    cstnode: Production,
    eol: string,
    linemax: number,
): void {
    if (cstnode.children.length === 0) {
        return;
    }
    let alt = cstnode;
    if (cstnode.type === "DefinitiveIdentification") {
        alt = cstnode.children[0];
    }
    if (alt.type === "DefinitiveOID") {
        formatDefinitiveOid(document, edits, alt, eol, linemax);
    } else if (alt.type === "DefinitiveOIDandIRI") {
        const defoid = alt.children.find((c) => c.type === "DefinitiveOID");
        const defiri = alt.children.find((c) => c.type === "IRIValue");
        if (defoid) {
            formatDefinitiveOid(document, edits, defoid, eol, linemax);
        }
        // There is no formatting of the IRI. It's just a string. Leave it alone.
        if (defoid && defiri) {
            const sepnl = separateBy(document, defoid, defiri, eol);
            sepnl && edits.push(sepnl);
        }
    }
}

function formatModuleIdentifier(
    document: vscode.TextDocument,
    edits: vscode.TextEdit[],
    cstnode: Production,
    eol: string,
    linemax: number,
): void {
    const modref = cstnode.children[0];
    const modid = cstnode.children
        .find((c) => c.type === "DefinitiveIdentification");
    if (!modref || !modid) {
        return;
    }
    if (modid) {
        formatDefinitiveIdentification(document, edits, modid, eol, linemax);
    }
    const sepnl = separateBy(document, modref, modid, eol);
    sepnl && edits.push(sepnl);
}

function formatSymbol(
    document: vscode.TextDocument,
    edits: vscode.TextEdit[],
    cstnode: Production,
): number {
    const alt = (cstnode.type === "Symbol")
        ? cstnode.children[0]
        : cstnode;
    if (alt.type !== "ParameterizedReference") {
        return cstnode.getLength(); // Nothing to do here.
    }
    const ref = alt.children[0];
    if (ref?.type !== "Reference") {
        return malformedProdLength(cstnode);
    }
    separateAllBy(document, alt.children, "", edits);
    return ref.getLength() + 2;
}

// This always uses a single indent
function formatSymbolList(
    document: vscode.TextDocument,
    edits: vscode.TextEdit[],
    cstnode: Production,
    eol: string,
    linemax: number,
    indent: string,
): void {
    if (isEmptyProduction(cstnode)) {
        return;
    }
    const range = getRangeFromLocation(document, cstnode.location);
    const text = document.getText(range);
    if (text.includes("--") || text.includes("*")) {
        return; // There were comments. Do nothing.
    }
    const syms = cstnode.children
        .filter((c) => c.type === "Symbol");
    if (syms.length <= 1) {
        return;
    }
    const len0 = formatSymbol(document, edits, syms[0]);
    let col: number = indent.length + len0;
    let prevsym: Production = syms[0];
    for (let i = 1; i < syms.length; i++) {
        const sym = syms[i];
        const symlen = formatSymbol(document, edits, sym);
        let sep;
        // If adding a space and then the symbol would exceed line length limits...
        if ((col + 2 + symlen) >= linemax) {
            sep = "," + eol + indent; // ...separate the symbols with a newline instead and
            col = symlen; // ...set the column to the symbol length.
        } else { // ...otherwise...
            sep = ", "; // ...separate symbols by single spaces, and...
            col += (2 + symlen); // ...add the symbol length plus one (for the comma and space) to the column
        }
        const edit = separateBy(document, prevsym, sym, sep, true);
        edit && edits.push(edit);
        prevsym = sym;
    }
}

// AssignedIdentifier ::=
//     ObjectIdentifierValue
// 	| DefinedValue
// 	| empty

// ObjectIdentifierValue ::=
//     "{" ObjIdComponentsList "}"
// 	| "{" DefinedValue ObjIdComponentsList "}"

function malformedProdLength(cstnode: Production): number {
    return cstnode.getLength();
}

function formatActualParameterList(
    document: vscode.TextDocument,
    edits: vscode.TextEdit[],
    cstnode: Production,
): number {
    const len = cstnode.getLength();
    const range = getRangeFromLocation(document, cstnode.location);
    const text = document.getText(range);
    if (text.includes("--") || text.includes("*") || text.includes("\n")) {
        return len; // There were comments or newlines. Do nothing.
    }
    const curlyOpen = cstnode.children[0];
    const curlyClose = cstnode.children[cstnode.children.length - 1];
    const plist = cstnode.children.find((c) => c.type === "ActualParameterList");
    if (
        !plist
        || (curlyOpen?.type !== "curlyOpening")
        || (curlyClose?.type !== "curlyClosing")
    ) {
        return len; // Maybe malformed.
    }
    separateAllBy(document, [curlyOpen, plist, curlyClose], "", edits);
    const params = plist.children.filter((c) => c.type === "ActualParameter");
    separateAllBy(document, params, ", ", edits);
    return params
        .map((p) => p.getLength())
        .reduce((acc, cur) => acc + cur)
        + 2 // For curly brackets
        + ((params.length - 1) * 2) // For the ", " between each.
        ;
}

// For use only in Object Identifiers
function formatDefinedValue(
    document: vscode.TextDocument,
    edits: vscode.TextEdit[],
    cstnode: Production,
): number {
    // DefinedValue ::= ExternalValueReference | valuereference | ParameterizedValue
    const alt = (cstnode.type === "DefinedValue" || cstnode.type === "SimpleDefinedValue")
        ? cstnode.children[0]
        : cstnode;
    if (alt.type === "valuereference" || alt.type === "identifier") {
        return cstnode.getLength();
    }
    if (alt.type === "ExternalValueReference") {
        const nonws = alt.children.filter((c) => c.type !== "whitespace");
        const [ modref, _, valref, ...rest ] = nonws;
        if (rest.length > 0 || !valref) {
            return malformedProdLength(cstnode);
        }
        separateAllBy(document, alt.children, "", edits);
        return (
            modref.getLength()
            + 1
            + valref.getLength()
        );
    }
    if (alt.type === "ParameterizedValue") {
        // ParameterizedValue ::= SimpleDefinedValue ActualParameterList
        separateAllBy(document, alt.children, "", edits);
        const sdv = alt.children[0];
        const plist = alt.children[alt.children.length - 1];
        if (
            !sdv
            || !plist
            || (sdv.type !== "SimpleDefinedValue")
            || (plist.type !== "ActualParameterList")
        ) {
            return cstnode.getLength();
        }
        const sdvlen = formatDefinedValue(document, edits, sdv);
        const plistlen = formatActualParameterList(document, edits, plist);
        return (sdvlen + plistlen);
    }
    // Unrecognized alternative.
    return cstnode.getLength();
}

function formatObjIdComponents(
    document: vscode.TextDocument,
    edits: vscode.TextEdit[],
    cstnode: Production,
): number {
    const alt = (cstnode.type === "ObjIdComponents")
        ? cstnode.children[0]
        : cstnode;
    if (alt.type === "DefinedValue") {
        return formatDefinedValue(document, edits, alt);
    }
    if (alt.type !== "NameAndNumberForm") {
        return cstnode.getLength();
    }
    separateAllBy(document, alt.children, "", edits);
    const numform = alt
        .children
        .find((c) => c.type === "NumberForm");
    if (!numform) {
        return malformedProdLength(cstnode);
    }
    const defvalnumform = (numform.children[0]?.type === "DefinedValue")
        ? numform.children[0]
        : undefined;
    const ident = alt.children[0];
    const numlen = defvalnumform
        ? formatDefinedValue(document, edits, defvalnumform)
        : numform.getLength();
    return (ident.getLength() + numlen + 2); // +2 for parens
}

function formatObjIdComponentsList(
    document: vscode.TextDocument,
    edits: vscode.TextEdit[],
    cstnode: Production,
    eol: string,
    linemax: number,
    indent: string,
    startcol: number,
    indentnum: number,
): void {
    const range = getRangeFromLocation(document, cstnode.location);
    const text = document.getText(range);
    if (text.includes("--") || text.includes("*")) {
        return; // There were comments. Do nothing.[]
    }
    const arcs = cstnode.children
        .filter((c) => c.type === "ObjIdComponents");
    if (arcs.length <= 1) {
        return;
    }
    const len0 = formatObjIdComponents(document, edits, arcs[0]);
    let col: number = startcol + len0 + 1; // +1 for the opening curly.
    let prevarc = arcs[0];
    for (let i = 1; i < arcs.length; i++) {
        const arc = arcs[i];
        const arclen = formatObjIdComponents(document, edits, arc);
        let sep;
        // If adding a space and then the arc would exceed line length limits...
        if ((col + 1 + arclen) >= linemax) {
            sep = eol + indent.repeat(indentnum); // ...separate the arcs with a newline instead and
            col = arclen; // ...set the column to the arc length.
        } else { // ...otherwise...
            sep = " "; // ...separate arcs by single spaces, and...
            col += (1 + arclen); // ...add the arc length plus one (for the space) to the column
        }
        const edit = separateBy(document, prevarc, arc, sep);
        edit && edits.push(edit);
        prevarc = arc;
    }
}

function formatAssignedIdentifier(
    document: vscode.TextDocument,
    edits: vscode.TextEdit[],
    cstnode: Production,
    eol: string,
    linemax: number,
    indent: string,
): void {
    const alt = (cstnode.type === "AssignedIdentifier")
        ? cstnode.children[0]
        : cstnode;
    if (alt.type === "DefinedValue") {
        formatDefinedValue(document, edits, alt);
        return;
    } else if (alt.type === "ObjectIdentifierValue") {
        const nonws = alt.children.filter((c) => c.type !== "whitespace");
        const curlyOpen = nonws[0];
        const curlyClose = nonws[nonws.length - 1];
        const defval = nonws.find((c) => c.type === "DefinedValue");
        const clist = nonws.find((c) => c.type === "ObjIdComponentsList");
        if (
            !clist
            || !curlyOpen?.type.startsWith("curly")
            || !curlyClose?.type.startsWith("curly")
        ) {
            return; // Unexpected.
        }
        let defvallen: number = 0;
        if (defval) { // "{" DefinedValue ObjIdComponentsList "}"
            const sep1 = separateBy(document, curlyOpen, defval, "");
            sep1 && edits.push(sep1);
            const sep2 = separateBy(document, defval, clist, " ");
            sep2 && edits.push(sep2);
            const sep3 = separateBy(document, clist, curlyClose, "");
            sep3 && edits.push(sep3);
            defvallen = formatDefinedValue(document, edits, defval) + 1;
        } else { // "{" ObjIdComponentsList "}"
            const sep1 = separateBy(document, curlyOpen, clist, "");
            sep1 && edits.push(sep1);
            const sep2 = separateBy(document, curlyClose, clist, "");
            sep2 && edits.push(sep2);
        }
        const indentnum: number = 2;
        const startcol: number = (indent.length * indentnum) + defvallen;
        formatObjIdComponentsList(document, edits, clist, eol, linemax, indent, startcol, indentnum);
    }
}

function formatGlobalModuleRef(
    document: vscode.TextDocument,
    edits: vscode.TextEdit[],
    cstnode: Production,
    eol: string,
    linemax: number,
    indent: string,
): void {
    const modref = cstnode.children[0];
    const assid = cstnode.children[cstnode.children.length - 1];
    if (
        (cstnode.children.length <= 1)
        || !modref
        || (assid?.type !== "AssignedIdentifier")
        || isEmptyProduction(assid)
    ) {
        return;
    }
    const edit = separateBy(document, modref, assid, eol + indent + indent);
    edit && edits.push(edit);
    formatAssignedIdentifier(document, edits, assid, eol, linemax, indent);
}

// Puts the semicolon on the same line. EXPORTS is typically not present,
// or ALL if present, or fairly short if present.
function formatExports(
    document: vscode.TextDocument,
    edits: vscode.TextEdit[],
    cstnode: Production,
    eol: string,
    linemax: number,
    indent: string,
): void {
    if (isEmptyProduction(cstnode)) {
        return;
    }
    const range = getRangeFromLocation(document, cstnode.location);
    const exportsAll = cstnode.children.some((c) => c.type === "ALL");
    const text = document.getText(range);
    if (exportsAll) {
        if (!/EXPORTS\s+ALL\s*;/.test(text)) {
            return; // Do nothing. There might be comments.
        }
        edits.push(new vscode.TextEdit(range, "EXPORTS ALL;"));
        return;
    }
    const expliteral = cstnode.children[0];
    const symbolsList = cstnode.children.find((c) => c.type === "SymbolList");
    const semiColon = cstnode.children[cstnode.children.length - 1];
    if (!expliteral || !symbolsList || (semiColon.type !== "semiColon")) {
        return;
    }
    const sep1 = separateBy(document, expliteral, symbolsList, " ");
    sep1 && edits.push(sep1);
    formatSymbolList(document, edits, symbolsList, eol, linemax, indent);
    const sep2 = separateBy(document, symbolsList, semiColon, "");
    sep2 && edits.push(sep2);
}

function formatSymbolsFromModule(
    document: vscode.TextDocument,
    edits: vscode.TextEdit[],
    cstnode: Production,
    eol: string,
    linemax: number,
    indent: string,
): void {
    // SymbolList FROM GlobalModuleReference SelectionOption
    const SymbolList = cstnode.children[0];
    const FROM = cstnode
        .children
        .find((c) => c.type === "FROM");
    const GlobalModuleReference = cstnode
        .children
        .find((c) => c.type === "GlobalModuleReference");
    const SelectionOption = cstnode.children[cstnode.children.length - 1];
    if (
        !SymbolList
        || !FROM
        || !GlobalModuleReference
    ) {
        return;
    }

    const sep1 = separateBy(document, SymbolList, FROM, eol + indent + indent);
    sep1 && edits.push(sep1);
    const sep2 = separateBy(document, FROM, GlobalModuleReference, " ");
    sep2 && edits.push(sep2);
    if (
        SelectionOption.type === "SelectionOption"
        && !isEmptyProduction(SelectionOption)
    ) {
        const sep3 = separateBy(
            document,
            GlobalModuleReference,
            SelectionOption,
            eol + indent + indent,
        );
        sep3 && edits.push(sep3);
        const sofl = firstAndLast(SelectionOption);
        if (sofl) {
            const [ first, last ] = sofl;
            const sepss = separateBy(document, first, last, " ");
            sepss && edits.push(sepss);
        }
    }
    formatSymbolList(document, edits, SymbolList, eol, linemax, indent);
    formatGlobalModuleRef(document, edits, GlobalModuleReference, eol, linemax, indent);
}

function formatSymbolsImported(
    document: vscode.TextDocument,
    edits: vscode.TextEdit[],
    cstnode: Production,
    eol: string,
    linemax: number,
    indent: string,
): void {
    let node = cstnode;
    if (cstnode.type === "SymbolsImported") {
        node = cstnode.children[0];
        if (!node) {
            return;
        }
    }
    if (node.type !== "SymbolsFromModuleList") {
        return;
    }
    const sfms = node.children
        .filter((c) => c.type === "SymbolsFromModule");
    for (let i = 1; i < sfms.length; i++) {
        const first = sfms[i - 1];
        if (first.location.startIndex === first.location.endIndex) {
            continue; // Skip empty productions
        }
        const second = sfms[i];
        if (second.location.startIndex === second.location.endIndex) {
            continue; // Skip empty productions
        }
        const sepnl = separateBy(document, first, second, eol + eol + indent);
        if (sepnl) {
            edits.push(sepnl);
        } else { // There was a comment between.
            // We still want to indent the first line of the symbols list,
            // even if the lines between the SFMs had comments.
            const symlistRange = getRangeFromLocation(document, second.location);
            const beforeSymList = new vscode.Range(
                new vscode.Position(symlistRange.start.line, 0),
                symlistRange.start,
            );
            const beforeSymListText = document.getText(beforeSymList);
            if (
                (beforeSymListText.trim().length === 0)
                && (beforeSymListText !== indent)
            ) { // If its all whitespace, but not the proper indent.
                const edit = new vscode.TextEdit(beforeSymList, indent);
                edits.push(edit);
            }
        }
    }
    for (const sfm of sfms) {
        formatSymbolsFromModule(
            document,
            edits,
            sfm,
            eol,
            linemax,
            indent,
        );
    }
}

function formatImports(
    document: vscode.TextDocument,
    edits: vscode.TextEdit[],
    cstnode: Production,
    eol: string,
    linemax: number,
    indent: string,
): void {
    if (isEmptyProduction(cstnode)) {
        return;
    }
    const range = getRangeFromLocation(document, cstnode.location);
    const text = document.getText(range);
    if (/IMPORTS\s*;/.test(text)) {
        edits.push(new vscode.TextEdit(range, "IMPORTS;"));
        return;
    }
    const impliteral = cstnode.children[0];
    const sfmlist = cstnode.children.find((c) => c.type === "SymbolsImported");
    const semiColon = cstnode.children[cstnode.children.length - 1];
    if (!impliteral || !sfmlist || (semiColon.type !== "semiColon")) {
        return;
    }
    const sep1 = separateBy(document, impliteral, sfmlist, eol + eol + indent);
    sep1 && edits.push(sep1);
    formatSymbolsImported(document, edits, sfmlist, eol, linemax, indent);
    const sep2 = separateBy(document, sfmlist, semiColon, eol + indent);
    sep2 && edits.push(sep2);
}

function formatModule(
    document: vscode.TextDocument,
    edits: vscode.TextEdit[],
    module: Module,
    eol: string,
    linemax: number,
    indent: string,
): void {
    if (!module.production) {
        return;
    }

    // All of the productions of a module can be separated by a newline:
    //  ModuleIdentifier
    //  DEFINITIONS
    //  EncodingReferenceDefault
    //  TagDefault
    //  ExtensionDefault
    //  "::="
    //  BEGIN
    //  ModuleBody
    //  EncodingControlSections
    //  END
    const nonwsChildren = module.production.children
        .filter((c) => c.type !== "whitespace");
    for (let i = 1; i < nonwsChildren.length; i++) {
        const first = nonwsChildren[i - 1];
        if (first.location.startIndex === first.location.endIndex) {
            continue; // Skip empty productions
        }
        const second = nonwsChildren[i];
        if (second.location.startIndex === second.location.endIndex) {
            continue; // Skip empty productions
        }
        const sepnl = separateBy(document, first, second, eol);
        sepnl && edits.push(sepnl);
    }

    const modid = module.production.children[0];
    formatModuleIdentifier(document, edits, modid, eol, linemax);

    // Separate `encodingreference INSTRUCTIONS` by a single space.
    const encrefdef = module
        .production
        .children
        .find((c) => c.type === "EncodingReferenceDefault");
    const encrefdeffl = firstAndLast(encrefdef);
    if (encrefdeffl) {
        const [ first, last ] = encrefdeffl;
        const sepss = separateBy(document, first, last, " ");
        sepss && edits.push(sepss);
    }

    const tagdef = module
        .production
        .children
        .find((c) => c.type === "TagDefault");
    const tagdeffl = firstAndLast(tagdef);
    if (tagdeffl) {
        const [ first, last ] = tagdeffl;
        const sepss = separateBy(document, first, last, " ");
        sepss && edits.push(sepss);
    }

    const extdef = module
        .production
        .children
        .find((c) => c.type === "ExtensionDefault");
    const extdeffl = firstAndLast(extdef);
    if (extdeffl) {
        const [ first, last ] = extdeffl;
        const sepss = separateBy(document, first, last, " ");
        sepss && edits.push(sepss);
    }

    const body = module
        .production
        .children
        .find((c) => c.type === "ModuleBody");
    if (!body) {
        return;
    }
    const exports = body
        .children
        .find((c) => c.type === "Exports");
    const imports = body
        .children
        .find((c) => c.type === "Imports");
    const assns = body
        .children
        .find((c) => c.type === "AssignmentList")
        ?.children
        .filter((c) => c.type === "Assignment") ?? [];

    exports && formatExports(document, edits, exports, eol, linemax, indent);
    imports && formatImports(document, edits, imports, eol, linemax, indent);

    // Ensure double newlines between assignments that themselves span lines.
    // No transformations are applied to single-line assignments.
    if (assns.length > 1) {
        for (let i = 1; i < assns.length; i++) {
            const first = assns[i - 1];
            const second = assns[i];
            const firstRange = getRangeFromLocation(document, first.location);
            const secondRange = getRangeFromLocation(document, second.location);
            if (firstRange.isSingleLine && secondRange.isSingleLine) {
                continue;
            }
            // Note that this does not produce an edit if there are comments
            // between these assignments. This is out of caution.
            // Conservativism is a deliberate design choice of this formatter.
            const sepnl = separateBy(document, first, second, eol + eol);
            sepnl && edits.push(sepnl);
        }
    }

    // I don't really think I can do any other formattings for assignments.
    // In nearly any case, there could be a good reason for a particular whitespacing.
    // Consider:
    // `Type9  ::= INTEGER`
    // `Type10 ::= INTEGER`
    // So I don't think I can universally enforce anything.

    return;
}

async function provideDocumentFormattingEdits(
    document: vscode.TextDocument,
    options: vscode.FormattingOptions,
    cancel: vscode.CancellationToken,
): Promise<vscode.TextEdit[]> {
    const config = vscode.workspace.getConfiguration("asn1");
    const configLinemax = config.get<number>("maxLineLength");
    const linemax: number = configLinemax
        ?? vscode.workspace
            .getConfiguration("editor", document)
            .get<number[]>("rulers")
            ?.find((ruler) => (ruler >= 80))
        ?? 80;
    const eol = (document.eol === vscode.EndOfLine.CRLF)
        ? "\r\n"
        : "\n";
    const indent = options.insertSpaces
        ? " ".repeat(options.tabSize)
        : "\t";

    const p = await getParserOutputsWithLogging(document.uri, cancel);
    if (!p) {
        return Promise.reject(null);
    }
    const modules = p.parsedModules;
    const edits: vscode.TextEdit[] = [];
    for (const module of modules) {
        formatModule(document, edits, module, eol, linemax, indent);
    }

    return edits;
}

export class Asn1DocumentFormattingEditProvider implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.TextEdit[]> {
        return provideDocumentFormattingEdits(document, options, token);
    }
}
