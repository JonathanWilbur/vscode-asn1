"use strict";
exports.__esModule = true;
// Sourced from Section 12 of ITU Recommendation X.680.
exports.typereference = /^[A-Z][A-Za-z0-9\-]*[A-Za-z0-9]$/; // TODO: Two subsequent hyphens are banned
exports.identifier = /^[a-z][A-Za-z0-9\-]*[A-Za-z0-9]$/; // TODO: Two subsequent hyphens are banned
exports.valuereference = exports.identifier;
exports.modulereference = exports.typereference;
// export const comment : RegExp = /^$/;
exports.empty = /^$/;
exports.number = /^\d+$/;
exports.realnumber = /^\d+(?:\.\d*)?(?:(e|E)\-?(0|(?:[1-9]\d*)))?$/;
exports.bstring = /^'[01\s]*'B$/;
exports.hstring = /^'[0-9A-F\s]*'H$/;
exports.cstring = /^"[^"]*"$/;
// export const xmlbstring : RegExp = /^$/;
// export const xmlhstring : RegExp = /^$/;
// export const xmlcstring : RegExp = /^$/;
// export const xmlasn1typename : RegExp = /^$/;
exports.simplestring = /^[ !"#\$%&'\(\)\*\+,\-\.\/0-9:;<=>?@A-Z\[\\\]\^_`a-z\{\|\}~]*$/; // UCS-1 0d32 - 0d126
exports.tstring = /^[0-9\+\-:\.,\/CDHMRPSTWYZ]*$/;
// export const xmltstring : RegExp = /^$/;
exports.psname = /^[A-Z][A-Za-z0-9\-]*[A-Za-z0-9]$/;
exports.encodingreference = exports.typereference;
exports.integerUnicodeLabel = /^(0|(?:[1-9]\d*))$/;
exports.nonIntegerUnicodeLabel = /^[\._~0-9A-Za-z\u00A0-\uDFFE\uF900-\uFDCF\uFDF0-\uFFEF\u{10000}-\u{1FFFD}\u{20000}-\u{2FFFD}\u{30000}-\u{3FFFD}\u{40000}-\u{4FFFD}\u{50000}-\u{5FFFD}\u{60000}-\u{6FFFD}\u{70000}-\u{7FFFD}\u{80000}-\u{8FFFD}\u{90000}-\u{9FFFD}\u{A0000}-\u{AFFFD}\u{B0000}-\u{BFFFD}\u{C0000}-\u{CFFFD}\u{D0000}-\u{DFFFD}\u{E0000}-\u{EFFFD}]*$/u;
exports.extendedTrue = /^(1|(?:true))$/;
exports.extendedTalse = /^(1|(?:false))$/;
// export const xmlasn1typename : RegExp = /^$/;
//# sourceMappingURL=regexes.js.map