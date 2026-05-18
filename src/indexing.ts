import * as vscode from 'vscode';
import {
	lex,
	parse,
	grok,
	correct,
	type Module,
	TaggingMode,
	Production,
	Assignment,
	type Location,
	AssignmentType,
	type NameAndOrNumber,
    type SymbolsFromModule,
} from '@wildboar/asn1-parser';
// import { setImmediate } from "node:timers";

type FileURI = string;

/*

13.12
When the referenced module has a non-empty "DefinitiveIdentification", the "GlobalModuleReference"
referencing that module shall not have an empty "AssignedIdentifier".

Therefore, if the import uses only the module name, the first string should be the module name.
If the import uses the OID alone, the first string will be the OID alone.
If the import uses the OID WITH SUCCESSORS, the first string will be that OID with the last arc replaced with an asterisk.
If the import uses the OID WITH DESCENDANTS, the first string will be that OID with the a ".$" appended.

When searching for all references:
If the current module has no OID, only search for the modulename:identifier.
If the current module has an OID, search for:
- OID:identifier
- OID with the last arc replaced with *:identifier
- OID with the ".$" appended:identifier

Actually, one problem with this is that you might not have the module that has the OID definitions.

Remember, that the `DefinedValue` could point to an OID that uses a prefix, so
the OID resolution would have to be be recursive, if you accept this.

Actually, it looks like the X.500 specifications (at least) have deprecated the use of `DefinedValue`
for an imported module's identifier. I think this syntax is rarely in use. Further, I think if it is
used, you can simply use the module name alone and give the user a pop-up warning.

This means that you do not need to pre-parse every file: you might be able to search for raw text
in files, then only parse those on demand. I have to see if there is more stuff I need pre-indexing for.

So the process looks like this, when a user clicks "Find all references":
1. Search for the imported module's name + the symbol.
2. Parse all of those files alone. (You can cache the results, too.)
3. Filter the ones that do not match the module OID or the import selection option.
   Do not do this if the import's object identifier was not self-contained.
4. If the import statement's object identifier is not totally self-contained,
   issue a warning to the user that the object identifier was not used for filtering.

Note that you should gracefully handle the situation in ITU-T Rec. X.680, Section 13.9.a,
because that is an easy case.

*/
type ImportIndexKey = `${string}:${string}`;


function getImportIndexKeys(
    identifier: string,
    sfm: SymbolsFromModule,
): ImportIndexKey[] {
    if (!sfm.assignedIdentifier) {
        return [`${sfm.identifier}:${identifier}`];
    }
    // TODO: Shit, this means I have to resolve (recursively!) `DefinedValue`,
    // which means fully parsing every module. 
    // Sloppy solution is to just use the name, but this would have some inaccuracies.
    if ("reference" in sfm.assignedIdentifier) {
        // sfm.assignedIdentifier.
        return [];
    }
    return [];
}

interface Asn1FileIndex {
    importMap: Set<ImportIndexKey>;
}

const asn1Index: Map<FileURI, Asn1FileIndex> = new Map();

export async function indexAsn1Module(doc: vscode.TextDocument) {
    // const uris = await vscode.workspace.findFiles(
    //     "**/*.{asn,asn1}",
    //     "**/{node_modules,dist,out,build,.git}/**"
    // );
    // vscode.workspace.

    // for (const uri of uris) {
    //     // TODO: await new Promise(resolve => setImmediate(resolve));
    //     const doc = await vscode.workspace.openTextDocument(uri);
    //     if (doc.languageId === "asn1") {
    //         indexDocument(doc);
    //     }
    // }
}