"use strict";
exports.__esModule = true;
var vscode_1 = require("vscode");
exports.UNIVERSAL_DEFINTION = new vscode_1.MarkdownString("An ASN.1 tag class used for ASN.1 elements whose data types are one of \
those defined by the ASN.1 specification.");
exports.PRIVATE_DEFINTION = new vscode_1.MarkdownString("An ASN.1 tag class used for ASN.1 elements that are privately added to \
international specifications. Particularly intended to extend SEQUENCE, \
SET, and CHOICE types with additional member in a way to avoid conflict \
with international specifications.");
exports.APPLICATION_DEFINTION = new vscode_1.MarkdownString("An ASN.1 tag class that is specific to a particular application and which \
must be distinguished from other data types used in the application.");
exports.CONTEXT_SPECIFIC_DEFINTION = new vscode_1.MarkdownString("An ASN.1 tag class that is used to uniquely identify members of a SEQUENCE, \
SET, or CHOICE. It is the default tagging class if no keyword appears in the \
square brackets where a tag number occurs. There is no `CONTEXT-SPECIFIC` \
keyword in ASN.1.");
//# sourceMappingURL=classes.js.map