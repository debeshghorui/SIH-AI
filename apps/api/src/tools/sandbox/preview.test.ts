import { afterAll, describe, expect, test } from "bun:test";
import {
  getLivePreviewPort,
  runProject,
  sandboxHealth,
  sanitizePreviewPath,
  stopPreview,
} from "./index";
import { deleteProject, writeProjectFile } from "../project";

describe("sanitizePreviewPath", () => {
  test("maps empty and files under root", () => {
    expect(sanitizePreviewPath(undefined)).toBe("/");
    expect(sanitizePreviewPath("")).toBe("/");
    expect(sanitizePreviewPath("styles.css")).toBe("/styles.css");
    expect(sanitizePreviewPath(["js", "app.js"])).toBe("/js/app.js");
  });

  test("rejects parent segments", () => {
    expect(() => sanitizePreviewPath("../etc/passwd")).toThrow(/bad path/);
    expect(() => sanitizePreviewPath("a/../../secret")).toThrow(/bad path/);
  });
});

const ID = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
const health = await sandboxHealth();
const nginxReady = health.dockerUp && health.images["nginx:alpine"] === true;

describe("project HTML preview", () => {
  afterAll(async () => {
    deleteProject(ID);
  });

  test.skipIf(!nginxReady)(
    "nginx serves the bind-mounted index.html",
    async () => {
      deleteProject(ID);
      writeProjectFile(ID, "index.html", "<h1>preview-ok</h1>");
      writeProjectFile(ID, "styles.css", "h1{color:red}");
      const result = await runProject({ conversationId: ID, mode: "preview" });
      try {
        expect(result.kind).toBe("preview");
        expect(result.ok).toBe(true);
        if (result.kind !== "preview") return;
        expect(result.previewUrl).toBe(
          `/api/sandbox/preview/${result.previewId}/index.html`,
        );
        const port = getLivePreviewPort(result.previewId);
        expect(port).toBeGreaterThan(0);
        const page = await fetch(`http://127.0.0.1:${port}/`);
        expect(page.ok).toBe(true);
        expect(await page.text()).toContain("preview-ok");
        const css = await fetch(`http://127.0.0.1:${port}/styles.css`);
        expect(css.ok).toBe(true);
      } finally {
        if (result.kind === "preview" && result.previewId) {
          await stopPreview(result.previewId);
        }
      }
    },
    25_000,
  );
});
