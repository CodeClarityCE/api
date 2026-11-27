/* Defines how long a JWT Token lives, after creation */
export const CONST_JWT_TOKEN_EXPIRES_IN = "15m"; // 15 minutes

/* Defines how long a refresh token family lives, from sign-in */
export const CONST_REFRESH_TOKEN_EXPIRES_IN = "7d"; // 7 days

/* Defines the supported JWT algorithm */
export const CONST_JWT_ALGORITHM = "ES512"; // ECDSA

/** Defines how many salt rounds or cost factor (the higher the more difficult brute-forcing becomes) */
export const CONST_PASSWORD_SALT_ROUNDS = 10;
