import { analysisOutcome } from "./analysis-outcome";

describe("analysisOutcome", () => {
  it.each([
    ["success", "succeeded"],
    ["completed", "succeeded"],
    ["failure", "failed"],
    ["failed", "failed"],
    ["cancelled", "failed"],
    ["requested", "running"],
    ["triggered", "running"],
    ["started", "running"],
    ["ongoing", "running"],
    ["updating_db", "running"],
    ["finished", "running"],
    ["something-new", "running"],
  ])("classifies %s as %s", (status, outcome) => {
    expect(analysisOutcome(status)).toBe(outcome);
  });
});
