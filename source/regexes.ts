// Sourced from Section 12 of ITU Recommendation X.680.
export const typereference : RegExp = /^[A-Z][A-Za-z0-9\-]*[A-Za-z0-9]$/; // TODO: Two subsequent hyphens are banned
export const identifier : RegExp = /^[a-z][A-Za-z0-9\-]*[A-Za-z0-9]$/; // TODO: Two subsequent hyphens are banned
export const valuereference : RegExp = identifier;
export const modulereference : RegExp = typereference;
// export const comment : RegExp = /^$/;
export const empty : RegExp = /^$/;
export const number : RegExp = /^\d+$/;
export const realnumber : RegExp = /^\d+(?:\.\d*)?(?:(e|E)\-?(0|(?:[1-9]\d*)))?$/;
export const bstring : RegExp = /^'[01\s]*'B$/;
export const hstring : RegExp = /^'[0-9A-F\s]*'H$/;
export const cstring : RegExp = /^"[^"]*"$/;
// export const xmlbstring : RegExp = /^$/;
// export const xmlhstring : RegExp = /^$/;
// export const xmlcstring : RegExp = /^$/;
// export const xmlasn1typename : RegExp = /^$/;
export const simplestring : RegExp = /^[ !"#\$%&'\(\)\*\+,\-\.\/0-9:;<=>?@A-Z\[\\\]\^_`a-z\{\|\}~]*$/; // UCS-1 0d32 - 0d126
export const tstring : RegExp = /^[0-9\+\-:\.,\/CDHMRPSTWYZ]*$/;
// export const xmltstring : RegExp = /^$/;
export const psname : RegExp = /^[A-Z][A-Za-z0-9\-]*[A-Za-z0-9]$/;
export const encodingreference : RegExp = typereference;
export const integerUnicodeLabel : RegExp = /^(0|(?:[1-9]\d*))$/;
export const nonIntegerUnicodeLabel : RegExp = /^[\._~0-9A-Za-z\u00A0-\uDFFE\uF900-\uFDCF\uFDF0-\uFFEF\u{10000}-\u{1FFFD}\u{20000}-\u{2FFFD}\u{30000}-\u{3FFFD}\u{40000}-\u{4FFFD}\u{50000}-\u{5FFFD}\u{60000}-\u{6FFFD}\u{70000}-\u{7FFFD}\u{80000}-\u{8FFFD}\u{90000}-\u{9FFFD}\u{A0000}-\u{AFFFD}\u{B0000}-\u{BFFFD}\u{C0000}-\u{CFFFD}\u{D0000}-\u{DFFFD}\u{E0000}-\u{EFFFD}]*$/u;
export const extendedTrue : RegExp = /^(1|(?:true))$/;
export const extendedTalse : RegExp = /^(1|(?:false))$/;
// export const xmlasn1typename : RegExp = /^$/;