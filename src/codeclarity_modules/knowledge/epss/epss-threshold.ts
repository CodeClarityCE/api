/** The EPSS score from which a vulnerability counts as likely to be exploited. */
export const HIGH_EPSS = 0.1;

/** True when the score is at or above the high EPSS threshold. */
export const isHighEpss = (score: number | null | undefined): boolean =>
  score !== null && score !== undefined && score >= HIGH_EPSS;
