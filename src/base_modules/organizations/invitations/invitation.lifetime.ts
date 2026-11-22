// How long an organization invitation and its email link stay valid.
const INVITATION_LIFETIME_DAYS = 3;
export const INVITATION_LIFETIME_MS =
  INVITATION_LIFETIME_DAYS * 24 * 60 * 60 * 1000;
// The lifetime as the invite emails state it.
export const INVITATION_LIFETIME_TEXT = `${INVITATION_LIFETIME_DAYS} days`;

// When an invitation created or resent now expires.
export function invitationExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITATION_LIFETIME_MS);
}
