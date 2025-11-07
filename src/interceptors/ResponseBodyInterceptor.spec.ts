import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { Status } from 'src/types/apiResponses.types';
import { ResponseBodyInterceptor } from './ResponseBodyInterceptor';

describe('ResponseBodyInterceptor', () => {
    let interceptor: ResponseBodyInterceptor;
    let mockExecutionContext: jest.Mocked<ExecutionContext>;
    let mockCallHandler: jest.Mocked<CallHandler>;
    let mockResponse: { statusCode: number };

    beforeEach(() => {
        interceptor = new ResponseBodyInterceptor();

        mockResponse = { statusCode: 200 };

        mockExecutionContext = {
            switchToHttp: jest.fn().mockReturnValue({
                getResponse: jest.fn().mockReturnValue(mockResponse)
            })
        } as any;

        mockCallHandler = {
            handle: jest.fn()
        } as any;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('intercept', () => {
        it('should add status_code and status fields to response with success status for 2xx status codes', (done) => {
            const responseData = { message: 'test' };
            mockCallHandler.handle.mockReturnValue(of(responseData));
            mockResponse.statusCode = 200;

            const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

            result$.subscribe((result) => {
                expect(result).toEqual({
                    message: 'test',
                    status_code: 200,
                    status: Status.Success
                });
                done();
            });
        });

        it('should add status_code and status fields to response with failure status for 4xx status codes', (done) => {
            const responseData = { error: 'Not found' };
            mockCallHandler.handle.mockReturnValue(of(responseData));
            mockResponse.statusCode = 404;

            const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

            result$.subscribe((result) => {
                expect(result).toEqual({
                    error: 'Not found',
                    status_code: 404,
                    status: Status.Failure
                });
                done();
            });
        });

        it('should add status_code and status fields to response with failure status for 5xx status codes', (done) => {
            const responseData = { error: 'Internal server error' };
            mockCallHandler.handle.mockReturnValue(of(responseData));
            mockResponse.statusCode = 500;

            const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

            result$.subscribe((result) => {
                expect(result).toEqual({
                    error: 'Internal server error',
                    status_code: 500,
                    status: Status.Failure
                });
                done();
            });
        });

        it('should preserve existing status_code in response data', (done) => {
            const responseData = { message: 'test', status_code: 201 };
            mockCallHandler.handle.mockReturnValue(of(responseData));
            mockResponse.statusCode = 200;

            const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

            result$.subscribe((result) => {
                expect(result).toEqual({
                    message: 'test',
                    status_code: 201, // Original value preserved
                    status: Status.Success
                });
                done();
            });
        });

        it('should preserve existing status in response data', (done) => {
            const responseData = { message: 'test', status: Status.Failure };
            mockCallHandler.handle.mockReturnValue(of(responseData));
            mockResponse.statusCode = 200;

            const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

            result$.subscribe((result) => {
                expect(result).toEqual({
                    message: 'test',
                    status_code: 200,
                    status: Status.Failure // Original value preserved
                });
                done();
            });
        });

        it('should handle null response data', (done) => {
            mockCallHandler.handle.mockReturnValue(of(null));
            mockResponse.statusCode = 200;

            const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

            result$.subscribe((result) => {
                expect(result).toEqual({
                    status_code: 200,
                    status: Status.Success
                });
                done();
            });
        });

        it('should handle undefined response data', (done) => {
            mockCallHandler.handle.mockReturnValue(of(undefined));
            mockResponse.statusCode = 200;

            const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

            result$.subscribe((result) => {
                expect(result).toEqual({
                    status_code: 200,
                    status: Status.Success
                });
                done();
            });
        });

        it('should handle empty object response data', (done) => {
            mockCallHandler.handle.mockReturnValue(of({}));
            mockResponse.statusCode = 200;

            const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

            result$.subscribe((result) => {
                expect(result).toEqual({
                    status_code: 200,
                    status: Status.Success
                });
                done();
            });
        });

        it('should handle complex nested response data', (done) => {
            const responseData = {
                data: {
                    users: [
                        { id: 1, name: 'John' },
                        { id: 2, name: 'Jane' }
                    ],
                    metadata: {
                        total: 2,
                        page: 1
                    }
                }
            };
            mockCallHandler.handle.mockReturnValue(of(responseData));
            mockResponse.statusCode = 200;

            const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

            result$.subscribe((result) => {
                expect(result).toEqual({
                    ...responseData,
                    status_code: 200,
                    status: Status.Success
                });
                done();
            });
        });

        describe('status code boundary conditions', () => {
            it('should set success status for status code 399', (done) => {
                mockCallHandler.handle.mockReturnValue(of({ message: 'test' }));
                mockResponse.statusCode = 399;

                const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

                result$.subscribe((result) => {
                    expect(result.status).toBe(Status.Success);
                    done();
                });
            });

            it('should set failure status for status code 400', (done) => {
                mockCallHandler.handle.mockReturnValue(of({ error: 'Bad request' }));
                mockResponse.statusCode = 400;

                const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

                result$.subscribe((result) => {
                    expect(result.status).toBe(Status.Failure);
                    done();
                });
            });

            it('should set failure status for status code 599', (done) => {
                mockCallHandler.handle.mockReturnValue(of({ error: 'Server error' }));
                mockResponse.statusCode = 599;

                const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

                result$.subscribe((result) => {
                    expect(result.status).toBe(Status.Failure);
                    done();
                });
            });

            it('should set success status for status code 600', (done) => {
                mockCallHandler.handle.mockReturnValue(of({ message: 'test' }));
                mockResponse.statusCode = 600;

                const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

                result$.subscribe((result) => {
                    expect(result.status).toBe(Status.Success);
                    done();
                });
            });
        });

        describe('array response data', () => {
            it('should handle array response data', (done) => {
                const responseData = [
                    { id: 1, name: 'Item 1' },
                    { id: 2, name: 'Item 2' }
                ];
                mockCallHandler.handle.mockReturnValue(of(responseData));
                mockResponse.statusCode = 200;

                const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

                result$.subscribe((result) => {
                    expect(result).toEqual({
                        0: { id: 1, name: 'Item 1' },
                        1: { id: 2, name: 'Item 2' },
                        status_code: 200,
                        status: Status.Success
                    });
                    done();
                });
            });
        });

        describe('primitive response data', () => {
            it('should handle string response data', (done) => {
                const responseData = 'test';
                mockCallHandler.handle.mockReturnValue(of(responseData));
                mockResponse.statusCode = 200;

                const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

                result$.subscribe((result) => {
                    // String gets spread into object with numeric keys for each character
                    expect(result).toEqual({
                        0: 't',
                        1: 'e',
                        2: 's',
                        3: 't',
                        status_code: 200,
                        status: Status.Success
                    });
                    done();
                });
            });

            it('should handle number response data', (done) => {
                const responseData = 42;
                mockCallHandler.handle.mockReturnValue(of(responseData));
                mockResponse.statusCode = 200;

                const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

                result$.subscribe((result) => {
                    expect(result).toEqual({
                        status_code: 200,
                        status: Status.Success
                    });
                    done();
                });
            });

            it('should handle boolean response data', (done) => {
                const responseData = true;
                mockCallHandler.handle.mockReturnValue(of(responseData));
                mockResponse.statusCode = 200;

                const result$ = interceptor.intercept(mockExecutionContext, mockCallHandler);

                result$.subscribe((result) => {
                    expect(result).toEqual({
                        status_code: 200,
                        status: Status.Success
                    });
                    done();
                });
            });
        });

        it('should call ExecutionContext and CallHandler correctly', (done) => {
            const responseData = { message: 'test' };
            mockCallHandler.handle.mockReturnValue(of(responseData));

            interceptor.intercept(mockExecutionContext, mockCallHandler);

            expect(mockExecutionContext.switchToHttp).toHaveBeenCalledTimes(1);
            expect(mockCallHandler.handle).toHaveBeenCalledTimes(1);
            done();
        });
    });
});
