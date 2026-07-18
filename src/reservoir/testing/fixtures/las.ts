import type { WellLogCurve } from "../../domain/types";
import { parseLas2 } from "../../formats/las";

export interface SyntheticLasFixture {
  readonly source: string;
  readonly curves: readonly WellLogCurve[];
  readonly tvdDepthsByMnemonic: ReadonlyMap<string, Float64Array>;
}

/** Locally authored LAS 2.0 source aligned with the synthetic east well trajectory. */
export function createSyntheticLasFixture(): SyntheticLasFixture {
  const source = `~Version Information
VERS. 2.0 : CWLS LAS 2.0
WRAP. NO : One line per depth
~Well Information
WELL. SYNTHETIC-EAST : Demonstration well
NULL. -999.25 : Missing value
~Curve Information
DEPT.M : Measured depth
GR.API : Gamma ray
RT.OHM.M : Resistivity
~ASCII
0 45 1.2
10 65 2.0
20 -999.25 4.5
30 85 15.0`;
  const parsed = parseLas2(source);
  return {
    source,
    curves: parsed.curves,
    tvdDepthsByMnemonic: new Map([
      ["GR", new Float64Array([0, 9, 17, 25])],
      ["RT", new Float64Array([0, 9, 17, 25])]
    ])
  };
}