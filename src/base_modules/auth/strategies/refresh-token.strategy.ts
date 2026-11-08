import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import * as fs from "fs";
import { ExtractJwt, Strategy } from "passport-jwt";

import { JwtPayload, JwtValidationResult } from "../auth.types";

@Injectable()
export class RefreshJWTStrategy extends PassportStrategy(
  Strategy,
  "jwt-refresh",
) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField("refresh_token"),
      ignoreExpiration: false,
      secretOrKey: fs.readFileSync("./jwt/private.pem", "utf8"),
      algorithms: ["ES512"],
    });
  }

  async validate(payload: JwtPayload): Promise<JwtValidationResult> {
    // Refreshed tokens are signed from this result, so it must keep activated.
    return {
      userId: payload.userId,
      roles: payload.roles,
      activated: payload.activated,
    };
  }
}
