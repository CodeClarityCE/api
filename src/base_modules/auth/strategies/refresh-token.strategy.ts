import * as fs from 'fs';

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';


@Injectable()
export class RefreshJWTStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromBodyField('refresh_token'),
            ignoreExpiration: false,
            secretOrKey: fs.readFileSync('./jwt/private.pem', 'utf8'),
            algorithms: ['ES512']
        });
    }

    async validate(payload: any): Promise<{ userId: any; roles: any }> {
        return { userId: payload.userId, roles: payload.roles };
    }
}
