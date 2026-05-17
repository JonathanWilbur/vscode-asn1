import { MarkdownString } from "vscode";

export const DEFINITIONS_DEFINITION : MarkdownString = new MarkdownString(
"An ASN.1 keyword that follows the name of a module."
);

export const BEGIN_DEFINITION : MarkdownString = new MarkdownString(
"An ASN.1 keyword that marks the start of the definitions of an ASN.1 module."
);

export const END_DEFINITION : MarkdownString = new MarkdownString(
"An ASN.1 keyword that marks the end of the definitions of an ASN.1 module."
);

export const IMPORTS_DEFINITION : MarkdownString = new MarkdownString(
"An ASN.1 keyword that leads a comma-delimited list of definitions that the \
current ASN.1 module imports from other ASN.1 modules for use."
);

export const EXPORTS_DEFINITION : MarkdownString = new MarkdownString(
"An ASN.1 keyword that leads a comma-delimited list of definitions that the \
current ASN.1 module exports for use in other ASN.1 modules."
);

export const EXPLICIT_TAGS_DEFINITION : MarkdownString = new MarkdownString(
"A phrase of ASN.1 keywords used in the module header that makes all tags of \
a SEQUENCE, SET, or CHOICE encode using `EXPLICIT` mode by default."
);

export const IMPLICIT_TAGS_DEFINITION : MarkdownString = new MarkdownString(
"A phrase of ASN.1 keywords used in the module header that makes all tags of \
a SEQUENCE, SET, or CHOICE encode using `IMPLICIT` mode by default."
);

export const AUTOMATIC_TAGS_DEFINITION : MarkdownString = new MarkdownString(
"A phrase of ASN.1 keywords used in the module header that makes all tags of \
a SEQUENCE, SET, or CHOICE encode using `IMPLICIT` mode with context-specific \
tag classes, and with each member of said structured type automatically being \
assigned auto-incrementing tag numbers."
);

export const EXTENSIBILITY_IMPLIED_DEFINITION : MarkdownString = new MarkdownString(
"A phrase of ASN.1 keywords used in the module header that makes all \
structured types implicitly extensible, which is normally indicated \
explicitly by appending a comma followed by the extensibility ellipses, '...', \
at the end of the members list of a structured type definition."
);

export const TAGS_DEFINITION : MarkdownString = new MarkdownString(
"A keyword in the header of an ASN.1 module that globally declares the tagging \
mode. The keyword before it must be either `EXPLICIT`, `IMPLICIT`, or \
`AUTOMATIC`."
);