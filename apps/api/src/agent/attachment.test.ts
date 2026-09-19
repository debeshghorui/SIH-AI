import { describe, expect, test } from "bun:test";
import {
  lastAttachmentFromMessages,
  refersToAttachment,
  resolveStickyAttachment,
  isThinExtract,
  wantsVerbatimExtract,
} from "./attachment";

describe("lastAttachmentFromMessages", () => {
  test("returns the last chip in the thread", () => {
    expect(
      lastAttachmentFromMessages([
        { content: "first\n[attachment: a.jpg]" },
        { content: "ok" },
        { content: "again\n[attachment: b.pdf]" },
      ]),
    ).toBe("b.pdf");
  });

  test("returns undefined when no chip exists", () => {
    expect(lastAttachmentFromMessages([{ content: "hello" }])).toBeUndefined();
  });
});

describe("refersToAttachment", () => {
  test("treats pic / image follow-ups as about the file", () => {
    expect(refersToAttachment("what you can see in this pic ??")).toBe(true);
    expect(refersToAttachment("what can you see in this image")).toBe(true);
    expect(refersToAttachment("summarise the attached document")).toBe(true);
    expect(refersToAttachment("can you give me this image text ??")).toBe(true);
    expect(refersToAttachment("give the image content")).toBe(true);
  });

  test("treats 'tell me more' as about the file when not a plant question", () => {
    expect(refersToAttachment("tell me more")).toBe(true);
    expect(refersToAttachment("what's in it")).toBe(true);
  });

  test("does not steal plant SOP / tag questions", () => {
    expect(refersToAttachment("SOP for 12-P-104 isolation")).toBe(false);
    expect(refersToAttachment("Last inspection on 12-P-104")).toBe(false);
    expect(refersToAttachment("hello")).toBe(false);
  });
});

describe("resolveStickyAttachment", () => {
  const history = [
    { content: "now tell me about this pic\n[attachment: cert.jpg]" },
    { content: "Certificate of Completion" },
  ];

  test("keeps a fresh upload over history", () => {
    expect(
      resolveStickyAttachment({
        query: "what is this pic",
        messages: history,
        attachmentName: "new.png",
      }),
    ).toEqual({ attachmentName: "new.png", sticky: false });
  });

  test("reuses history when the follow-up is about the pic", () => {
    expect(
      resolveStickyAttachment({
        query: "what you can see in this pic ??",
        messages: [...history, { content: "what you can see in this pic ??" }],
      }),
    ).toEqual({ attachmentName: "cert.jpg", sticky: true });
  });

  test("does not stick on a plant SOP question in the same thread", () => {
    expect(
      resolveStickyAttachment({
        query: "SOP for 12-P-104 isolation",
        messages: history,
      }),
    ).toEqual({ sticky: false });
  });
});

describe("isThinExtract", () => {
  test("treats a title-only caption as thin", () => {
    expect(
      isThinExtract(
        'For a More Creative Brain Follow These 5 Steps written by JAMES.',
      ),
    ).toBe(true);
  });

  test("keeps a full page of text", () => {
    expect(isThinExtract("word ".repeat(80))).toBe(false);
  });
});

describe("wantsVerbatimExtract", () => {
  test("matches dump-the-text asks", () => {
    expect(wantsVerbatimExtract("can you give me this image text ??")).toBe(
      true,
    );
    expect(wantsVerbatimExtract("give the image content")).toBe(true);
  });

  test("leaves ordinary questions as paraphrase", () => {
    expect(wantsVerbatimExtract("tell me about this pic")).toBe(false);
  });
});
