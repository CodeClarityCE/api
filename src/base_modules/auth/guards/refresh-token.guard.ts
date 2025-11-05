import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotAuthenticated } from 'src/types/error.types';

/**
 * This guard enables refreshing jwt tokens with the provided refresh token
 */
@Injectable()
export class RefreshJwtAuthGuard extends AuthGuard('jwt-refresh') {
    canActivate(context: ExecutionContext) {
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
