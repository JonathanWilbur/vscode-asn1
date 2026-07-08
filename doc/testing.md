# Testing Approach

For a lot of tests, you have to wait for the indexing of all ASN.1 files in the
workspace to complete, or you'll get weird race conditions. The way my tests do
this is like this:

```typescript
const ext = vscode.extensions.getExtension<{ indexingPromise: Promise<void> }>("wildboar.asn1")!;
const outcome = await ext.activate();
await outcome.indexingPromise;
```

I confirmed that:

1. `.activate()` only runs one time when the extension is not yet activated.
   Subsequent calls are idempotent.
2. `await`ing a fulfilled promise just returns the value, so
   `await outcome.indexingPromise` is fine, even if the `indexingPromise`
   already resolved while another test was running.
3. This actually works in practice.

This was obnoxious to figure out. For the record, I tried to use
`vscode.EventEmitter`, but it seems like fired events would not cross the
boundary from the VS code environment into the test suite. So I could not
await an event firing (indexing complete) for the tests to proceed. Only
the returned-promise approach worked.

I also checked if I could read the logs or read pop-ups programmatically,
but you cannot (probably for good reason, but I thought I'd try).
