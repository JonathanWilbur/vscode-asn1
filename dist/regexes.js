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
//# sourceMappingURL=regexes.js.map