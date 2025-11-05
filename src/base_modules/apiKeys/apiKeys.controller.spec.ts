import { AuthenticatedUser, ROLE } from 'src/base_modules/auth/auth.types';

import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { ApiKeysController } from './apiKeys.controller';
import { ApiKeysService } from './apiKeys.service';


describe('ApiKeysController', () => {
    let controller: ApiKeysController;
    let apiKeysService: jest.Mocked<ApiKeysService>;

    const mockAuthenticatedUser: AuthenticatedUser = new AuthenticatedUser(
        'test-user-id',
        [ROLE.USER],
        true
    );

    beforeEach(async () => {
        const mockApiKeysService = {
            deleteApiKey: jest.fn()
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [ApiKeysController],
            providers: [{ provide: ApiKeysService, useValue: mockApiKeysService }]
        }).compile();

        controller = module.get<ApiKeysController>(ApiKeysController);
        apiKeysService = module.get(ApiKeysService);
    });

    describe('constructor', () => {
        it('should be defined', () => {
            expect(controller).toBeDefined();
        });
    });

    describe('getApiKeys', () => {
        it('should throw "Not implemented" error', async () => {
            await expect(controller.getApiKeys()).rejects.toThrow('Not implemented');
        });
    });

    describe('createApiKey', () => {
        it('should throw "Not implemented" error', async () => {
            await expect(controller.createApiKey()).rejects.toThrow('Not implemented');
        });
    });

    describe('getApiKeyUsageLogs', () => {
        it('should throw "Not implemented" error', async () => {
            await expect(controller.getApiKeyUsageLogs()).rejects.toThrow('Not implemented');
        });
    });

    describe('deleteApiKey', () => {
        it('should delete an API key successfully', async () => {
            const apiKeyId = 'test-api-key-id';

            apiKeysService.deleteApiKey.mockResolvedValue(undefined);

            const result = await controller.deleteApiKey(mockAuthenticatedUser, apiKeyId);

            expect(apiKeysService.deleteApiKey).toHaveBeenCalledWith(
                apiKeyId,
                mockAuthenticatedUser
            );
            expect(result).toEqual({});
        });

        it('should propagate service errors', async () => {
            const apiKeyId = 'test-api-key-id';
            const error = new Error('Service error');

            apiKeysService.deleteApiKey.mockRejectedValue(error);

            await expect(controller.deleteApiKey(mockAuthenticatedUser, apiKeyId)).rejects.toThrow(
                'Service error'
            );

            expect(apiKeysService.deleteApiKey).toHaveBeenCalledWith(
                apiKeyId,
                mockAuthenticatedUser
            );
        });

        it('should handle empty api key id', async () => {
            const apiKeyId = '';

            apiKeysService.deleteApiKey.mockResolvedValue(undefined);

            const result = await controller.deleteApiKey(mockAuthenticatedUser, apiKeyId);

            expect(apiKeysService.deleteApiKey).toHaveBeenCalledWith(
                apiKeyId,
                mockAuthenticatedUser
            );
            expect(result).toEqual({});
        });
    });
});
