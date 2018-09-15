"use strict";
exports.__esModule = true;
var vscode_1 = require("vscode");
exports.DEFINITIONS_DEFINITION = new vscode_1.MarkdownString("An ASN.1 keyword that follows the name of a module.");
exports.BEGIN_DEFINITION = new vscode_1.MarkdownString("An ASN.1 keyword that marks the start of the definitions of an ASN.1 module.");
exports.END_DEFINITION = new vscode_1.MarkdownString("An ASN.1 keyword that marks the end of the definitions of an ASN.1 module.");
exports.IMPORTS_DEFINITION = new vscode_1.MarkdownString("An ASN.1 keyword that leads a comma-delimited list of definitions that the \
current ASN.1 module imports from other ASN.1 modules for use.");
exports.EXPORTS_DEFINITION = new vscode_1.MarkdownString("An ASN.1 keyword that leads a comma-delimited list of definitions that the \
current ASN.1 module exports for use in other ASN.1 modules.");
exports.EXPLICIT_TAGS_DEFINITION = new vscode_1.MarkdownString("A phrase of ASN.1 keywords used in the module header that makes all tags of \
a SEQUENCE, SET, or CHOICE encode using `EXPLICIT` mode by default.");
exports.IMPLICIT_TAGS_DEFINITION = new vscode_1.MarkdownString("A phrase of ASN.1 keywords used in the module header that makes all tags of \
a SEQUENCE, SET, or CHOICE encode using `IMPLICIT` mode by default.");
exports.AUTOMATIC_TAGS_DEFINITION = new vscode_1.MarkdownString("A phrase of ASN.1 keywords used in the module header that makes all tags of \
a SEQUENCE, SET, or CHOICE encode using `IMPLICIT` mode with context-specific \
tag classes, and with each member of said structured type automatically being \
assigned auto-incrementing tag numbers.");
exports.EXTENSIBILITY_IMPLIED_DEFINITION = new vscode_1.MarkdownString("A phrase of ASN.1 keywords used in the module header that makes all \
structured types implicitly extensible, which is normally indicated \
explicitly by appending a comma followed by the extensibility ellipses, '...', \
at the end of the members list of a structured type definition.");
exports.TAGS_DEFINITION = new vscode_1.MarkdownString("A keyword in the header of an ASN.1 module that globally declares the tagging \
mode. The keyword before it must be either `EXPLICIT`, `IMPLICIT`, or \
`AUTOMATIC`.");
//# sourceMappingURL=module.js.map