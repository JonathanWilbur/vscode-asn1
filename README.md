# ASN.1 VS Code Extension

Current in progress.

## To Do

- [ ] Use different symbol kinds for X.500 object classes?
- [ ] Auto indentation
- [ ] Folding (by markers)
- [ ] Make hover not apply within defined syntax or ECN sections
  - [ ] Maybe not do hovers for `OBJECT IDENTIFIER` as well.
- [ ] Hover: display `UTCTime` and `GeneralizedTime` values in human-friendly format
- [ ] Hover: display `OBJECT IDENTIFIER` values with encodings / OID info URLs, etc.
- [ ] Hover: display `BIT STRING` and `OCTET STRING` as hexadecimal, binary, etc.
- [ ] Hover: display `INTEGER` as X.690 encoding
- [ ] Hover: display `NULL` as X.690 encoding
- [ ] Hover: display `BOOLEAN` as X.690 encoding
- [ ] Hover: display `DURATION` in human-friendly format
- [ ] Hover: display `DATE`, `DATE-TIME`, `TIME` in human friendly format
- [ ] Hover: display `RELATIVE-OID` with X.690 encoding
- [ ] Hover: display `hstring` as `bstring` equivalent and vice versa
- [ ] Commands for generating encodings from values
- [ ] Code Action: remove duplicate import
- [ ] Code Action: include missing import? (this would be kind of computationally expensive)
- [ ] CodeLens: Convert to and from defined syntax
- [ ] CodeLens or Right-Click: Display defined syntax
- [ ] Format Document / Format Range
  - [ ] Format imports
  - [ ] One newline between all assignments that themselves are more than one line.
  - [ ] All object assignments using defined syntax that aren't already single-line get one line per setting, indented
  - [ ] Same indents for `SET`, `SEQUENCE` and `CHOICE`
  - [ ] `ENUMERATED`, `INTEGER`, and `BIT STRING` types: one line or one line per named value
  - [ ] `OBJECT IDENTIFIER` single space between arcs, wrapping to 80 characters if multi-line
  - [ ] Single space between assignment token `::=`
  - [ ] No spaces between parameters and brackets
  - [ ] Inline completions
- Diagnostics: validate `DATE`

## Features Requiring Indexing the Workspace 

In addition to "ghetto-indexing" using just lexical token streams, you could parallelize the indexing per file.

Actually, I think my plans for this are on pause: I thought that VS Code had an API for doing full text
searches, but it turns out this is wrong (these APIs are proposed / insiders only). So there is no way to
pre-filter files that contain identifiers sought (e.g. in go-to-defintiion, rename, find all refs, etc.).

It also means, unless I am willing to accept expecting the file name to match the module name, that I can only:

A. Pre-index every ASN.1 module, so I know where the modules are, or
B. Do no indexing at all and abandon these features until the text-search API comes out.

