import { AuthenticatedUser, ROLE } from 'src/base_modules/auth/auth.types';

import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';

import { LicenseController } from './license.controller';
import type { License } from './license.entity';
import { LicenseService } from './license.service';

describe('LicenseController', () => {
    let controller: LicenseController;
    let licenseService: LicenseService;

    const mockUser = new AuthenticatedUser('user-123', [ROLE.USER], true);

    const mockLicense: License = {
        id: 'MIT',
        name: 'MIT License',
        reference: 'MIT',
        isDeprecatedLicenseId: false,
        detailsUrl: 'https://spdx.org/licenses/MIT.html',
        referenceNumber: 1,
        licenseId: 'MIT',
        seeAlso: ['https://opensource.org/licenses/MIT'],
        isOsiApproved: true,
        details: {
            crossRef: [],
            isDeprecatedLicenseId: false,
            isOsiApproved: true,
            licenseId: 'MIT',
            licenseText: 'MIT License text...',
            licenseTextHtml: '<p>MIT License text...</p>',
            licenseTextNormalized: 'mit license text',
            licenseTextNormalizedDigest: 'abc123',
            name: 'MIT License',
            seeAlso: ['https://opensource.org/licenses/MIT'],
            standardLicenseTemplate: 'MIT template',
            description: 'MIT License Description',
            classification: 'Permissive',
            licenseProperties: {
                permissions: ['commercial-use', 'modifications'],
                conditions: ['include-copyright'],
                limitations: ['liability', 'warranty']
            }
        }
    };

    const mockLicenses: License[] = [
        mockLicense,
        {
            id: 'Apache-2.0',
            name: 'Apache License 2.0',
            reference: 'Apache-2.0',
            isDeprecatedLicenseId: false,
            detailsUrl: 'https://spdx.org/licenses/Apache-2.0.html',
            referenceNumber: 2,
            licenseId: 'Apache-2.0',
            seeAlso: ['https://opensource.org/licenses/Apache-2.0'],
            isOsiApproved: true,
            details: {
                crossRef: [],
                isDeprecatedLicenseId: false,
                isOsiApproved: true,
                licenseId: 'Apache-2.0',
                licenseText: 'Apache License 2.0 text...',
                licenseTextHtml: '<p>Apache License 2.0 text...</p>',
                licenseTextNormalized: 'apache license 2.0 text',
                licenseTextNormalizedDigest: 'def456',
                name: 'Apache License 2.0',
                seeAlso: ['https://opensource.org/licenses/Apache-2.0'],
                standardLicenseTemplate: 'Apache 2.0 template',
                description: 'Apache 2.0 License Description',
                classification: 'Permissive',
                licenseProperties: {
                    permissions: ['commercial-use', 'modifications'],
                    conditions: ['include-copyright', 'state-changes'],
                    limitations: ['liability', 'warranty']
                }
            }
        }
    ];

    const mockLicenseService = {
        get: jest.fn(),
        getAll: jest.fn()
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [LicenseController],
            providers: [
                {
                    provide: LicenseService,
                    useValue: mockLicenseService
                }
            ]
        }).compile();

        controller = module.get<LicenseController>(LicenseController);
        licenseService = module.get<LicenseService>(LicenseService);

        jest.clearAllMocks();
    });

    describe('get', () => {
        it('should return a specific license', async () => {
            mockLicenseService.get.mockResolvedValue(mockLicense);

            const result = await controller.get(mockUser, 'MIT');

            expect(result).toEqual({
                data: mockLicense
            });
            expect(licenseService.get).toHaveBeenCalledWith('MIT');
        });

        it('should handle service errors', async () => {
            const error = new Error('License not found');
            mockLicenseService.get.mockRejectedValue(error);

            await expect(controller.get(mockUser, 'INVALID')).rejects.toThrow('License not found');
            expect(licenseService.get).toHaveBeenCalledWith('INVALID');
        });

        it('should handle different license IDs', async () => {
            const apacheLicense = mockLicenses[1];
            mockLicenseService.get.mockResolvedValue(apacheLicense);

            const result = await controller.get(mockUser, 'Apache-2.0');

            expect(result).toEqual({
                data: apacheLicense
            });
            expect(licenseService.get).toHaveBeenCalledWith('Apache-2.0');
        });

        it('should pass user parameter but not use it', async () => {
            mockLicenseService.get.mockResolvedValue(mockLicense);

            await controller.get(mockUser, 'MIT');

            expect(licenseService.get).toHaveBeenCalledWith('MIT');
            // Verify that the user parameter is received but not passed to service
            expect(licenseService.get).toHaveBeenCalledTimes(1);
        });
    });

    describe('getAll', () => {
        it('should return all licenses', async () => {
            mockLicenseService.getAll.mockResolvedValue(mockLicenses);

            const result = await controller.getAll(mockUser);

            expect(result).toEqual({
                data: mockLicenses
            });
            expect(licenseService.getAll).toHaveBeenCalledWith();
        });

        it('should return empty array when no licenses exist', async () => {
            mockLicenseService.getAll.mockResolvedValue([]);

            const result = await controller.getAll(mockUser);

            expect(result).toEqual({
                data: []
            });
            expect(licenseService.getAll).toHaveBeenCalledWith();
        });

        it('should handle service errors', async () => {
            const error = new Error('Database connection failed');
            mockLicenseService.getAll.mockRejectedValue(error);

            await expect(controller.getAll(mockUser)).rejects.toThrow('Database connection failed');
            expect(licenseService.getAll).toHaveBeenCalledWith();
        });

        it('should pass user parameter but not use it', async () => {
            mockLicenseService.getAll.mockResolvedValue(mockLicenses);

            await controller.getAll(mockUser);

            expect(licenseService.getAll).toHaveBeenCalledWith();
            // Verify that the user parameter is received but not passed to service
            expect(licenseService.getAll).toHaveBeenCalledTimes(1);
        });

        it('should return TypedResponse format', async () => {
            mockLicenseService.getAll.mockResolvedValue(mockLicenses);

            const result = await controller.getAll(mockUser);

            expect(result).toHaveProperty('data');
            expect(Array.isArray(result.data)).toBe(true);
            expect(result.data).toHaveLength(2);
        });
    });
});
