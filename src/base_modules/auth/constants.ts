/* Defines how long a JWT Token lives, after creation */
export const CONST_JWT_TOKEN_EXPIRES_IN = '10m'; // 10 minutes

/* Defines how long a JWT Refresh Token lives, after creation */
export const CONST_REFRESH_JWT_TOKEN_EXPIRES_IN = '7d'; // 7 days

/* Defines the supported JWT algorithm */
export const CONST_JWT_ALGORITHM = 'ES512'; // ECDSA

/** Defines how many salt rounds or cost factor (the higher the more difficult brute-forcing becomes) */
export const CONST_PASSWORD_SALT_ROUNDS = 10;
