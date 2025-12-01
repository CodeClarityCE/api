import { Test, type TestingModule } from '@nestjs/testing';
import type { License } from './license.entity';
import { LicenseRepository } from './license.repository';
import { LicenseService } from './license.service';

describe('LicenseService', () => {
    let service: LicenseService;
    let licenseRepository: LicenseRepository;

    const mockLicense: License = {
        id: 'license-123',
        name: 'MIT',
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

    const mockLicenseRepository = {
        getLicenseData: jest.fn(),
        getAllLicenseData: jest.fn()
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                LicenseService,
                {
                    provide: LicenseRepository,
                    useValue: mockLicenseRepository
                }
            ]
        }).compile();

        service = module.get<LicenseService>(LicenseService);
        licenseRepository = module.get<LicenseRepository>(LicenseRepository);

        jest.clearAllMocks();
    });

    describe('get', () => {
        it('should return a license by id', async () => {
            mockLicenseRepository.getLicenseData.mockResolvedValue(mockLicense);

            const result = await service.get('license-123');

            expect(result).toEqual(mockLicense);
            expect(licenseRepository.getLicenseData).toHaveBeenCalledWith('license-123');
        });

        it('should handle repository errors', async () => {
            const error = new Error('License not found');
            mockLicenseRepository.getLicenseData.mockRejectedValue(error);

            await expect(service.get('non-existent')).rejects.toThrow('License not found');
            expect(licenseRepository.getLicenseData).toHaveBeenCalledWith('non-existent');
        });
    });

    describe('getAll', () => {
        it('should return all licenses', async () => {
            const licenses = [
                mockLicense,
                { ...mockLicense, id: 'license-456', name: 'Apache-2.0' }
            ];
            mockLicenseRepository.getAllLicenseData.mockResolvedValue(licenses);

            const result = await service.getAll();

            expect(result).toEqual(licenses);
            expect(licenseRepository.getAllLicenseData).toHaveBeenCalledWith();
        });

        it('should return empty array when no licenses exist', async () => {
            mockLicenseRepository.getAllLicenseData.mockResolvedValue([]);

            const result = await service.getAll();

            expect(result).toEqual([]);
            expect(licenseRepository.getAllLicenseData).toHaveBeenCalledWith();
        });

        it('should handle repository errors', async () => {
            const error = new Error('Database connection failed');
            mockLicenseRepository.getAllLicenseData.mockRejectedValue(error);

            await expect(service.getAll()).rejects.toThrow('Database connection failed');
            expect(licenseRepository.getAllLicenseData).toHaveBeenCalledWith();
        });
    });
});
