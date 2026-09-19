import { describe, expect, test } from "bun:test";
import { splitMessageSegments } from "./message-segments";

describe("splitMessageSegments", () => {
  test("named fence keeps filename out of the body", () => {
    const md = "```python app.py\nprint(1)\n```";
    const segs = splitMessageSegments(md);
    expect(segs).toEqual([
      {
        type: "code",
        language: "python",
        filename: "app.py",
        code: "print(1)",
        closed: true,
      },
    ]);
  });

  test("filename-only fence merges into the next python fence", () => {
    const md = [
      "```python",
      "app.py",
      "```",
      "```python",
      "# app.py",
      "def main():",
      "    print('hi')",
      "```",
    ].join("\n");
    const segs = splitMessageSegments(md);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({
      type: "code",
      language: "python",
      filename: "app.py",
      closed: true,
    });
    if (segs[0]?.type === "code") {
      expect(segs[0].code).toContain("def main()");
      expect(segs[0].code).not.toBe("app.py");
    }
  });
});
