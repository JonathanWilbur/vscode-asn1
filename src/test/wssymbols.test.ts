import * as assert from "assert";
import { fuzzyMatch } from "../wssymbols.js";

// This was all written by Cursor AI.
suite("fuzzyMatch", () => {
    test("matches query characters in order within symbol", () => {
        const matches = [
            ["abc", "a_b_c"],
            ["abc", "alphabetic"],
            ["cmp", "completionitem"],
            ["vsc", "visualstudiocode"],
            ["cat", "cart"],
        ];
        for (const [query, symbol] of matches) {
            assert.strictEqual(fuzzyMatch(query, symbol), true);
        }
    });

    test("rejects query characters out of order or missing", () => {
        const nonMatches = [
            ["cta", "cart"],
            ["xyz", "completion"],
        ];
        for (const [query, symbol] of nonMatches) {
            assert.strictEqual(fuzzyMatch(query, symbol), false);
        }
    });
});
