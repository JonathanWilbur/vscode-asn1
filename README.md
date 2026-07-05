# ASN.1 VS Code Extension

Currently in progress.

## To Do

- [ ] Configurable file selection
- [ ] Configurable file ignores
- [ ] Configurable linemax
- [ ] Configurable spaces / tabs
- [ ] Configurable EOL
- [ ] Configurable Diagnostics
- [ ] Configurable Export EOL
- [ ] Configurable strict module match (particularly in FAR)
- [ ] Cancellation for long-running commands

## Disabling Diagnostics

It can be annoying to get diagnostics for an ASN.1 file that you are in the
process of editing, because it might be invalid until it is done, and repeatedly
analyzing it for diagnostics wastes computing power and creates visual clutter
with all of the "squiggles." To disable diagnostics, add a comment to the top of your
ASN.1 file that starts with `no_diagnose`, such as `-- no_diagnose` or
`/* no_diagnose */`. This will only have an effect if it is on the first line.

If this special comment is present, it will be a lone warning diagnostic for
the file, just to remind you that you have otherwise disabled diagnostics.

## Future To Dos

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
