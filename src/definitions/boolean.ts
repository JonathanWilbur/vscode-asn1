import { MarkdownString } from "vscode";

export const TRUE_DEFINITION : MarkdownString = new MarkdownString(
"A `BOOLEAN` value that can be thought of as an affirmative, yes, on, \
1, or true. Its encodings are:\n\n\
- `0x0101FF` in CER and DER\n\
- `0x0101` followed by any non-zero byte in BER\n\
- Any non-zero byte in the Basic Octet Encoding Rules (OER)\n\
- `0xFF` in the Canonical Octet Encoding Rules (COER)\n\
- A single set bit in the Packed Encoding Rules (PER)\n\
- A JSON `true` value in the JSON Encoding Rules (JER)\n\
- `<true />` in XML Encoding Rules (XER)\n\
- `0x54525545` (ASCII \"TRUE\") in the Generic String Encoding Rules (GSER)\n\
"
);
    
export const FALSE_DEFINITION : MarkdownString = new MarkdownString(
"A `BOOLEAN` value that can be thought of as an negative, no, off, \
0, or false. Its encodings are:\n\n\
- `0x010100` in BER, CER and DER\n\
- `0x00` in the Basic and Canonical Octet Encoding Rules (OER and COER)\n\
- A single unset bit in the Packed Encoding Rules (PER)\n\
- A JSON `false` value in the JSON Encoding Rules (JER)\n\
- `<false />` in XML Encoding Rules (XER)\n\
- `0x46414C5345` (ASCII \"FALSE\") in the Generic String Encoding Rules (GSER)\n\
"
);
