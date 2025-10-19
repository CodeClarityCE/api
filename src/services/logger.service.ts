import { Injectable, Logger, LoggerService as NestLoggerService } from '@nestjs/common';

export interface LogContext {
    service?: string;
    userId?: string;
    organizationId?: string;
    projectId?: string;
    analysisId?: string;
    requestId?: string;
    [key: string]: any;
}

/**
 * Structured logging service that outputs JSON logs compatible with Grafana Loki
 * Matches the format used by Go services for consistency across the stack
 */
@Injectable()
export class CodeClarityLogger implements NestLoggerService {
    private readonly nestLogger = new Logger();

    /**
     * Log an informational message
     */
    log(message: string, context?: LogContext) {
        this.writeLog('info', message, this.getFullContext(context));
    }

    /**
     * Log an error message
     */
    error(message: string, error?: Error | string, context?: LogContext) {
        const errorDetails =
            error instanceof Error
                ? { error: error.message, stack: error.stack }
                : error
                  ? { error }
                  : {};

        this.writeLog('error', message, this.getFullContext({ ...context, ...errorDetails }));
    }

    /**
     * Log a warning message
     */
    warn(message: string, context?: LogContext) {
        this.writeLog('warn', message, this.getFullContext(context));
    }

    /**
     * Log a debug message
     */
    debug(message: string, context?: LogContext) {
        this.writeLog('debug', message, this.getFullContext(context));
    }

    /**
     * Log a verbose message
     */
    verbose(message: string, context?: LogContext) {
        this.writeLog('debug', message, this.getFullContext(context));
    }

    /**
     * Write structured log entry in JSON format
     * Format matches Go services: {"level":"info","service":"api","time":"2024-01-01T10:00:00Z","msg":"message","fields":{...}}
     */
    private writeLog(level: string, message: string, context?: LogContext) {
        const logEntry = {
            level,
            service: context?.service || 'api',
            time: new Date().toISOString(),
            msg: message,
            ...(context &&
                Object.keys(context).length > 0 && {
                    fields: this.sanitizeContext(context)
                })
        };

        // Output JSON to stdout for Alloy to collect
        console.log(JSON.stringify(logEntry));
    }

    /**
     * Remove undefined/null values and sanitize sensitive data
     */
    private sanitizeContext(context: LogContext): Record<string, any> {
        const sanitized: Record<string, any> = {};

        for (const [key, value] of Object.entries(context)) {
            if (value !== undefined && value !== null) {
                // Skip service as it's already at top level
                if (key === 'service') continue;

                // Sanitize sensitive fields
                if (this.isSensitiveField(key)) {
                    sanitized[key] = '[REDACTED]';
                } else {
                    sanitized[key] = value;
                }
            }
        }

        return sanitized;
    }

    /**
     * Check if field contains sensitive information
     */
    private isSensitiveField(fieldName: string): boolean {
        const sensitivePatterns = [
            'password',
            'token',
            'key',
            'secret',
            'auth',
            'credential',
            'session',
            'cookie',
            'bearer'
        ];

        const lowerFieldName = fieldName.toLowerCase();
        return sensitivePatterns.some((pattern) => lowerFieldName.includes(pattern));
    }

    /**
     * Create a logger instance with default context
     */
    static forService(serviceName: string): CodeClarityLogger {
        const logger = new CodeClarityLogger();
        // Store default context
        (logger as any).defaultContext = { service: serviceName };
        return logger;
    }

    /**
     * Create child logger with inherited context
     */
    child(additionalContext: LogContext): CodeClarityLogger {
        const childLogger = new CodeClarityLogger();
        const parentContext = (this as any).defaultContext || {};
        (childLogger as any).defaultContext = { ...parentContext, ...additionalContext };
        return childLogger;
    }

    private getFullContext(context?: LogContext): LogContext {
        const defaultContext = (this as any).defaultContext || {};
        return { ...defaultContext, ...context };
    }
}
