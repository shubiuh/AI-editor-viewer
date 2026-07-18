# LAS Parser Provenance

The LAS parser in this repository is an independent implementation. It was written from the public CWLS LAS 2.0 format specification and locally authored test fixtures. It does not inspect, copy, or derive behavior from GPL implementations, ResInsight source code, or GPL test data.

## Public Specification Used

- Canadian Well Logging Society (CWLS), *Log ASCII Standard (LAS), Version 2.0*, public industry specification. CWLS LAS information and public specification materials: https://www.cwls.org/las/

## Format Facts Applied

- Section headers begin with `~` and use case-insensitive Version, Well, Curve, Parameter, Other, and ASCII identifiers.
- Header records use mnemonic, unit, value, and optional description fields separated by `.` and `:`.
- `VERS` identifies the LAS version; this parser accepts LAS 2.x.
- `WRAP` controls whether ASCII values are grouped by physical lines or by the curve count across lines.
- `NULL` defines a numeric missing-value sentinel.
- The Curve section defines ASCII column order, with a recognized depth mnemonic (`DEPT`, `DEPTH`, `MD`, `TVD`, `TVDSS`, or `TVDMSL`) supplying the shared depth array.

The parser preserves raw section lines and parsed header fields in its result metadata. Its test inputs are authored in this repository to cover the supported LAS 2.0 subset.