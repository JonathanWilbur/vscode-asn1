# Change Log

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

See the [README](./README.md) for information on versioning.

## [Unreleased]

## [1.2.0] - 2026-09-06

- Fix malformed hovers, such as for `DURATION`
- Fix several parsing issues (by upgrading `@wildboar/asn1-parser`)
- Stop flagging implicitly imported `ENUMERATED` variants, named integers, and
  named bits as undefined symbols.
- Add `asn1.alwaysDefined` configuration and a "Treat as defined" quick fix.
- Add a command to re-index named bits, integers, and enumerated variants.
- Fix imported objects used in sets that appear as settings in an `ObjectDefn`
  (for example `SUBCLASS OF {top}`) being flagged as unused.
- Huge performance and quality improvements in the ASN.1 parsing

## [1.1.0] - 2026-07-12

- Display `DefaultSyntax` equivalent of an information object when hovering
  over a `Literal` in an information object defined using the `DefinedSyntax`.

## [1.0.1] - 2026-07-12

- Add screenshot of hover over `OBJECT IDENTIFIER` to `README.md`
- Fix ugly gallery banner theme
- Pin GitHub Actions versions

## [1.0.0] - 2026-07-12

- Complete Re-write using the
  [`@wildboar/asn1-parser`](https://jsr.io/@wildboar/asn1-parser) ESM module.
