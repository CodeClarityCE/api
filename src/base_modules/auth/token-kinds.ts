import type { JwtSignOptions } from "@nestjs/jwt";
import type { Algorithm, Jwt, JwtPayload as SignedClaims } from "jsonwebtoken";

import { NotAuthenticated } from "src/types/error.types";

import type { JwtPayload } from "./auth.types";
import { CONST_JWT_ALGORITHM, CONST_JWT_TOKEN_EXPIRES_IN } from "./constants";

/** The kinds of user JWT; each is accepted only where it belongs. Refresh tokens are opaque, not JWTs. */
export enum TokenKind {
  ACCESS = "access",
}

/** The header type, audience and lifetime that mark each kind of token. */
const TOKEN_KINDS: Record<
  TokenKind,
  {
    typ: string;
    audience: string;
    expiresIn: NonNullable<JwtSignOptions["expiresIn"]>;
  }
> = {
  [TokenKind.ACCESS]: {
    typ: "at+jwt",
    audience: "codeclarity:access",
    expiresIn: CONST_JWT_TOKEN_EXPIRES_IN,
  },
};

/** Sign options that stamp a token with its kind. */
export function signOptionsFor(kind: TokenKind): JwtSignOptions {
  const { typ, audience, expiresIn } = TOKEN_KINDS[kind];
  return {
    algorithm: CONST_JWT_ALGORITHM,
    header: { alg: CONST_JWT_ALGORITHM, typ },
    audience,
    expiresIn,
  };
}

/** Verify options that require the kind's audience and return the header too. */
export function verifyOptionsFor(kind: TokenKind): {
  algorithms: Algorithm[];
  audience: string;
  complete: true;
} {
  return {
    algorithms: [CONST_JWT_ALGORITHM],
    audience: TOKEN_KINDS[kind].audience,
    complete: true,
  };
}

/** Options for a passport-jwt strategy that accepts only this kind. */
export function passportOptionsFor(kind: TokenKind): {
  algorithms: Algorithm[];
  audience: string;
  jsonWebTokenOptions: { complete: true };
} {
  const { algorithms, audience, complete } = verifyOptionsFor(kind);
  return { algorithms, audience, jsonWebTokenOptions: { complete } };
}

/** Returns the claims of a verified token, or throws when its header type is not the kind's. */
export function claimsOfKind(token: Jwt, kind: TokenKind): JwtPayload {
  if (
    token.header.typ !== TOKEN_KINDS[kind].typ ||
    typeof token.payload === "string"
  ) {
    throw new NotAuthenticated();
  }
  return token.payload as SignedClaims & JwtPayload;
}
