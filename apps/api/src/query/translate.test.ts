import { describe, expect, test } from "bun:test";
import { nearDuplicate, retrievalPlan } from "./translate";

describe("nearDuplicate", () => {
  test("drops punctuation clones", () => {
    expect(
      nearDuplicate(
        "what is temporal dead zone in javascript",
        "what is the temporal dead zone in javascript?",
      ),
    ).toBe(true);
  });

  test("drops definition paraphrases", () => {
    expect(
      nearDuplicate(
        "temporal dead zone in javascript",
        "definition of temporal dead zone in javascript",
      ),
    ).toBe(true);
  });

  test("keeps a real step-back", () => {
    expect(
      nearDuplicate(
        "what is temporal dead zone in javascript",
        "how does javascript hoisting and let const binding work",
      ),
    ).toBe(false);
  });
});

describe("retrievalPlan", () => {
  test("collapses paraphrase sub-queries and plant-SOP HyDE", () => {
    const original = "what is temporal dead zone in javascript";
    const plan = retrievalPlan(
      {
        rewritten: original,
        stepBack: original,
        subQueries: [
          original,
          "what is the temporal dead zone in javascript?",
          "what is the temporal dead zone in javascript?",
        ],
        hyde: "Temporal dead zone in JavaScript refers to a period when the interpreter pauses execution to resolve circular references, causing performance degradation in plant SOP isolation.",
      },
      original,
    );
    expect(plan.queries).toEqual([original]);
    expect(plan.hyde).toBeUndefined();
  });

  test("drops setTimeout HyDE on a language question", () => {
    const original = "what is temporal dead zone in javascript";
    const plan = retrievalPlan(
      {
        rewritten: original,
        stepBack: original,
        subQueries: [original],
        hyde: "Temporal dead zone in JavaScript refers to the period when a function is paused due to a setTimeout or setInterval call, causing a delay in later code.",
      },
      original,
    );
    expect(plan.hyde).toBeUndefined();
  });

  test("keeps a distinct step-back and in-domain HyDE", () => {
    const original = "what is temporal dead zone in javascript";
    const plan = retrievalPlan(
      {
        rewritten: original,
        stepBack: "how does javascript hoisting work with let and const",
        subQueries: [original],
        hyde: "The temporal dead zone is the time from entering a scope until a let or const binding is initialized. Accessing the binding before initialization throws a ReferenceError. Unlike var, the name is not hoisted as undefined.",
      },
      original,
    );
    expect(plan.queries).toEqual([
      original,
      "how does javascript hoisting work with let and const",
    ]);
    expect(plan.hyde).toContain("temporal dead zone");
  });
});
