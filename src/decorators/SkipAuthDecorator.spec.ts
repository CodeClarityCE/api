import { SetMetadata } from '@nestjs/common';

import { SKIP_AUTH_KEY } from './SkipAuthDecorator';

jest.mock('@nestjs/common', () => ({
    SetMetadata: jest.fn()
}));

describe('SkipAuthDecorator', () => {
    const mockSetMetadata = SetMetadata as jest.MockedFunction<typeof SetMetadata>;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('SKIP_AUTH_KEY', () => {
        it('should have the correct value', () => {
            expect(SKIP_AUTH_KEY).toBe('AUTH_END_POINT_DISABLE');
        });

        it('should be a string', () => {
            expect(typeof SKIP_AUTH_KEY).toBe('string');
        });
    });

    describe('NonAuthEndpoint', () => {
        it('should call SetMetadata with correct parameters', async () => {
            const mockDecorator = jest.fn() as any;
            mockSetMetadata.mockReturnValue(mockDecorator);

            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const module = await import('./SkipAuthDecorator');
            const result = module.NonAuthEndpoint();

            expect(mockSetMetadata).toHaveBeenCalledWith(SKIP_AUTH_KEY, true);
            expect(result).toBe(mockDecorator);
        });

        it('should return the result from SetMetadata', async () => {
            const expectedDecorator = jest.fn() as any;
            mockSetMetadata.mockReturnValue(expectedDecorator);

            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const module = await import('./SkipAuthDecorator');
            const actualDecorator = module.NonAuthEndpoint();

            expect(actualDecorator).toBe(expectedDecorator);
        });

        it('should create a reusable decorator', async () => {
            const mockDecorator1 = jest.fn() as any;
            const mockDecorator2 = jest.fn() as any;

            mockSetMetadata.mockReturnValueOnce(mockDecorator1).mockReturnValueOnce(mockDecorator2);

            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const module = await import('./SkipAuthDecorator');
            const decorator1 = module.NonAuthEndpoint();
            const decorator2 = module.NonAuthEndpoint();

            expect(decorator1).toBe(mockDecorator1);
            expect(decorator2).toBe(mockDecorator2);
            expect(mockSetMetadata).toHaveBeenCalledTimes(2);
            expect(mockSetMetadata).toHaveBeenNthCalledWith(1, SKIP_AUTH_KEY, true);
            expect(mockSetMetadata).toHaveBeenNthCalledWith(2, SKIP_AUTH_KEY, true);
        });
    });

    describe('integration', () => {
        it('should use the same key constant for metadata', async () => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const module = await import('./SkipAuthDecorator');
            module.NonAuthEndpoint();

            expect(mockSetMetadata).toHaveBeenCalledWith('AUTH_END_POINT_DISABLE', true);
        });

        it('should always set metadata value to true', async () => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            const module = await import('./SkipAuthDecorator');
            module.NonAuthEndpoint();
            module.NonAuthEndpoint();
            module.NonAuthEndpoint();

            expect(mockSetMetadata).toHaveBeenCalledWith(SKIP_AUTH_KEY, true);
            mockSetMetadata.mock.calls.forEach((call) => {
                expect(call[1]).toBe(true);
            });
        });
    });
});
