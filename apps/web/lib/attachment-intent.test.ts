import { describe, expect, test } from "bun:test";
import { attachmentChipName, stripAttachmentChip } from "./attachment-intent";

describe("attachment chips", () => {
  test("strips the chip for display", () => {
    expect(
      stripAttachmentChip("tell me about this pic\n[attachment: cert.jpg]"),
    ).toBe("tell me about this pic");
  });

  test("reads the filename for the bubble pill", () => {
    expect(
      attachmentChipName("tell me about this pic\n[attachment: cert.jpg]"),
    ).toBe("cert.jpg");
    expect(attachmentChipName("no file here")).toBeUndefined();
  });
});
