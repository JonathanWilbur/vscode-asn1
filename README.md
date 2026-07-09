# ASN.1 VS Code Extension

It's been seven long years, but it's time for a face lift. I have updated this
extension to perform proper ASN.1 parsing using my
[`@wildboar/asn1-parser`](https://jsr.io/@wildboar/asn1-parser) module, which
will result in better quality and more features than the previous
implementation.

## Features

- Syntax Highlighting
- Bracket Completion
- Snippets
- Document Symbols (Outline) for all modules, imported modules, and assignments
- Hovers, including for ASN.1 keywords, built-in information object classes,
  such as `TYPE-IDENTIFIER` and `ABSTRACT-SYNTAX`.
- Go To Definition
- Go To Type Definition: goes to the type assignment or object class assignment
  for a given `DefinedValue` or `DefinedObject`
- Find All References
- Rename
- Folding Ranges at assignments and modules
- Code Actions: mostly just removing duplicate or unused imports
- Both Inline and Dropdown Completions
- Formatting (Very conservative: basically does not touch your assignments)
- Selection Ranges
- Signature Help when you are using parameterized assignments
- Workspace Symbols
  - This only provides symbols that have appeared in a parsed file already.
  - It incrementally gets populated, instead of parsing everything upfront.
- Document Symbol Highlighting
- Diagnostics
  - Duplicate, unused, and undefined symbols, imports, exports, modules, etc.
  - Duplicate named bits, integers, `ENUMERATED` variants
  - Malformed `OBJECT IDENTIFIER`s
  - Malformed strings and time types
  - `COMPONENTS OF` referring to an invalid type
- Commands
  - Refresh ASN.1 Diagnostics
  - Export All Object Identifiers in Current File to CSV
  - Export All Object Identifiers in Entire Workspace to CSV
  - Export All ASN.1 Imports and Exports in Current File to CSV
  - Export All ASN.1 Imports and Exports in Entire Workspace to CSV
  - Export All ASN.1 Modules in Current File to CSV
  - Export All ASN.1 Modules in Entire Workspace to CSV
  - Export All ASN.1 Assignments in Current File to CSV
  - Export All ASN.1 Assignments in Entire Workspace to CSV
  - Export All ASN.1 Modules in Current File to JSON

The few remaining features that were not implemented were intentional: deemed
to be low value or non-sensical. The features that were implemented are often
imperfect.

## Non-Features

This VS code extension does **NOT**:

- Completely validate your ASN.1 at a semantic level
- Check that values match types and vice versa
- Ensure valid defined syntax in information object assigments
- Validate Encoding Control Notation (ECN)
- Validate that all imported symbols exist in the modules from whence they are imported
- Perform perfectly thorough date and time validation: validation is "good
  enough" and can miss some mistakes

Part of these shortcomings owe to deficiencies in my `@wildboar/asn1-parser`
module (though its pretty good now, I had no experience writing parsers or any
kind of language validation before). I cannot realistically improve upon this
much other than by spending several months re-writing module (`P4 / WONTFIX`).

There are probably other shortcomings I haven't listed above. I welcome PRs
that aren't entirely AI slop.

## Configuration

Here are the configuration options:

```json
{
  "asn1.includeFiles": {
    "type": "string",
    "default": "**/*.{asn,asn1}",
    "description": "Glob matching ASN.1 files in this workspace."
  },
  "asn1.excludeFiles": {
    "type": "string",
    "default": "**/{node_modules,dist,out,build,.git}/**",
    "description": "Glob matching ASN.1 files in this workspace."
  },
  "asn1.enableDiagnostics": {
    "type": "boolean",
    "default": true,
    "description": "Enable diagnostics for ASN.1 files."
  },
  "asn1.strictModuleOidMatch": {
    "type": "boolean",
    "default": true,
    "description": "Match modules strictly, by OID, respecting WITH SUCCESSORS and WITH DESCENDANTS. If false, modules are only matched by name."
  },
  "asn1.maxLineLength": {
    "type": "number",
    "minimum": 1,
    "description": "Maximum preferred line length, used in formatting"
  },
  "asn1.exportEndOfLine": {
    "type": "string",
    "enum": [
      "lf",
      "crlf"
    ],
    "description": "Line endings for CSV exports. Defaults to the line endings of the source ASN.1 file."
  }
}
```

## Snippets

Here are the snippets:

- `seq`: create a `SEQUENCE`
- `set`: create a `SET`
- `setof`: create a `SET OF`
- `seqof`: create a `SEQUENCE OF`
- `cho`: create a `CHOICE`
- `oid`: create an `OBJECT IDENTIFIER`

There are a few others, but not that you are likely to use them.

## Disabling Diagnostics

It can be annoying to get diagnostics for an ASN.1 file that you are in the
process of editing, because it might be invalid until it is done, and repeatedly
analyzing it for diagnostics wastes computing power and creates visual clutter
with all of the "squiggles." To disable diagnostics, add a comment to the top of your
ASN.1 file that starts with `no_diagnose`, such as `-- no_diagnose` or
`/* no_diagnose */`. This will only have an effect if it is on the first line.

If this special comment is present, it will be a lone warning diagnostic for
the file, just to remind you that you have otherwise disabled diagnostics.

You can also globally disable diagnostics by setting `enableDiagnostics` to
`false`.

## AI / LLM Usage Statement

Almost none of the code in this repository was written AI / LLMs, except a few
tests and a few small functions. The vast majority of it was written by yours
truly.

## Future To Dos

- [ ] Check for duplicate parameter names
- [ ] Only suggest suitable types after `COMPONENTS OF`
- [ ] Code action to remove entire `SymbolsFromModule` if no symbols are used
- [x] JSDoc
- [ ] Screenshots
- [ ] Provenance
- [ ] Unit Tests
  - [ ] Go to Definition
    - [ ] Symbol
    - [ ] Module
    - [ ] Module without strict OID matching
  - [ ] Highlights (just do a snapshot test with this)
  - [ ] Hover (you can just do this with a single file)
  - [ ] Rename: forward and reverse gives you the exact same original file
  - [ ] Reparsing
  - [ ] Selection Range: for every selection range produced anywhere in the doc, parent is a broader range
  - [ ] Signature Help
    - [ ] Single parameter
    - [ ] Multiple parameters
    - [ ] Parameter with governor
  - [ ] Symbols: just check that there is one for each assignment, at least.
  - [ ] Type Definition Resolution: just a basic check
  - [ ] Workspace Symbols: just check that there are some, at least for the open document and one other
- [ ] Propose merging duplicate modules
- [ ] Export X.500 Information Objects? (Support LDIF as well)
  - I am taking a break from this. It's just way too complicated for something I'll want as a one-off.
- [ ] Warnings
  - [ ] (MIN..MAX) unnecessary
  - [ ] GeneralString use is discouraged (Page 182 Dubuisson)
  - [ ] GraphicString use is discouraged (Page 182 Dubuisson)
- [ ] Errors
  - [ ] Constraints
    - [ ] Cannot have negative SIZE
    - [ ] No leading 0 on SIZE constraint
    - [ ] Make sure SIZE is only applied to types that support it
    - [ ] Range boundaries: minimum greater than maximum in SIZE
    - [ ] Range boundaries: minimum greater than maximum
    - [ ] Leading or Trailing "|" Alternation Operator in FROM
    - [ ] FROM range cannot span multi-character strings
    - [ ] PATTERN validation
  - [ ] Leading zeros in numeric literal (X.680 S 12.8)
