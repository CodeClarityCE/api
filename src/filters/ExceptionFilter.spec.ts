import { HttpException, type ArgumentsHost } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { Status } from 'src/types/apiResponses.types';
import {
    PublicAPIError,
    PrivateAPIError,
    NotAuthenticated,
    ValidationFailed
} from 'src/types/error.types';
import { ErrorFilter } from './ExceptionFilter';

describe('ExceptionFilter', () => {
    let filter: ErrorFilter;
    let mockArgumentsHost: jest.Mocked<ArgumentsHost>;
    let mockResponse: {
        status: jest.Mock;
        send: jest.Mock;
    };

    beforeEach(() => {
        filter = new ErrorFilter();

        mockResponse = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn()
        };

        mockArgumentsHost = {
            switchToHttp: jest.fn().mockReturnValue({
                getResponse: jest.fn().mockReturnValue(mockResponse)
            })
        } as any;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('catch', () => {
        describe('PublicAPIError handling', () => {
            it('should handle PublicAPIError with snake_case conversion', () => {
                const publicError = new NotAuthenticated();
                (publicError as any).someExtraField = 'value';
                (publicError as any).camelCaseField = 'test';

                filter.catch(publicError, mockArgumentsHost);

                expect(mockResponse.status).toHaveBeenCalledWith(401);
                expect(mockResponse.send).toHaveBeenCalledTimes(1);

                const sentData = JSON.parse(mockResponse.send.mock.calls[0][0]);
                expect(sentData).toEqual({
                    status_code: 401,
                    status: Status.Failure,
                    error_code: 'NotAuthenticated',
                    error_message: 'You are not authenticated.',
                    some_extra_field: 'value',
                    camel_case_field: 'test'
                });
                expect(sentData.errorCause).toBeUndefined();
            });

            it('should handle ValidationFailed error', () => {
                const validationErrors: ValidationError[] = [
                    {
                        property: 'email',
                        constraints: {
                            isEmail: 'email must be a valid email',
                            isNotEmpty: 'email should not be empty'
                        }
                    } as ValidationError,
                    {
                        property: 'password',
                        constraints: {
                            minLength: 'password must be at least 8 characters'
                        }
                    } as ValidationError
                ];

                const validationError = new ValidationFailed(validationErrors);

                filter.catch(validationError, mockArgumentsHost);

                expect(mockResponse.status).toHaveBeenCalledWith(400);

                const sentData = JSON.parse(mockResponse.send.mock.calls[0][0]);
                expect(sentData.status_code).toBe(400);
                expect(sentData.status).toBe(Status.Failure);
                expect(sentData.error_code).toBe('ValidationFailed');
                expect(sentData.validation_errors).toEqual([
                    {
                        property: 'email',
                        errors: ['email must be a valid email', 'email should not be empty']
                    },
                    {
                        property: 'password',
                        errors: ['password must be at least 8 characters']
                    }
                ]);
            });

            it('should remove errorCause from PublicAPIError response', () => {
                const publicError = new PublicAPIError(
                    'TestError',
                    'Test message',
                    400,
                    'sensitive information'
                );

                filter.catch(publicError, mockArgumentsHost);

                const sentData = JSON.parse(mockResponse.send.mock.calls[0][0]);
                expect(sentData.errorCause).toBeUndefined();
                expect(sentData.error_cause).toBeUndefined();
            });
        });

        describe('PrivateAPIError handling', () => {
            it('should handle PrivateAPIError and return generic response', () => {
                const privateError = new PrivateAPIError(
                    'InternalError',
                    'Generic message',
                    500,
                    'DetailedLoggingCode',
                    'Detailed logging message with sensitive info'
                );

                filter.catch(privateError, mockArgumentsHost);

                expect(mockResponse.status).toHaveBeenCalledWith(500);
                expect(mockResponse.send).toHaveBeenCalledWith(
                    JSON.stringify({
                        status_code: 500,
                        status: Status.Failure,
                        error_code: 'InternalError',
                        error_message: 'Generic message'
                    })
                );
            });

            it('should handle PrivateAPIError with different status codes', () => {
                const privateError = new PrivateAPIError(
                    'ValidationError',
                    'Invalid input',
                    422,
                    'DETAILED_VALIDATION_ERROR',
                    'Field X failed validation Y because of Z'
                );

                filter.catch(privateError, mockArgumentsHost);

                expect(mockResponse.status).toHaveBeenCalledWith(422);
                expect(mockResponse.send).toHaveBeenCalledWith(
                    JSON.stringify({
                        status_code: 422,
                        status: Status.Failure,
                        error_code: 'ValidationError',
                        error_message: 'Invalid input'
                    })
                );
            });
        });

        describe('HttpException handling', () => {
            it('should handle standard HttpException', () => {
                const httpError = new HttpException('Resource not found', 404);

                filter.catch(httpError, mockArgumentsHost);

                expect(mockResponse.status).toHaveBeenCalledWith(404);
                expect(mockResponse.send).toHaveBeenCalledWith(
                    JSON.stringify({
                        status_code: 404,
                        status: Status.Failure,
                        error_code: 'InternalError',
                        error_message: 'Resource not found'
                    })
                );
            });

            it('should handle HttpException with different status codes', () => {
                const httpError = new HttpException('Unauthorized access', 401);

                filter.catch(httpError, mockArgumentsHost);

                expect(mockResponse.status).toHaveBeenCalledWith(401);
                expect(mockResponse.send).toHaveBeenCalledWith(
                    JSON.stringify({
                        status_code: 401,
                        status: Status.Failure,
                        error_code: 'InternalError',
                        error_message: 'Unauthorized access'
                    })
                );
            });
        });

        describe('FastifyError handling', () => {
            it('should handle FastifyError with 4xx status code', () => {
                const fastifyError = new Error('Request entity too large');
                (fastifyError as any).name = 'FastifyError';
                (fastifyError as any).statusCode = 413;
                (fastifyError as any).message = 'Request entity too large';

                filter.catch(fastifyError, mockArgumentsHost);

                expect(mockResponse.status).toHaveBeenCalledWith(400);
                expect(mockResponse.send).toHaveBeenCalledWith(
                    JSON.stringify({
                        status_code: 400,
                        status: Status.Failure,
                        error_code: 'BadRequest',
                        error_message: 'Request entity too large'
                    })
                );
            });

            it('should handle FastifyError with 5xx status code as generic error', () => {
                const fastifyError = new Error('Internal server error');
                (fastifyError as any).name = 'FastifyError';
                (fastifyError as any).statusCode = 500;
                (fastifyError as any).message = 'Internal server error';

                filter.catch(fastifyError, mockArgumentsHost);

                expect(mockResponse.status).toHaveBeenCalledWith(500);
                expect(mockResponse.send).toHaveBeenCalledWith(
                    JSON.stringify({
                        status_code: 500,
                        status: Status.Failure,
                        error_code: 'InternalError',
                        error_message: 'We encountered a problem while processing your request.'
                    })
                );
            });

            it('should handle FastifyError with status code below 400 as generic error', () => {
                const fastifyError = new Error('Some info message');
                (fastifyError as any).name = 'FastifyError';
                (fastifyError as any).statusCode = 200;
                (fastifyError as any).message = 'Some info message';

                filter.catch(fastifyError, mockArgumentsHost);

                expect(mockResponse.status).toHaveBeenCalledWith(500);
                expect(mockResponse.send).toHaveBeenCalledWith(
                    JSON.stringify({
                        status_code: 500,
                        status: Status.Failure,
                        error_code: 'InternalError',
                        error_message: 'We encountered a problem while processing your request.'
                    })
                );
            });
        });

        describe('Generic Error handling', () => {
            it('should handle generic Error as InternalError', () => {
                const genericError = new Error('Something went wrong');

                filter.catch(genericError, mockArgumentsHost);

                expect(mockResponse.status).toHaveBeenCalledWith(500);
                expect(mockResponse.send).toHaveBeenCalledWith(
                    JSON.stringify({
                        status_code: 500,
                        status: Status.Failure,
                        error_code: 'InternalError',
                        error_message: 'We encountered a problem while processing your request.'
                    })
                );
            });

            it('should handle TypeError as InternalError', () => {
                const typeError = new TypeError('Cannot read property of undefined');

                filter.catch(typeError, mockArgumentsHost);

                expect(mockResponse.status).toHaveBeenCalledWith(500);
                expect(mockResponse.send).toHaveBeenCalledWith(
                    JSON.stringify({
                        status_code: 500,
                        status: Status.Failure,
                        error_code: 'InternalError',
                        error_message: 'We encountered a problem while processing your request.'
                    })
                );
            });

            it('should handle ReferenceError as InternalError', () => {
                const refError = new ReferenceError('Variable is not defined');

                filter.catch(refError, mockArgumentsHost);

                expect(mockResponse.status).toHaveBeenCalledWith(500);
                expect(mockResponse.send).toHaveBeenCalledWith(
                    JSON.stringify({
                        status_code: 500,
                        status: Status.Failure,
                        error_code: 'InternalError',
                        error_message: 'We encountered a problem while processing your request.'
                    })
                );
            });
        });

        describe('ArgumentsHost interaction', () => {
            it('should call ArgumentsHost methods correctly', () => {
                const error = new Error('test error');

                filter.catch(error, mockArgumentsHost);

                expect(mockArgumentsHost.switchToHttp).toHaveBeenCalledTimes(1);
                expect(mockArgumentsHost.switchToHttp().getResponse).toHaveBeenCalledTimes(1);
            });

            it('should call response methods correctly', () => {
                const error = new NotAuthenticated();

                filter.catch(error, mockArgumentsHost);

                expect(mockResponse.status).toHaveBeenCalledTimes(1);
                expect(mockResponse.send).toHaveBeenCalledTimes(1);
            });
        });
    });

    describe('snakeCase conversion', () => {
        it('should convert camelCase to snake_case in nested objects', () => {
            const publicError = new PublicAPIError('TestError', 'Test message', 400);
            (publicError as any).nestedObject = {
                camelCaseField: 'value1',
                anotherCamelCase: 'value2',
                deepNested: {
                    veryDeepCamelCase: 'deep value',
                    normalfield: 'normal'
                }
            };

            filter.catch(publicError, mockArgumentsHost);

            const sentData = JSON.parse(mockResponse.send.mock.calls[0][0]);
            expect(sentData.nested_object).toBeDefined();
            expect(sentData.nested_object.camel_case_field).toBe('value1');
            expect(sentData.nested_object.another_camel_case).toBe('value2');
            expect(sentData.nested_object.deep_nested.very_deep_camel_case).toBe('deep value');
            expect(sentData.nested_object.deep_nested.normalfield).toBe('normal');
        });

        it('should handle arrays within objects', () => {
            const publicError = new PublicAPIError('TestError', 'Test message', 400);
            (publicError as any).arrayField = [
                { itemName: 'item1', itemValue: 'value1' },
                { itemName: 'item2', itemValue: 'value2' }
            ];

            filter.catch(publicError, mockArgumentsHost);

            const sentData = JSON.parse(mockResponse.send.mock.calls[0][0]);
            expect(sentData.array_field).toEqual([
                { item_name: 'item1', item_value: 'value1' },
                { item_name: 'item2', item_value: 'value2' }
            ]);
        });

        it('should handle camelCase to snake_case conversion', () => {
            const publicError = new PublicAPIError('TestError', 'Test message', 400);
            (publicError as any).userFirstName = 'John';
            (publicError as any).isActiveUser = true;
            (publicError as any).createdAt = '2023-01-01';
            (publicError as any).httpStatusCode = 400;

            filter.catch(publicError, mockArgumentsHost);

            const sentData = JSON.parse(mockResponse.send.mock.calls[0][0]);
            expect(sentData.user_first_name).toBe('John');
            expect(sentData.is_active_user).toBe(true);
            expect(sentData.created_at).toBe('2023-01-01');
            expect(sentData.http_status_code).toBe(400);
        });

        it('should preserve already snake_case fields', () => {
            const publicError = new PublicAPIError('TestError', 'Test message', 400);
            (publicError as any).already_snake_case = 'preserved';
            (publicError as any).mixed_camelCase = 'converted';

            filter.catch(publicError, mockArgumentsHost);

            const sentData = JSON.parse(mockResponse.send.mock.calls[0][0]);
            expect(sentData.already_snake_case).toBe('preserved');
            expect(sentData.mixed_camel_case).toBe('converted');
        });
    });
});
