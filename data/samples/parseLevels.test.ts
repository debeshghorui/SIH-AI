import { test } from "node:test";
import assert from "node:assert";

/**
 * parseLevels: turn the tank_levels.csv text into { tank, level_mm, status } rows.
 * The agent writes this function in the coding beat; these tests run inside
 * the sandbox container with `node --test`.
 *
 * A row is "normal" when 4000 <= level <= 4500, "high" above 4500, "low" below 4000.
 */

export function parseLevels(csv: string): { tank: string; level_mm: number; status: string }[] {
  const lines = csv.trim().split(/\r?\n/);
  const rows: { tank: string; level_mm: number; status: string }[] = [];
  for (const line of lines.slice(1)) {
    const [ts, tank, level, status] = line.split(",");
    rows.push({ tank, level_mm: Number(level), status });
  }
  return rows;
}

test("parses a normal row", () => {
  const rows = parseLevels("ts,tank,level_mm,status\n2026-09-01,T-301,4200,normal");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tank, "T-301");
  assert.equal(rows[0].level_mm, 4200);
  assert.equal(rows[0].status, "normal");
});

test("parses high and low", () => {
  const csv = "ts,tank,level_mm,status\n2026-09-03,T-301,4580,high\n2026-09-07,T-301,3950,low";
  const rows = parseLevels(csv);
  assert.equal(rows[0].status, "high");
  assert.equal(rows[1].status, "low");
});

test("ignores the header row", () => {
  const rows = parseLevels("ts,tank,level_mm,status\n2026-09-01,T-301,4200,normal");
  assert.equal(rows.length, 1);
});
