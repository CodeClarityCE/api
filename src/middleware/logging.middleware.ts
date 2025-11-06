import { randomUUID } from 'crypto';


import { Injectable, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { CodeClarityLogger, LogContext } from 'src/services/logger.service';

export interface RequestWithLogging extends FastifyRequest {
    requestId?: string;
    startTime?: number;
    logger?: CodeClarityLogger;
}

/**
 * Middleware for logging HTTP requests and responses
 * Adds request IDs, timing, and structured logging for all API calls
 */
@Injectable()
export class LoggingMiddleware implements NestMiddleware {
    private readonly logger = CodeClarityLogger.forService('api-http');

    use(req: RequestWithLogging, res: FastifyReply, next: () => void): void {
        // Generate unique request ID
        const requestId = randomUUID();
        req.requestId = requestId;
        req.startTime = Date.now();

        // Create request-scoped logger
        req.logger = this.logger.child({ requestId });

        // Extract user info if available
        const userId = (req as any).user?.userId;
        const organizationId = (req as any).user?.organizationId;

        // Log incoming request
        const requestContext: LogContext = {
            requestId,
            method: req.method,
            url: req.url,
            userAgent: req.headers['user-agent']!,
            ip: this.getClientIP(req),
            ...(userId && { userId }),
            ...(organizationId && { organizationId })
        };

        // Don't log sensitive headers
        const sanitizedHeaders = this.sanitizeHeaders(req.headers);
        if (Object.keys(sanitizedHeaders).length > 0) {
            requestContext['headers'] = sanitizedHeaders;
        }

        req.logger.log('HTTP request started', requestContext);

        // Hook into response completion for Fastify
        res.raw.on('finish', () => {
            const duration = Date.now() - (req.startTime || Date.now());

            const responseContext: LogContext = {
                requestId,
                method: req.method,
                url: req.url,
                statusCode: res.statusCode,
                duration,
                ...(userId && { userId }),
                ...(organizationId && { organizationId })
            };

            // Determine log level based on status code
            if (res.statusCode >= 500) {
                req.logger?.error(
                    'HTTP request completed with server error',
                    undefined,
                    responseContext
                );
            } else if (res.statusCode >= 400) {
                req.logger?.warn('HTTP request completed with client error', responseContext);
            } else {
                req.logger?.log('HTTP request completed successfully', responseContext);
            }
        });

        next();
    }

    /**
     * Get client IP address from request
     */
    private getClientIP(req: FastifyRequest): string {
        return (
            (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
            (req.headers['x-real-ip'] as string) ||
            req.socket?.remoteAddress ||
            'unknown'
        );
    }

    /**
     * Remove sensitive headers from logging
     */
    private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
        const sensitiveHeaders = [
            'authorization',
            'cookie',
            'set-cookie',
            'x-api-key',
            'x-auth-token',
            'bearer',
            'password',
            'secret'
        ];

        const sanitized: Record<string, any> = {};

        Object.entries(headers).forEach(([key, value]) => {
            const lowerKey = key.toLowerCase();

            if (!sensitiveHeaders.some((sensitive) => lowerKey.includes(sensitive))) {
                // Only include common, useful headers
                if (
                    [
                        'content-type',
                        'content-length',
                        'accept',
                        'user-agent',
                        'host',
                        'origin'
                    ].includes(lowerKey)
                ) {
                    sanitized[key] = value;
                }
            }
        });

        return sanitized;
    }
}

/**
 * Decorator to extend Express Request with logging properties
 */
export function RequestLogger() {
    return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
        const method = descriptor.value;

        descriptor.value = function (...args: any[]) {
            const req = args.find(
                (arg) => arg && typeof arg === 'object' && arg.requestId
            ) as RequestWithLogging;

            if (req?.logger) {
                // Add method-specific context
                const context: LogContext = {
                    controller: target.constructor.name,
                    method: propertyName
                };
                if (req.requestId) {
                    context.requestId = req.requestId;
                }

                req.logger.debug('Controller method called', context);
            }

            return method.apply(this, args);
        };
    };
}
