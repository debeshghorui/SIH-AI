import { describe, expect, test } from "bun:test";
import { looksLikeCodeRequest, wantsProjectStudio } from "./coding-intent";

describe("coding intent", () => {
  test("typos and html file still open the studio", () => {
    expect(looksLikeCodeRequest("genrate a html file for hello world!")).toBe(
      true,
    );
    expect(wantsProjectStudio("genrate a html file for hello world!")).toBe(
      true,
    );
    expect(wantsProjectStudio("SOP for 12-P-104 isolation")).toBe(false);
  });

  test("follow-up run-in-project keeps the studio open", () => {
    expect(
      wantsProjectStudio("i need in project, you have to run it", undefined, {
        priorCoding: true,
      }),
    ).toBe(true);
    expect(wantsProjectStudio("i need in project, you have to run it")).toBe(
      false,
    );
  });
});
