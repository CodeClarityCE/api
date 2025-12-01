import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Socket } from 'socket.io';
import type { AuthenticatedUser } from 'src/base_modules/auth/auth.types';

/** Extended FastifyRequest with user property from auth guard */
interface AuthenticatedRequest extends FastifyRequest {
    user?: AuthenticatedUser;
}

/** Extended Socket with user data from auth guard */
interface AuthenticatedSocket extends Socket {
    data: {
        user?: AuthenticatedUser;
    };
}

export const AuthUser = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
        if (ctx.getType() === 'ws') {
            const client = ctx.switchToWs().getClient<AuthenticatedSocket>();
            return client.data.user;
        } else {
            const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
            return request.user;
        }
    }
);
