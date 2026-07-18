# GRDECL-Style Lexical Contract

`src/reservoir/formats/grdecl` implements only a streaming lexical layer. It does not interpret grid dimensions, properties, includes, units, EGRID, INIT, UNRST, or any reservoir semantics.

The independently implemented lexical subset follows publicly described ASCII deck conventions: keywords, whitespace-delimited numeric values, `/` terminators, `--` line comments, quoted strings, and `count*value` or `count*` repetitions. The fixture corpus is independently written and contains no external reservoir test data.

The tokenizer accepts iterable or async-iterable text chunks. It retains only incomplete lexical fragments between chunks, tracks one-based line/column and zero-based character offsets, and emits comment tokens rather than discarding them. CRLF is counted as one logical newline.

Limits protect later numeric-array consumers: token count, repetition count, and accumulated numeric values. Malformed numeric or repetition lexemes raise `GrdeclLexicalError` with a structured code and location. Callers may pass `shouldCancel` to stop a long stream safely.