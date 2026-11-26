import type { JwtSignOptions } from "@nestjs/jwt";
import type { Algorithm, Jwt, JwtPayload as SignedClaims } from "jsonwebtoken";

import { NotAuthenticated } from "src/types/error.types";

import type { JwtPayload } from "./auth.types";
import {
  CONST_JWT_ALGORITHM,
  CONST_JWT_TOKEN_EXPIRES_IN,
  CONST_REFRESH_JWT_TOKEN_EXPIRES_IN,
} from "./constants";

/** The two kinds of user JWT; each is accepted only where it belongs. */
export enum TokenKind {
  ACCESS = "access",
  REFRESH = "refresh",
}

/** Each kind's `typ` header and `aud` claim (RFC 8725 explicit typing, RFC 9068 for access). */
export const TOKEN_KINDS: Record<
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
  [TokenKind.REFRESH]: {
    typ: "refresh+jwt",
    audience: "codeclarity:refresh",
    expiresIn: CONST_REFRESH_JWT_TOKEN_EXPIRES_IN,
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

/**
 * Returns the claims of a verified token, or throws when its `typ` header is
 * not the kind's (tokens of the other kind, or issued before typing).
 */
export function claimsOfKind(token: Jwt, kind: TokenKind): JwtPayload {
  if (
    token.header.typ !== TOKEN_KINDS[kind].typ ||
    typeof token.payload === "string"
  ) {
    throw new NotAuthenticated();
  }
  return token.payload as SignedClaims & JwtPayload;
}
