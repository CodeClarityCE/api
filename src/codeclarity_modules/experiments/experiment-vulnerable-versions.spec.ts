import { isVulnerableVersion } from "./experiment-vulnerable-versions";

describe("isVulnerableVersion", () => {
  const lodash = {
    ranges: [
      { introduced: null, fixed: "4.17.21" },
      { introduced: "5.0.0", fixed: null },
    ],
    exact: ["4.17.22-beta.1"],
    universal: false,
  };

  it("treats introduced as inclusive and fixed as exclusive, an open bound as unbounded", () => {
    expect(isVulnerableVersion("4.17.15", lodash)).toBe(true);
    expect(isVulnerableVersion("4.17.21", lodash)).toBe(false);
    expect(isVulnerableVersion("4.18.0", lodash)).toBe(false);
    expect(isVulnerableVersion("5.0.0", lodash)).toBe(true);
    expect(isVulnerableVersion("6.1.2", lodash)).toBe(true);
  });

  it("matches exact versions, and every version when the advisory is universal", () => {
    expect(isVulnerableVersion("4.17.22-beta.1", lodash)).toBe(true);
    expect(isVulnerableVersion("0.0.1", { ranges: [], exact: [], universal: true })).toBe(true);
  });

  it("ignores a range with neither bound, and versions that do not parse", () => {
    const empty = { ranges: [{ introduced: null, fixed: null }], exact: [], universal: false };
    expect(isVulnerableVersion("1.0.0", empty)).toBe(false);
    expect(isVulnerableVersion("github:lodash/lodash", lodash)).toBe(false);
  });

  it("cannot tell without stored affected versions", () => {
    expect(isVulnerableVersion("4.17.15", null)).toBeNull();
  });
});
