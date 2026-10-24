# Change Log

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

See the [README](./README.md) for information on versioning.

## [1.2.2]

- Stop flagging an `ENUMERATED` extension number that sits below a root number
  when it is still greater than every earlier extension number (ITU-T X.680,
  clause 20.4).
- Format whitespace after the last arc of an imported module object identifier.
- Several fixes from upstream changes in the ASN.1 parser:
  - Groking an object set no longer crashes when `EXCEPT` or another
    element position contains a parenthesized element set, such as
    `EXCEPT (referral | in-DSAReferral)`. The parenthesized set is kept in the
    abstract syntax tree.
  - Make `ProductionType` an erasable union of constant strings.
    This might not actually break your code, depending on what you're doing.
  - Replace the remaining enums (`AssignmentType`, `FieldSpecType`,
    `TaggingMode`, `TypeType`, `ValueType`, `ValueAssignmentType`,
    `SelectionOption`, `LogLevel`, and `ASN1UniversalType`) with const objects
    and unions, and enable `erasableSyntaxOnly`. Member values are unchanged, and
    each type is the union of those values, so a matching string or number
    literal is assignable where the old enum member type was required.
    `LogLevel` and `ASN1UniversalType` no longer have numeric-enum reverse
    mappings. `ASN1UniversalType.boolean` is still the value `1`; use
    `typeof ASN1UniversalType.boolean` when that member is needed as a type.
    Constructor parameters that previously declared properties are now ordinary
    fields assigned in the constructor.
  - Reject an absolute `OBJECT IDENTIFIER` whose first arc uses a name that is
    not a recognized root arc name for that number (`itu-t` / `ccitt` for 0,
    `iso` for 1, `joint-iso-itu-t` / `joint-iso-ccitt` for 2). A single arc
    numbered 0, 1, or 2 was previously accepted, so `{ pkiAttributeType(2) }`
    was not reported; that form is now an error suggesting the prefix notation
    `{ pkiAttributeType 2 }`.
  - Fix `RELATIVE-OID` parsing
  - Report nameless CHOICE alternatives and SET or SEQUENCE components (ancient
    ASN.1 syntax that X.680 no longer allows) as a syntax error instead of
    crashing with `TypeError: Cannot read properties of undefined (reading 'type')`.
  - More descriptive error when encountering a totally empty object set `{ }`.
    (Not valid syntax, but `{...}` is.)
  - Merge imports from the same module
    - Even though this is invalid, the way to handle this is still obvious.
  - Slightly better (but still incorrect) symbol resolution in `resolve()`
  - Handle whitespace in between parameterized imported references

## [1.2.1] - 2026-09-12

- Fix re-parsing of `Setting`s that are `typereference`s as `ValueSet`s.

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
