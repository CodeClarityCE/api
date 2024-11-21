import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const AuthUser = createParamDecorator((data: unknown, ctx: ExecutionContext): any => {
    if (ctx.getType() == 'ws') {
        const request = ctx.switchToWs().getClient();
        return request.data['user'];
    } else {
        const request = ctx.switchToHttp().getRequest();
        return request.user;
    }
});
