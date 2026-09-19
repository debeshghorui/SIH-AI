import { existsSync, writeFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  resolveVaultPath,
  sanitizeVaultName,
  safeVaultRelative,
  vaultDelete,
} from "./fs";

describe("vault names", () => {
  test("upload collapse vs listed name", () => {
    expect(sanitizeVaultName("A1_debesh_1018.pdf.pdf")).toBe(
      "A1_debesh_1018.pdf",
    );
    expect(safeVaultRelative("A1_debesh_1018.pdf.pdf")).toBe(
      "A1_debesh_1018.pdf.pdf",
    );
  });

  test("deletes a file still stored as .pdf.pdf", () => {
    const name = `__delete_double.pdf.pdf`;
    const full = resolveVaultPath(name);
    writeFileSync(full, "x");
    expect(existsSync(full)).toBe(true);
    vaultDelete(name);
    expect(existsSync(full)).toBe(false);
  });
});
