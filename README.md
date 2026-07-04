# ASN.1 VS Code Extension

Currently in progress.

## Disabling Diagnostics

It can be annoying to get diagnostics for an ASN.1 file that you are in the
process of editing, because it might be invalid until it is done, and repeatedly
analyzing it for diagnostics wastes computing power and creates visual clutter
with all of the "squiggles." To disable diagnostics, add a comment to the top of your
ASN.1 file that starts with `no_diagnose`, such as `-- no_diagnose` or
`/* no_diagnose */`. This will only have an effect if it is on the first line.

If this special comment is present, it will be a lone warning diagnostic for
the file, just to remind you that you have otherwise disabled diagnostics.

## To Do

- [ ] Cache OID resolution (cache key being uri + version + module name + module offset)
- [x] Ignore Diagnostics comment: `-- asn1: ignore_diagnostic`
- [ ] Use the new specialized errors to report more precise problems
- [ ] Better bracket completion
- [ ] Avoid re-parsing the file before where changes were made
- [ ] CodeLens: Convert to and from defined syntax
- [ ] CodeLens or Right-Click: Display defined syntax
- [ ] Hovers for `TYPE-IDENTIFIER.&Type` et. al.
- [ ] Inline Completions
  - [ ] `CLASS`
  - [ ] `WITH SYNTAX`
  - [ ] `(1..MAX)` and other ranges
- [x] Format Document / Format Range
- [ ] Snippets
  - [ ] `seq`
  - [ ] `set`
  - [ ] `mod`
  - [ ] `oid`
  - [ ] `cls`
- [ ] If you encounter a syntax error (due to `RealValue`s using the structured alternative), the diagnostic never goes away.
- [ ] Export X.500 Information Objects? (Support LDIF as well)
  - I am taking a break from this. It's just way too complicated for something I'll want as a one-off.

## Other To Dos

- [ ] Hints
  - [ ] Consider using GeneralizedTime instead of UTCTime
  - [ ] EXTENSIBILITY IMPLIED, so trailing ... is not necessary*
  - [ ] Consider adding an exception marker
  - [ ] Consider shortening this OBJECT IDENTIFIER line by joining OBJECT IDENTIFIERs
  - [ ] Consider adding explicit numbers to `ENUMERATED`
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
  - [ ] Trailing Comma
  - [ ] Leading zeros in numeric literal (X.680 S 12.8)
- [ ] Formatting
  - [ ] One single space between moustaches and content
  - [ ] Single spaces surrounding "::="
  - [ ] One blank line between definitions
  - [ ] Single space between SIZE and parentheses
  - [ ] ENUMERATED members indented on separate newlines
  - [ ] Named BIT STRING members indented on separate newlines
  - [ ] Named INTEGER members indented on separate newlines
  - [ ] Structured REAL all on the same line
  - [ ] BOOLEAN all on one line
  - [ ] OBJECT IDENTIFIER and RELATIVE-OID all on the same line
  - [ ] Support multi-line keyword duplication checking
