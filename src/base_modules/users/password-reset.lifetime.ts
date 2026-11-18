// How long a password reset link stays valid.
export const PASSWORD_RESET_LIFETIME_MINUTES = 30;
export const PASSWORD_RESET_LIFETIME_MS =
  PASSWORD_RESET_LIFETIME_MINUTES * 60 * 1000;
// The lifetime as the reset email states it.
export const PASSWORD_RESET_LIFETIME_TEXT = `${PASSWORD_RESET_LIFETIME_MINUTES} minutes`;

// When a password reset requested now expires.
export function passwordResetExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + PASSWORD_RESET_LIFETIME_MS);
}
