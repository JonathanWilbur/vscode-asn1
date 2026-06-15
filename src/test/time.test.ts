import { DATE_REGEX, TIME_REGEX } from "../time.js";
import * as assert from 'assert';

suite('Time related regexes', () => {
    test('DATE_REGEX works discerns valid and invalid months', () => {
        const valid = [
            "2026-01-01",
            "2026-02-01",
            "2026-03-01",
            "2026-04-01",
            "2026-05-01",
            "2026-06-01",
            "2026-07-01",
            "2026-08-01",
            "2026-09-01",
            "2026-10-01",
            "2026-11-01",
            "2026-12-01",
        ];
        const invalid = [
            "2026-13-01",
            "2026-00-01",
        ];
        for (const d of valid) {
            assert.strict(DATE_REGEX.test(d));
        }
        for (const d of invalid) {
            assert.strict(!DATE_REGEX.test(d));
        }
    });

    test('TIME_REGEX works discerns valid and invalid months', () => {
        const valid = [
            "00:00:00",
            "13:00:59",
            "23:59:59",
            "13:00:59",
            "13:00:48",
            "13:00:32",
            "13:00:12",
        ];
        const invalid = [
            "24:00:00",
            "23:60:60",
        ];
        for (const d of valid) {
            assert.strict(TIME_REGEX.test(d));
        }
        for (const d of invalid) {
            assert.strict(!TIME_REGEX.test(d));
        }
    });
});