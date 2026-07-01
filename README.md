# ASN.1 VS Code Extension

Currently in progress.

## To Do

- [ ] Ignore Diagnostics comment: `-- asn1: ignore_diagnostic`
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
- [ ] If you encounter a syntax error (due to `RealValue`s using the structured alternative), the diagnostic never goes away.
- [x] Export Object Identifiers as CSV
- [ ] Export ASN.1 Dependency Graph as CSV
- [ ] Export Object Identifiers as JSON
- [ ] Export ASN.1 Dependency Graph as JSON

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
