import type { ExecutionContext } from '@nestjs/common';
import { createParamDecorator } from '@nestjs/common';

export const AuthUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): any => {
    if (ctx.getType() === 'ws') {
        const request = ctx.switchToWs().getClient();
        return request.data.user;
    } else {
        const request = ctx.switchToHttp().getRequest();
        return request.user;
    }
});
