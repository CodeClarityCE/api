
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { SKIP_AUTH_KEY } from 'src/decorators/SkipAuthDecorator';
import { NotAuthenticated } from 'src/types/error.types';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    constructor(private reflector: Reflector) {
        super();
    }

    canActivate(context: ExecutionContext) {
        // Check if this endpoint is a public / non-auth endpoint
        const isNonAuthEndpoint = this.reflector.getAllAndOverride<boolean>(SKIP_AUTH_KEY, [
            context.getHandler(),
            context.getClass()
        ]);
        if (isNonAuthEndpoint) {
            return true;
        }

        // Othwerwise check the jwt with the defined jwt strategy
        return super.canActivate(context);
    }

    handleRequest(err: any, user: any) {
        // You can throw an exception based on either "info" or "err" arguments
        if (err || !user) {
            throw err || new NotAuthenticated();
        }
        return user;
    }
}
