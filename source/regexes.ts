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