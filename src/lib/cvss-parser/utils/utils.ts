/**
 * Rounds the floating point value up to its nearest multiple of 0.1 (i.e. to one decimal place).
 * Spec: https://www.first.org/cvss/v3.1/specification-document#Appendix-A---Floating-Point-Rounding
 *
 * @param value the value to round
 * @returns the rounded value
 */
export function roundUp(value: number): number {
  const rounded = Math.round(value * 100000);
  if (rounded % 10000 === 0) {
    return rounded / 100000.0;
  } else {
    return (Math.floor(rounded / 10000) + 1) / 10.0;
  }
}
