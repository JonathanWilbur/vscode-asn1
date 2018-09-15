"use strict";
exports.__esModule = true;
var vscode_1 = require("vscode");
exports.EXPLICIT_DEFINITION = new vscode_1.MarkdownString("An ASN.1 tagging mode keyword that makes the encoding of the specified \
element the entire encoding of its parent type. In other words, the tag \
and length indicator (if applicable) for this element is followed by yet \
another tag and length indicator (again, if applicable), which then \
encodes the data. The inner tag and length indicator are those for which \
this element is just an explicit (hence the keyword) container.");
exports.IMPLICIT_DEFINITION = new vscode_1.MarkdownString("An ASN.1 tagging mode keyword that makes the encoding of the specified \
element only the encoded value of the type for which this type is \
implicit. In other words, this type is just secretly, or _implicitly_, \
another type, so the tag number and length indicator (if applicable) of the \
type for which this type is implicit should not be encoded into this type's \
value octets. Unless further constraints are applied on this type, you can \
encode an element of this type exactly the same way you would encode an \
element of the type for which this type is implicit--just the tag changes to \
this type's tag.");
//# sourceMappingURL=mode.js.map