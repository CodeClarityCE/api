// How long a password reset link stays valid.
export const PASSWORD_RESET_LIFETIME_MS = 30 * 60 * 1000;

// When a password reset requested now expires.
export function passwordResetExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + PASSWORD_RESET_LIFETIME_MS);
}
