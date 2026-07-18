# GRDECL Subset Parser Provenance

This parser is independently implemented from public descriptions of Eclipse-style ASCII input decks. No GPL source code, ResInsight source code, or GPL-derived test data was consulted.

## Public References Used

- SLB, *ECLIPSE 100 Reference Manual*, public input-data documentation for the `SPECGRID`, `DIMENS`, `COORD`, `ZCORN`, and `ACTNUM` keyword syntax.
- OPM Flow public user documentation describing Eclipse-style deck input as keyword blocks terminated by `/` and its public keyword naming conventions.

These references are used only for format facts: slash-terminated keyword blocks, structured dimensions, the six values per `COORD` pillar, eight `ZCORN` values per cell, and cell-aligned `ACTNUM`/property arrays. This repository does not copy implementation source from either project.

## Assumed Ordering

- `SPECGRID` accepts three dimensions or the common five-field form; only the first three dimensions are retained.
- `DIMENS` accepts exactly `NX NY NZ`.
- `COORD` contains `6 * (NX + 1) * (NY + 1)` Float64 values, ordered by increasing `I` within increasing `J`: top XYZ then bottom XYZ per pillar.
- Raw `ZCORN` stores a doubled structured lattice with dimensions `2 * NX`, `2 * NY`, and `2 * NZ`, traversed with doubled `I` fastest. The parser converts it to eight contiguous depths per repository cell in this order: top `I-,J-`; top `I+,J-`; top `I+,J+`; top `I-,J+`; then the same four corners at the bottom. Cells use $cellId = i + NX(j + NYk)$.
- `ACTNUM` and supported property blocks contain exactly one value per structured cell in that same order.

`ACTNUM` is optional in this subset; when absent, all cells are active. Default repetitions in geometry and `ACTNUM` are rejected because this subset does not infer their values. Default repetitions in properties are preserved as `NaN` with a zero validity-mask entry.

Parsed static property values are retained in `ReservoirCase.propertyFrames`, aligned to `propertyCatalog` by `propertyId`.

`INCLUDE`, binary Eclipse formats, and unrecognized semantic constructs are not implemented. Unknown keyword blocks are skipped only after a slash terminator is observed and are recorded as warnings.