import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import * as fs from "fs";
import type { Jwt } from "jsonwebtoken";
import { ExtractJwt, Strategy } from "passport-jwt";

import { JwtValidationResult } from "../auth.types";
import { claimsOfKind, passportOptionsFor, TokenKind } from "../token-kinds";

@Injectable()
export class RefreshJWTStrategy extends PassportStrategy(
  Strategy,
  "jwt-refresh",
) {
  constructor() {
    // Only refresh tokens pass: the audience is checked here, the typ in validate.
    super({
      jwtFromRequest: ExtractJwt.fromBodyField("refresh_token"),
      ignoreExpiration: false,
      secretOrKey: fs.readFileSync("./jwt/private.pem", "utf8"),
      ...passportOptionsFor(TokenKind.REFRESH),
    });
  }

  async validate(token: Jwt): Promise<JwtValidationResult> {
    const payload = claimsOfKind(token, TokenKind.REFRESH);
    // Refreshed tokens are signed from this result, so it must keep activated.
    return {
      userId: payload.userId,
      roles: payload.roles,
      activated: payload.activated,
    };
  }
}
