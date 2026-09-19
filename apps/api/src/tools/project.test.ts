import { existsSync } from "node:fs";
import { describe, expect, test, afterAll } from "bun:test";
import {
  listTree,
  writeProjectFile,
  readProjectFile,
  deleteProjectFile,
  deleteProject,
  safeProjectRel,
  planProjectRun,
  projectDir,
} from "./project";

const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

afterAll(() => {
  deleteProject(ID);
});

describe("project vault", () => {
  test("writes and lists inside the conversation dir", () => {
    deleteProject(ID);
    const saved = writeProjectFile(ID, "index.html", "<h1>hi</h1>");
    expect(saved).toBe("index.html");
    writeProjectFile(ID, "styles.css", "h1{color:red}");
    const tree = listTree(ID);
    expect(tree.map((f) => f.path).sort()).toEqual(["index.html", "styles.css"]);
    expect(readProjectFile(ID, "index.html")).toContain("hi");
    const root = projectDir(ID);
    expect(root.replace(/\\/g, "/")).toContain(`/projects/${ID}`);
    expect(existsSync(root)).toBe(true);
  });

  test("rejects path escape", () => {
    expect(() => safeProjectRel("../secret.py")).toThrow(/escapes/);
    expect(() => safeProjectRel("/tmp/x.js")).toThrow(/escapes/);
    expect(() => writeProjectFile(ID, "../../etc/passwd", "x")).toThrow();
  });

  test("rejects disallowed extension", () => {
    expect(() => safeProjectRel("run.exe")).toThrow(/extension/);
  });

  test("deletes a file", () => {
    writeProjectFile(ID, "notes.txt", "x");
    deleteProjectFile(ID, "notes.txt");
    expect(listTree(ID).some((f) => f.path === "notes.txt")).toBe(false);
  });

  test("plan prefers preview when index.html exists", () => {
    deleteProject(ID);
    writeProjectFile(ID, "index.html", "<h1>x</h1>");
    writeProjectFile(ID, "main.js", "console.log(1)");
    expect(planProjectRun(ID).mode).toBe("preview");
    expect(planProjectRun(ID, "run").mode).toBe("run");
  });
});
