import { describe, expect, test } from "bun:test";
import {
  extractCodeFiles,
  ensureHtmlLinksCss,
  isCodingTurn,
  materializeProject,
} from "./code-files";
import { deleteProject, readProjectFile, writeProjectFile } from "../tools/project";

describe("code-files", () => {
  test("named fences", () => {
    const md = [
      "```html index.html",
      "<h1>Hi</h1>",
      "```",
      "```css styles.css",
      "h1 { color: red }",
      "```",
    ].join("\n");
    const files = extractCodeFiles(md);
    expect(files.map((f) => f.path).sort()).toEqual(["index.html", "styles.css"]);
    expect(files.find((f) => f.path === "index.html")?.content).toContain("Hi");
  });

  test("unnamed fallbacks when allowed", () => {
    const md = "```python\nprint('hi')\n```\n```html\n<h1>x</h1>\n```";
    expect(extractCodeFiles(md)).toEqual([]);
    const files = extractCodeFiles(md, { allowUnnamed: true });
    expect(files.map((f) => f.path).sort()).toEqual(["index.html", "main.py"]);
  });

  test("path escape is dropped", () => {
    expect(extractCodeFiles("```python ../../etc/passwd\nsecret\n```")).toEqual([]);
    expect(extractCodeFiles("```python /tmp/x.py\nsecret\n```")).toEqual([]);
  });

  test("auto-link css into html", () => {
    const linked = ensureHtmlLinksCss([
      { path: "index.html", content: "<html><head></head><body><h1>Hi</h1></body></html>" },
      { path: "styles.css", content: "h1{color:red}" },
    ]);
    const html = linked.find((f) => f.path === "index.html")?.content ?? "";
    expect(html).toMatch(/href="styles.css"/);
  });

  test("coding turn detection", () => {
    expect(isCodingTurn("generate a python code")).toBe(true);
    expect(isCodingTurn("create an html and css file for hello world")).toBe(true);
    expect(isCodingTurn("genrate a html file for hello world!")).toBe(true);
    expect(isCodingTurn("SOP for 12-P-104 isolation")).toBe(false);
    expect(isCodingTurn("anything", "coder")).toBe(true);
    expect(
      isCodingTurn("i need in project, you have to run it", undefined, undefined, {
        priorCoding: true,
      }),
    ).toBe(true);
    expect(isCodingTurn("i need in project, you have to run it")).toBe(false);
  });

  test("unnamed html example still materializes", () => {
    const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    deleteProject(id);
    const written = materializeProject(
      id,
      [
        "I will not generate an HTML file as per your request.",
        "```html",
        "<!DOCTYPE html>",
        "<html><body><h1>Hello, World!</h1></body></html>",
        "```",
      ].join("\n"),
      { allowUnnamed: true },
    );
    expect(written).toEqual(["index.html"]);
    expect(readProjectFile(id, "index.html")).toContain("Hello, World!");
    deleteProject(id);
  });

  test("filename-only fence then python body becomes app.py", () => {
    const md = [
      "```python",
      "app.py",
      "```",
      "```python",
      "# app.py",
      "",
      "def main():",
      '    print("Hello, this is a simple Python script running in the sandbox.")',
      "",
      'if __name__ == "__main__":',
      "    main()",
      "```",
    ].join("\n");
    const files = extractCodeFiles(md, { allowUnnamed: true });
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe("app.py");
    expect(files[0]?.content).toContain("def main()");
    expect(files[0]?.content).not.toBe("app.py");
  });

  test("first line of an unnamed fence is the filename", () => {
    const md = "```python\napp.py\n\nprint(1)\n```";
    const files = extractCodeFiles(md);
    expect(files).toEqual([{ path: "app.py", content: "print(1)" }]);
  });

  test("materialize drops main.py stub after writing app.py", () => {
    const id = "cccccccc-dddd-4eee-8fff-000000000001";
    deleteProject(id);
    writeProjectFile(id, "main.py", "app.py");
    const written = materializeProject(
      id,
      [
        "```python",
        "app.py",
        "```",
        "```python",
        "print('ok')",
        "```",
      ].join("\n"),
      { allowUnnamed: true },
    );
    expect(written).toEqual(["app.py"]);
    expect(readProjectFile(id, "app.py")).toContain("print('ok')");
    expect(() => readProjectFile(id, "main.py")).toThrow(/not found/);
    deleteProject(id);
  });

  test("materialize writes named files and auto-links css", () => {
    const id = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
    deleteProject(id);
    const written = materializeProject(
      id,
      [
        "```html index.html",
        "<html><head></head><body><h1>Hi</h1></body></html>",
        "```",
        "```css styles.css",
        "h1 { color: red }",
        "```",
      ].join("\n"),
    );
    expect(written.sort()).toEqual(["index.html", "styles.css"]);
    expect(readProjectFile(id, "index.html")).toMatch(/href="styles.css"/);
    deleteProject(id);
  });
});
