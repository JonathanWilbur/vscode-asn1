"use strict";
exports.__esModule = true;
var vscode_1 = require("vscode");
exports.SIZE_DEFINITION = new vscode_1.MarkdownString("An ASN.1 constraint that limits the number of bits in a `BIT STRING`, the \
number of octets in the `OCTET STRING`, the number of characters in any \
character string data type, and the number of elements within a structured \
type. It must be followed by a pair of parentheses, in which is either \
a single positive integer indicating the mandatory size, or two positive \
integers separated by two periods, '..', which indicates a range between \
those two integers that constitutes a valid size. Note that keywords `MIN` and \
`MAX` may be used in lieu of integer literals.");
exports.WITH_COMPONENT_DEFINITION = new vscode_1.MarkdownString("An ASN.1 constraint that applies constraints on the individual elements \
encoded in a structured type uniformly.");
exports.WITH_COMPONENTS_DEFINITION = new vscode_1.MarkdownString("An ASN.1 constraint that applies constraints on the individual elements \
encoded in a structured type in a discriminatory manner.");
exports.PATTERN_DEFINITION = new vscode_1.MarkdownString("An ASN.1 constraint that requires a character string type to match an \
expression that uses a syntax similar to, but different from, POSIX \
regular expressions.");
exports.INCLUDES_DEFINITION = new vscode_1.MarkdownString("An ASN.1 constraint that requires a type to accept additional values, \
which can be obtained from the permissible values of another type.");
exports.FROM_DEFINITION = new vscode_1.MarkdownString("An ASN.1 constraint that limits the characters from which a character \
string may be constructed to an explicit list of characters.");
exports.PRESENT_DEFINITION = new vscode_1.MarkdownString("An ASN.1 constraint that requires that a specific element of a structured \
type be present, though it is normally `OPTIONAL`.");
exports.ABSENT_DEFINITION = new vscode_1.MarkdownString("An ASN.1 constraint that requires that a specific element of a structured \
type be absent, though its presence is normally required or `OPTIONAL`.");
exports.ENCODED_BY_DEFINITION = new vscode_1.MarkdownString("An ASN.1 constraint that constrains the contents of `OCTET STRING` to a \
specific encoding indicated by the subsequent `OBJECT IDENTIFIER`.");
exports.ALL_EXCEPT_DEFINITION = new vscode_1.MarkdownString("An ASN.1 constraint that limits the contents of a type to all values but an \
explicit list of exceptions from the parent type.");
exports.INTERSECTION_DEFINITION = new vscode_1.MarkdownString("An ASN.1 constraint that limits the contents of a type to only those that are \
permitted by both the two surrounding types.");
exports.UNION_DEFINITION = new vscode_1.MarkdownString("An ASN.1 constraint that limits the contents of a type to only those that are \
permitted by at least one of the two surrounding types.");
exports.EXCEPT_DEFINITION = new vscode_1.MarkdownString("An ASN.1 constraint that limits the contents of a type to only those that are \
permitted by the left-hand type and not permitted by the right-hand type.");
exports.CONSTRAINED_BY_DEFINITION = new vscode_1.MarkdownString("An ASN.1 constraint that allows for free-text constraints in the form of a \
comment enclosed in the following curly brackets.");
exports.DEFAULT_DEFINITION = new vscode_1.MarkdownString("An ASN.1 keyword that declares the default value for a member of a constructed \
type if a value for this member is not given.");
exports.OPTIONAL_DEFINTION = new vscode_1.MarkdownString("An ASN.1 keyword that declares the member of a constructed type to be optional.");
//# sourceMappingURL=constraints.js.map