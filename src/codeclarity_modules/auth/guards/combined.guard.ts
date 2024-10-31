import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { SKIP_AUTH_KEY } from 'src/decorators/SkipAuthDecorator';
import { AuthenticatedUser, ROLE } from 'src/types/auth/types';
import { NotAuthenticated, AccountNotActivated } from 'src/types/errors/types';
import { Algorithm } from 'jsonwebtoken';
import { JWTPayload } from 'src/types/jwt/types';
import { Request } from 'express';
import { ApiKeysService } from 'src/codeclarity_modules/apiKeys/apiKeys.service';
const fs = require('fs');

/**
 * This is a guard that combines JWT and API authentication.
 */
@Injectable()
export class CombinedAuthGuard implements CanActivate {
    privateKey: string;
    algorithms: Algorithm[];

    constructor(
        private jwtService: JwtService,
        private reflector: Reflector,
        private apiKeyService: ApiKeysService
    ) {
        this.privateKey = fs.readFileSync('./jwt/private.pem', 'utf8');
        this.algorithms = ['ES512'];
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Check if this endpoint is a public / non-auth endpoint
        const isNonAuthEndpoint = this.reflector.getAllAndOverride<boolean>(SKIP_AUTH_KEY, [
            context.getHandler(),
            context.getClass()
        ]);
        if (isNonAuthEndpoint) {
            return true;
        }

        // If the endpoint requires authentication, check jwt and api tokens
        const request: Request = context.switchToHttp().getRequest();
        const jwtToken = this.extractJWTTokenFromHeader(request);
        const apiToken = this.extractAPITokenFromHeader(request);

        // If neither api token nor jwt token are given, the user is not authenticated
        if (!jwtToken && !apiToken) {
            throw new NotAuthenticated();
        }

        if (jwtToken) {
            // 1. Verify jwt token (stateless no db lookup -> faster)
            const [jwtTokenValid, userJWT] = await this.verifyJWTToken(jwtToken);
            if (!userJWT?.activated) throw new AccountNotActivated();
            if (jwtTokenValid) {
                request['user'] = userJWT;
                return true;
            }
        }

        throw new Error('Not implemented');
        // if (apiToken) {
        //     // 2. Verify api token (costly, requires db lookup)
        //     const [apiTokenValid, userAPI] = await this.verifyAPIToken(apiToken);
        //     if (!userAPI?.activated) throw new AccountNotActivated();
        //     if (apiTokenValid) {
        //         await this.apiKeyService.addApiKeyUsageLog(
        //             await this.apiKeyService.getApiKeyDigest(apiToken),
        //             request.originalUrl,
        //             request.ip || ''
        //         );
        //         request['user'] = userAPI;
        //         return true;
        //     }
        // }

        throw new NotAuthenticated();
    }

    /**
     * Extracts the JWT token from the HTTP headers
     * @param request Request object
     * @returns {Promise<string | undefined>} the bearer token, if present, otherwise undefined.
     */
    private extractJWTTokenFromHeader(request: Request): string | undefined {
        const authHeader = request.headers.authorization;
        if (authHeader) {
            const [type, token] = authHeader.split(' ') ?? [];
            if (type === 'Bearer') {
                return token;
            }
        }
        return undefined;
    }

    /**
     * Extracts the API token from the HTTP headers
     * @param request Request object
     * @returns {Promise<[string | undefined]>} the api token, if present, otherwise undefined.
     */
    private extractAPITokenFromHeader(request: Request): string | undefined {
        const apiHeader = request.headers['x-api-key'] ?? request.headers['X-API-KEY'];
        if (apiHeader && typeof apiHeader == 'string') {
            return apiHeader;
        }
        return undefined;
    }

    /**
     * Verifies that a given JWT token is valid.
     * @param token the JWT token
     * @returns {Promise<[boolean, AuthenticatedUser|undefined]>} (1) a boolean indicating if it is valid, and (2) the user to which the JWT token belongs if valid otherwise undefined
     */
    private async verifyJWTToken(token: string): Promise<[boolean, AuthenticatedUser | undefined]> {
        try {
            const payload: JWTPayload = await this.jwtService.verifyAsync(token, {
                secret: this.privateKey,
                algorithms: this.algorithms
            });
            // TODO: get roles from payload
            return [
                true,
                new AuthenticatedUser(
                    payload.userId,
                    payload.roles as Array<ROLE>,
                    payload.activated
                )
            ];
        } catch (error) {
            return [false, undefined];
        }
    }

    /**
     * Verifies that a given API token is valid.
     * @param token the API token
     * @returns {Promise<[boolean, AuthenticatedUser|undefined]>} (1) a boolean indicating if it is valid, and (2) the user to which the API token belongs if valid otherwise undefined
     */
    private async verifyAPIToken(token: string): Promise<[boolean, AuthenticatedUser | undefined]> {
        throw new Error('Not implemented');
        // try {
        //     const user: User = await this.apiKeyService.getUserOfApiKey(token);
        //     // TODO: get roles from db
        //     return [true, new AuthenticatedUser(user.id, [ROLE.USER], user.activated, token)];
        // } catch (error) {
        //     return [false, undefined];
        // }
    }
}