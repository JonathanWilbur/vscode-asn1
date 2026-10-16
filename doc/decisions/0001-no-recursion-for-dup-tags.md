---
status: accepted
date: 2026-10-16
decision-makers: Jonathan M. Wilbur
consulted: N/A
informed: N/A
authored-by-ai: false
nav_order: 1
---
# Recursively Check for Duplicate Tags

## Context and Problem Statement

In nested `SET`, `SEQUENCE`, or `CHOICE`, I wanted this extension to check for
duplicate tags. So it would catch duplicate tags in something like:

```asn1
Person ::= SET {
    nameInfo    SET {
        first   UTF8String,
        last    UTF8String
    }
}
```

The above example is problematic because the inner `first` and `last` both
have the same tags, and, since they are in a `SET`, the ordering flexibility
makes it ambiguous which tag refers to which field. I wanted this VS code
extension to detect this.

## Considered Options

I had Cursor Grok 4.7 Medium generate some preliminary code to implement this
feature. The only option, as far as I can tell, is to accept or reject.

## Decision Outcome

I decided to reject this feature because the code change was too large to
justify for something that handles this edge case. Cursor's proposed changes
were about 1000 new lines of new non-test code, and about 70 lines of test
code. The 1000 new lines of code fell within a file that was itself only
about 2000. It's just too large of a code liability to incur for this.

The performance implications of having to re-analyze every type assignment on
each code change could also be devastating, although I think you could easily
choose to do this check only for assignments that have changed.

I am not universally opposed to doing this in the future, if we can come up
with a much smaller code change.
