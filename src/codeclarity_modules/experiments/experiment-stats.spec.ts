import {
  averageRanks,
  gini,
  kaplanMeier,
  kmMedian,
  median,
  packagesToClear,
  quantile,
  spearman,
  studentTwoSidedP,
} from "./experiment-stats";

describe("experiment stats", () => {
  describe("gini", () => {
    it("measures concentration of a distribution", () => {
      // (2 * (1*1 + 2*2 + 3*3 + 4*4) - 5 * 10) / (4 * 10)
      expect(gini([4, 1, 3, 2])).toBeCloseTo(0.25, 12);
      expect(gini([7])).toBe(0);
      expect(gini([0, 0, 0, 10])).toBeCloseTo(0.75, 12);
    });

    it("is undefined (NaN) for no values or only zeros, ignoring NaN", () => {
      expect(gini([])).toBeNaN();
      expect(gini([0, 0])).toBeNaN();
      expect(gini([NaN, 4, 1, 3, 2])).toBeCloseTo(0.25, 12);
    });
  });
  describe("quantile and median", () => {
    it("interpolates linearly between order statistics (pandas default)", () => {
      const tens = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
      // position (10 - 1) * 0.9 = 8.1, between 9 and 10
      expect(quantile(tens, 0.9)).toBeCloseTo(9.1, 12);
      expect(quantile(tens, 0)).toBe(1);
      expect(quantile(tens, 1)).toBe(10);
    });

    it("takes the mean of the two middle values for an even count", () => {
      expect(median([4, 1, 3, 2])).toBe(2.5);
      expect(median([3, 1, 2])).toBe(2);
    });

    it("skips NaN and is NaN for no values", () => {
      expect(median([NaN, 1, 3])).toBe(2);
      expect(median([])).toBeNaN();
      expect(quantile([NaN], 0.9)).toBeNaN();
    });
  });

  describe("packagesToClear", () => {
    it("counts the largest packages needed to remove a share of instances", () => {
      // cumulative shares, largest first: 0.5, 0.8, 1.0
      expect(packagesToClear([2, 5, 3], 0.5)).toBe(1);
      expect(packagesToClear([2, 5, 3], 0.8)).toBe(2);
      expect(packagesToClear([2, 5, 3], 0.9)).toBe(3);
      expect(packagesToClear([1, 1, 1, 1], 0.6)).toBe(3);
    });

    it("is 0 when there are no instances", () => {
      expect(packagesToClear([], 0.5)).toBe(0);
      expect(packagesToClear([0, 0], 0.5)).toBe(0);
    });
  });

  describe("averageRanks", () => {
    it("ranks from 1 and gives tied values the mean of their ranks", () => {
      expect(averageRanks([5, 6, 7, 8, 7])).toEqual([1, 2, 3.5, 5, 3.5]);
      expect(averageRanks([2, 2, 2])).toEqual([2, 2, 2]);
    });
  });

  describe("studentTwoSidedP", () => {
    it("matches closed forms of the t distribution", () => {
      // df = 1 is Cauchy: P(|T| > 1) = 1/2
      expect(studentTwoSidedP(1, 1)).toBeCloseTo(0.5, 12);
      // df = 2: P(|T| > t) = 1 - t / sqrt(2 + t^2)
      expect(studentTwoSidedP(2, 2)).toBeCloseTo(1 - 2 / Math.sqrt(6), 12);
      expect(studentTwoSidedP(-2, 2)).toBeCloseTo(1 - 2 / Math.sqrt(6), 12);
      expect(studentTwoSidedP(0, 30)).toBeCloseTo(1, 12);
    });

    it("approaches the normal distribution for many degrees of freedom", () => {
      // P(|Z| > 1.959964) = 0.05
      expect(studentTwoSidedP(1.959963985, 1e7)).toBeCloseTo(0.05, 6);
    });
  });

  describe("spearman", () => {
    it("matches scipy.stats.spearmanr, ties included", () => {
      // scipy docs: spearmanr([1, 2, 3, 4, 5], [5, 6, 7, 8, 7])
      const { rho, p } = spearman([1, 2, 3, 4, 5], [5, 6, 7, 8, 7]);
      expect(rho).toBeCloseTo(0.8207826816681233, 12);
      expect(p).toBeCloseTo(0.08858700531354381, 12);
    });

    it("has p = 0 for a perfect monotonic relation", () => {
      expect(spearman([1, 2, 3, 4], [10, 20, 30, 1000])).toEqual({
        rho: 1,
        p: 0,
      });
    });

    it("is NaN for a constant input or fewer than three pairs", () => {
      const constant = spearman([1, 2, 3], [4, 4, 4]);
      expect(constant.rho).toBeNaN();
      expect(constant.p).toBeNaN();
      expect(spearman([1, 2], [1, 2]).p).toBeNaN();
    });
  });

  describe("kaplanMeier", () => {
    // Worked by hand: durations 1, 2, 2+, 3, 4+, 5 (+ = censored)
    const durations = [3, 1, 2, 5, 2, 4];
    const events = [true, true, false, true, true, false];

    it("steps down at each event time, keeping censored ones at risk until they leave", () => {
      const curve = kaplanMeier(durations, events);
      expect(curve.map((s) => s.time)).toEqual([1, 2, 3, 4, 5]);
      expect(curve.map((s) => s.at_risk)).toEqual([6, 5, 3, 2, 1]);
      expect(curve.map((s) => s.events)).toEqual([1, 1, 1, 0, 1]);
      expect(curve.map((s) => s.censored)).toEqual([0, 1, 0, 1, 0]);
      const survival = curve.map((s) => s.survival);
      expect(survival[0]).toBeCloseTo(5 / 6, 12);
      expect(survival[1]).toBeCloseTo(4 / 6, 12);
      expect(survival[2]).toBeCloseTo(8 / 18, 12);
      expect(survival[3]).toBeCloseTo(8 / 18, 12);
      expect(survival[4]).toBe(0);
    });

    it("has no steps for no observations and stays at 1 when all are censored", () => {
      expect(kaplanMeier([], [])).toEqual([]);
      expect(kaplanMeier([4, 9], [false, false]).map((s) => s.survival)).toEqual([1, 1]);
    });

    it("gives the median as the first time survival reaches one half, else NaN", () => {
      expect(kmMedian(kaplanMeier(durations, events))).toBe(3);
      // Two of four fixed by day 10: S(10) = 0.5 exactly
      expect(kmMedian(kaplanMeier([10, 10, 20, 30], [true, true, false, false]))).toBe(10);
      // One of three fixed: S never falls below 2/3
      expect(kmMedian(kaplanMeier([4, 9, 9], [true, false, false]))).toBeNaN();
      expect(kmMedian([])).toBeNaN();
    });
  });
});
