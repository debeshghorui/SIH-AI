import { describe, expect, test } from "bun:test";
import { openDb, schema } from "./db";
import { chunkVaultText, readVaultExtract, removeVaultIndex } from "./vault-index";

describe("chunkVaultText", () => {
  test("splits on page markers", () => {
    const chunks = chunkVaultText(
      "--- page 1 ---\nHello\n\n--- page 2 ---\nWorld",
    );
    expect(chunks).toEqual([
      { heading: "page 1", body: "Hello" },
      { heading: "page 2", body: "World" },
    ]);
  });

  test("splits a long page into parts", () => {
    const body = "a".repeat(2000);
    const chunks = chunkVaultText(`--- page 1 ---\n${body}`, 800);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.heading).toBe("page 1.1");
    expect(chunks.every((c) => c.body.length <= 800)).toBe(true);
  });

  test("returns empty for blank input", () => {
    expect(chunkVaultText("   ")).toEqual([]);
  });
});

describe("readVaultExtract", () => {
  test("joins chunks for a source and misses unknown files", () => {
    const source = `__sticky_${crypto.randomUUID()}.jpg`;
    const { db } = openDb();
    db.insert(schema.vaultChunks)
      .values({
        source,
        heading: "document",
        body: "Certificate of Completion GENAI COHORT",
      })
      .run();
    try {
      expect(readVaultExtract(source)).toContain("GENAI COHORT");
      expect(readVaultExtract("missing-nope.jpg")).toBe("");
    } finally {
      removeVaultIndex(source);
    }
  });
});
