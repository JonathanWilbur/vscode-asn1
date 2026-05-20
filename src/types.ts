import { lex } from "@wildboar/asn1-parser";

export type FileURIStr = string;
export type VersionNumber = number;
export type ASN1ModuleName = string;

export type YieldType<T> =
    T extends IterableIterator<infer Y> ? Y : never;

export type LexedTokens = YieldType<ReturnType<typeof lex>>[];

// Inspired by Rust
export type Result<T, E = unknown> =
    { ok: T }
    | { err: E };

export interface VersionNumbered<T> {
    readonly version: number;
    readonly item: T;
}
