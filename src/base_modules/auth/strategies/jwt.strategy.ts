import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import * as fs from "fs";
import { ExtractJwt, Strategy } from "passport-jwt";

import { JwtPayload, JwtValidationResult } from "../auth.types";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: fs.readFileSync("./jwt/private.pem", "utf8"),
      algorithms: ["ES512"],
    });
  }

  async validate(payload: JwtPayload): Promise<JwtValidationResult> {
    return { userId: payload.userId, roles: payload.roles };
  }
}
