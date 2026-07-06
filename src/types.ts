import type { NameAndOrNumber } from "@wildboar/asn1-parser";

export type FileURIStr = string;
export type VersionNumber = number;
export type ASN1ModuleName = string;
export type ASN1Reference = string;

// Inspired by Rust
export type Result<T, E = unknown> =
    { ok: T }
    | { err: E };

export interface VersionNumbered<T> {
    readonly version: number;
    readonly item: T;
}

/**
 * This type is used as a key in a `Set` or `Map` to index the identifiers that
 * are imported within a module.
 */
export type ImportKey = `${ASN1ModuleName}:${ASN1Reference}`;

export interface ModuleInfo {
    name: string;
    oid?: NameAndOrNumber[],
    imports: Set<ImportKey>;
}
