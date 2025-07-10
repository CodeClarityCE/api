import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import fs from 'fs';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: fs.readFileSync('./jwt/private.pem', 'utf8'),
            algorithms: ['ES512']
        });
    }

    async validate(payload: any) {
        return { userId: payload.userId, roles: payload.roles };
    }
}
