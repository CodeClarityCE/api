import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotAuthenticated } from 'src/types/error.types';
import { JwtValidationResult } from '../auth.types';

/**
 * This guard enables refreshing jwt tokens with the provided refresh token
 */
@Injectable()
export class RefreshJwtAuthGuard extends AuthGuard('jwt-refresh') {
    canActivate(context: ExecutionContext): boolean | Promise<boolean> {
        // Othwerwise check the jwt with the defined jwt strategy
        return super.canActivate(context) as boolean | Promise<boolean>;
    }

    handleRequest<TUser = JwtValidationResult>(err: Error | null, user: TUser | false): TUser {
        // You can throw an exception based on either "info" or "err" arguments
        if (err || !user) {
            throw err ?? new NotAuthenticated();
        }
        return user;
    }
}
