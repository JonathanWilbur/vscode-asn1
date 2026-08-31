import * as assert from 'node:assert/strict';
import { lex } from '@wildboar/asn1-parser';
import {
    clearNamedBitAndIntegerIndexes,
    indexNamedBitsAndIntegersFromTokenStream,
    isKnownNamedBit,
    isKnownNamedIntegerOrEnum,
} from '../indexing.js';

suite('Named bit and integer indexing', function () {
    test('indexes ENUMERATED variants and named integers separately from named bits', () => {
        clearNamedBitAndIntegerIndexes();
        const text = `
M DEFINITIONS ::= BEGIN
E ::= ENUMERATED { red (0), green (1) }
I ::= INTEGER { one (1), two (2) }
B ::= BIT STRING { flagA (0), flagB (1) }
plainInt INTEGER ::= 5
plainBits BIT STRING ::= '01'B
END
`;
        const tokens = Array.from(lex(text));
        indexNamedBitsAndIntegersFromTokenStream(tokens, text);
        assert.equal(isKnownNamedIntegerOrEnum("red"), true);
        assert.equal(isKnownNamedIntegerOrEnum("green"), true);
        assert.equal(isKnownNamedIntegerOrEnum("one"), true);
        assert.equal(isKnownNamedIntegerOrEnum("two"), true);
        assert.equal(isKnownNamedBit("flagA"), true);
        assert.equal(isKnownNamedBit("flagB"), true);
        assert.equal(isKnownNamedBit("red"), false);
        assert.equal(isKnownNamedBit("one"), false);
        assert.equal(isKnownNamedIntegerOrEnum("flagA"), false);
        assert.equal(isKnownNamedIntegerOrEnum("plainInt"), false);
    });
});
