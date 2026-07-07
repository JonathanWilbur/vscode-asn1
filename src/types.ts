import type { NameAndOrNumber } from "@wildboar/asn1-parser";

/**
 * File URI as a string
 */
export type FileURIStr = string;

/**
 * Version number. An unsigned integer.
 */
export type VersionNumber = number;

/**
 * ASN.1 module name, such as `InformationFramework`.
 */
export type ASN1ModuleName = string;

/**
 * ASN.1 symbol / reference, such as would be imported or defined in a module,
 * such as `commonName`.
 */
export type ASN1Reference = string;

/**
 * Result type, inspired by Rust's `Result` type. A tagged union with
 * `ok` and `err` values of type `T` and `E`.
 */
export type Result<T, E = unknown> =
    { ok: T }
    | { err: E };

/**
 * Something associated with a version number.
 */
export interface VersionNumbered<T> {
    /** The version number. An unsigned integer. */
    readonly version: VersionNumber;
    /** The item associated with the version number. */
    readonly item: T;
}

/**
 * This type is used as a key in a `Set` or `Map` to index the identifiers that
 * are imported within a module.
 */
export type ImportKey = `${ASN1ModuleName}:${ASN1Reference}`;

/**
 * ASN.1 module information
 */
export interface ModuleInfo {
    /** The module name */
    name: string;
    /** The object identifier as an array of arcs */
    oid?: NameAndOrNumber[],
    /**
     * An index of imports as a `Set` of `strings` of the form
     * `ModuleName:Symbol`.
     */
    imports: Set<ImportKey>;
}