[This](https://github.com/microsoft/vscode/issues/59924) is the VS Code issue for the text search API. It
seems like it could be years before it is released, but it also seems like it is ready to be released, so
maybe I'll just wait on this.

Then again, maybe you could just look at how fast it is.

One other thing: whether you filter based on contents or merely search all `.asn1?` files, ultimately, you
are going to get a list of file URIs, and you are going to parse those URIs, so maybe you should just go
ahead and implement an API to parse a document by its URI, or retrieve the cached parsing. It will be a
really easy cutover once the text search API is implemented.

Even better: I think you can just change `getParserOutputs` to take a file URI instead, then using the URI, you can
use `openTextDocument` like so:

```
const file = await vscode.workspace.openTextDocument(uri);
```

The above _does not_ open a tab (I checked that there is a separate API for doing this); it just opens the
file for reading without changing the UI, to be clear. It also says immediately in the JSDoc that the
function returns immediately if the document is already open, so taking a URI when you already have an open
doc should have no (or very little) overhead.

So currently:

- Extend the API of `getParserOutputs` to stop at lexing (or parsing).
- If lexing was fine, continue parsing, if requested later, and so on.
- Index what modules are defined where:
  - Use `getParserOutputs` to get lexical tokens
  - Pick out module identifiers
  - Cache modules defined by file URI
  - Put those module identifiers in a map to the file URIs + versions.
  - I really hate using forward and reverse maps. This has a bad code smell.

What is to be decided upon now: is just identifying the modules enough? Or do I need to parse and index all imports?
Imports being parsed would make find-all-references less costly, but then again, FAR would still require parsing
each module comple

- Makes FAR slightly faster because more modules can be ruled out
- Makes re-exported `Defined*` resolution much faster (kind of an edge case, though)
- But the startup time is going to be a lot higher.

- [ ] Signature Help for Information Objects
  - Gracefully fallible, so does not have to be great.
  - Look up the object class (could maybe be done lazy via text search e.g. `IOC-IDENTIFIER\s+::=\s+CLASS\s+\{`)
  - Maybe support configuration for defined syntaxes?
- [ ] Signature Help for Parameterized Assignments
  - Gracefully fallible, so does not have to be great.
  - Could use text search as a lazy short-cut, e.g. `Identifier\s*\{`
- [ ] Rename symbol (basically same implementation as Find all references)

## Other To Dos

- [ ] Hover Info
  - [ ] DEFAULT
  - [ ] OPTIONAL
  - [ ] EXPLICIT
  - [ ] IMPLICIT
  - [ ] TRUE
  - [ ] FALSE
  - [ ] TAGS
  - [ ] ~~Display dates in a more human friendly format~~ (This cannot be done _well_ until VS Code supports named regex capture groups.)
  - [ ] Support aliases
    - [ ] ISO646String
    - [ ] EmbeddedPDV
    - [ ] External
    - [ ] TeletexString
- [ ] Hints
  - [ ] Consider using GeneralizedTime instead of UTCTime
  - [ ] EXTENSIBILITY IMPLIED, so trailing ... is not necessary*
  - [ ] Consider adding an exception marker
  - [ ] Consider shortening this OBJECT IDENTIFIER line by joining OBJECT IDENTIFIERs
- [ ] Warnings
  - [ ] (MIN..MAX) unnecessary
  - [ ] GeneralString use is discouraged (Page 182 Dubuisson)
  - [ ] GraphicString use is discouraged (Page 182 Dubuisson)
  - [ ] INTEGER is too big to encode in 32 bits
- [ ] Errors
  - [ ] Module*
    - [ ] BEGIN with no END*
    - [ ] END with no BEGIN*
  - [ ] Tag
    - [ ] Contradictory APPLICATION and PRIVATE
    - [ ] Contradictory UNIVERSAL and APPLICATION
    - [ ] Contradictory UNIVERSAL and PRIVATE
    - [ ] Cannot have negative tag number
    - [ ] No leading 0 on tag number
    - [ ] Contradictory EXPLICIT and IMPLICIT
  - [ ] Structured Types
    - [ ] Contradictory OPTIONAL and PRESENT
    - [ ] Contradictory OPTIONAL and ABSENT
    - [ ] Contradictory PRESENT and ABSENT
    - [ ] Contradictory OPTIONAL and DEFAULT
    - [ ] Duplicated context-specific tag numbers
  - [ ] Types
    - [ ] INTEGER
      - [ ] Named values
    - [ ] OBJECT IDENTIFIER
      - [ ] Leading OID node greater than 2
      - [ ] Second OID node greater than 175
      - [ ] OID node cannot be negative
      - [ ] OID mismatch between node descriptor and node number (e.g. iso(2))
    - [ ] Invalid UTCTime
    - [ ] Invalid GeneralizedTime
    - [ ] Invalid character in string type
      - [ ] NumericString
      - [ ] PrintableString
      - [ ] VisibleString
    - [ ] Invalid character in binary string
    - [ ] Invalid character in hexadecimal string
    - [ ] ENUMERATED 
      - [ ] Duplicated numbers in ENUMERATED (e.g. { on(0), off(1), out-of-order(2), idle(1) })
    - [ ] REAL
    - [ ] BOOLEAN
    - [ ] BIT STRING
      - [ ] BIT STRING can be an hstring too.
      - [ ] BIT STRING can also be a list of named identifiers, which indicates which bits are set.
      - [ ] BIT STRING subtypes can specify bit numbers in parentheses next to the identifiers.
    - [ ] OCTET STRING
      - [ ] OCTET STRING can be a bstring too.
    - [ ] RELATIVE-OID
  - [ ] Constraints
    - [ ] Cannot have negative SIZE
    - [ ] No leading 0 on SIZE constraint
    - [ ] Make sure SIZE is only applied to types that support it
    - [ ] Range boundaries: minimum greater than maximum in SIZE
    - [ ] Range boundaries: minimum greater than maximum
    - [ ] Leading or Trailing "|" Alternation Operator in FROM
    - [ ] FROM range cannot span multi-character strings
    - [ ] PATTERN validation
      - [ ] Unbalanced set `[]` brackets
      - [ ] Unbalanced option `{}` brackets
      - [ ] Unrecognized backslash escape
      - [ ] Trailing alternation pipe
      - [ ] Unbalanced grouping `()` brackets
      - [ ] Nothing to repeat
      - [ ] Invalid range
  - [ ] Extensions
    - [ ] Negative version number
  - [ ] Undefined type
  - [ ] Field cannot have two different types "e.g. OBJECT IDENTIFIER REAL"
  - [ ] Unmatched Brackets
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
- [ ] Go to definitions
- [ ] Solution explorer (I believe this is contingent upon symbol lookup working)
- [ ] Common type definitions
- [ ] Commands
  - [ ] Append extensibility
  - [ ] Make all tags context specific
  - [ ] Show BER Encoding
  - [ ] Show DER Encoding
- [ ] Code completion
- [ ] Possible actions on errors or warnings
- [ ] Try to make diagnostics span lines (Look into document.positionAt)
- [ ] Rename Symbol
- [ ] Code Lens?
- [ ] Create enum for tagging mode
- [ ] Create the newer data types
