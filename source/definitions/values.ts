import { MarkdownString } from "vscode";

export const MIN_DEFINITION : MarkdownString = new MarkdownString(
"An ASN.1 keyword that denotes the minimum value of the parent type."
);

export const MAX_DEFINITION : MarkdownString = new MarkdownString(
"An ASN.1 keyword that denotes the maximum value of the parent type."
);

export const PLUS_INFINITY_DEFINITION : MarkdownString = new MarkdownString(
"An ASN.1 keyword that refers to a `REAL` with a value of positive infinity."
);

export const MINUS_INFINITY_DEFINITION : MarkdownString = new MarkdownString(
"An ASN.1 keyword that refers to a `REAL` with a value of negative infinity."
);

export const NOT_A_NUMBER_DEFINITION : MarkdownString = new MarkdownString(
"An ASN.1 keyword that refers to a `REAL` with a non-number value (NaN)."
);