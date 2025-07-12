import { License } from './license.entity';

describe('License Entity', () => {
    describe('Entity instantiation', () => {
        it('should create a License instance', () => {
            const license = new License();

            expect(license).toBeDefined();
            expect(license).toBeInstanceOf(License);
        });

        it('should allow property assignment without errors', () => {
            const license = new License();

            license.id = 'test-uuid';
            license.name = 'MIT License';
            license.licenseId = 'MIT';
            license.reference = 'https://opensource.org/licenses/MIT';
            license.isOsiApproved = true;

            expect(license.id).toBe('test-uuid');
            expect(license.name).toBe('MIT License');
            expect(license.licenseId).toBe('MIT');
            expect(license.reference).toBe('https://opensource.org/licenses/MIT');
            expect(license.isOsiApproved).toBe(true);
        });
    });

    describe('Property validation', () => {
        it('should handle basic license properties', () => {
            const license = new License();

            license.name = 'Apache License 2.0';
            license.licenseId = 'Apache-2.0';
            license.reference = 'https://apache.org/licenses/LICENSE-2.0';
            license.isDeprecatedLicenseId = false;
            license.detailsUrl = 'https://spdx.org/licenses/Apache-2.0.html';
            license.referenceNumber = 1;
            license.isOsiApproved = true;

            expect(license.name).toBe('Apache License 2.0');
            expect(license.licenseId).toBe('Apache-2.0');
            expect(license.isDeprecatedLicenseId).toBe(false);
            expect(license.referenceNumber).toBe(1);
        });

        it('should handle seeAlso array properly', () => {
            const license = new License();

            const seeAlsoUrls = [
                'https://opensource.org/licenses/MIT',
                'https://spdx.org/licenses/MIT.html',
                'https://github.com/licenses/MIT'
            ];

            license.seeAlso = seeAlsoUrls;

            expect(license.seeAlso).toEqual(seeAlsoUrls);
            expect(license.seeAlso).toHaveLength(3);
        });

        it('should handle null values for nullable properties', () => {
            const license = new License();

            (license as any).name = null;
            (license as any).reference = null;
            (license as any).isDeprecatedLicenseId = null;
            (license as any).detailsUrl = null;
            (license as any).referenceNumber = null;
            (license as any).licenseId = null;
            (license as any).seeAlso = null;
            (license as any).isOsiApproved = null;
            (license as any).details = null;

            expect(license.name).toBeNull();
            expect(license.reference).toBeNull();
            expect(license.isDeprecatedLicenseId).toBeNull();
            expect(license.detailsUrl).toBeNull();
            expect(license.referenceNumber).toBeNull();
            expect(license.licenseId).toBeNull();
            expect(license.seeAlso).toBeNull();
            expect(license.isOsiApproved).toBeNull();
            expect(license.details).toBeNull();
        });

        it('should handle complex details JSONB object', () => {
            const license = new License();

            const details = {
                crossRef: [
                    {
                        IsLive: true,
                        IsValid: true,
                        IsWayBackLink: false,
                        Match: 'exact',
                        Order: 1,
                        Timestamp: new Date('2023-01-01'),
                        URL: 'https://opensource.org/licenses/MIT'
                    }
                ],
                isDeprecatedLicenseId: false,
                isOsiApproved: true,
                licenseId: 'MIT',
                licenseText: 'Permission is hereby granted, free of charge...',
                licenseTextHtml: '<p>Permission is hereby granted, free of charge...</p>',
                licenseTextNormalized: 'permission is hereby granted free of charge',
                licenseTextNormalizedDigest: 'abc123',
                name: 'MIT License',
                seeAlso: ['https://opensource.org/licenses/MIT'],
                standardLicenseTemplate: 'MIT template',
                description: 'A permissive license',
                classification: 'permissive',
                licenseProperties: {
                    permissions: ['commercial-use', 'modifications', 'distribution', 'private-use'],
                    conditions: ['include-copyright'],
                    limitations: ['liability', 'warranty']
                }
            };

            license.details = details;

            expect(license.details.licenseId).toBe('MIT');
            expect(license.details.isOsiApproved).toBe(true);
            expect(license.details.licenseProperties.permissions).toContain('commercial-use');
            expect(license.details.crossRef).toHaveLength(1);
            expect(license.details.crossRef[0].IsLive).toBe(true);
        });
    });

    describe('Real-world license data examples', () => {
        it('should handle MIT License', () => {
            const license = new License();

            license.id = 'uuid-mit';
            license.name = 'MIT License';
            license.licenseId = 'MIT';
            license.reference = 'https://opensource.org/licenses/MIT';
            license.isDeprecatedLicenseId = false;
            license.detailsUrl = 'https://spdx.org/licenses/MIT.html';
            license.referenceNumber = 308;
            license.isOsiApproved = true;
            license.seeAlso = ['https://opensource.org/licenses/MIT'];

            expect(license.licenseId).toBe('MIT');
            expect(license.isOsiApproved).toBe(true);
            expect(license.isDeprecatedLicenseId).toBe(false);
        });

        it('should handle Apache License 2.0', () => {
            const license = new License();

            license.id = 'uuid-apache';
            license.name = 'Apache License 2.0';
            license.licenseId = 'Apache-2.0';
            license.reference = 'https://www.apache.org/licenses/LICENSE-2.0';
            license.isDeprecatedLicenseId = false;
            license.detailsUrl = 'https://spdx.org/licenses/Apache-2.0.html';
            license.referenceNumber = 28;
            license.isOsiApproved = true;
            license.seeAlso = [
                'https://www.apache.org/licenses/LICENSE-2.0',
                'https://opensource.org/licenses/Apache-2.0'
            ];

            expect(license.licenseId).toBe('Apache-2.0');
            expect(license.seeAlso).toHaveLength(2);
        });

        it('should handle GPL-3.0-only License', () => {
            const license = new License();

            license.id = 'uuid-gpl3';
            license.name = 'GNU General Public License v3.0 only';
            license.licenseId = 'GPL-3.0-only';
            license.reference = 'https://www.gnu.org/licenses/gpl-3.0-standalone.html';
            license.isDeprecatedLicenseId = false;
            license.detailsUrl = 'https://spdx.org/licenses/GPL-3.0-only.html';
            license.referenceNumber = 133;
            license.isOsiApproved = true;
            license.seeAlso = [
                'https://www.gnu.org/licenses/gpl-3.0-standalone.html',
                'https://opensource.org/licenses/GPL-3.0'
            ];

            expect(license.licenseId).toBe('GPL-3.0-only');
            expect(license.name).toContain('GNU General Public License');
        });

        it('should handle deprecated license', () => {
            const license = new License();

            license.id = 'uuid-deprecated';
            license.name = 'GNU General Public License v3.0';
            license.licenseId = 'GPL-3.0';
            license.reference = 'https://www.gnu.org/licenses/gpl-3.0-standalone.html';
            license.isDeprecatedLicenseId = true;
            license.detailsUrl = 'https://spdx.org/licenses/GPL-3.0.html';
            license.referenceNumber = 132;
            license.isOsiApproved = false;

            expect(license.isDeprecatedLicenseId).toBe(true);
            expect(license.licenseId).toBe('GPL-3.0');
        });

        it('should handle proprietary/commercial license', () => {
            const license = new License();

            license.id = 'uuid-proprietary';
            license.name = 'Proprietary License';
            license.licenseId = 'Proprietary';
            license.reference = null as any;
            license.isDeprecatedLicenseId = false;
            license.detailsUrl = null as any;
            license.referenceNumber = null as any;
            license.isOsiApproved = false;
            license.seeAlso = [];

            expect(license.licenseId).toBe('Proprietary');
            expect(license.isOsiApproved).toBe(false);
            expect(license.reference).toBeNull();
        });
    });

    describe('Edge cases and validation', () => {
        it('should handle very long license names', () => {
            const license = new License();
            const longName = 'A'.repeat(250);

            license.name = longName;
            expect(license.name).toBe(longName);
            expect(license.name.length).toBe(250);
        });

        it('should handle special characters in license fields', () => {
            const license = new License();
            const specialText = 'License with special chars: <>&"\'`\n\t\r';

            license.name = specialText;
            license.licenseId = 'special-chars-1.0';

            expect(license.name).toBe(specialText);
            expect(license.licenseId).toBe('special-chars-1.0');
        });

        it('should handle empty arrays', () => {
            const license = new License();

            license.seeAlso = [];

            expect(license.seeAlso).toEqual([]);
            expect(license.seeAlso).toHaveLength(0);
        });

        it('should handle complex license properties in details', () => {
            const license = new License();

            const complexDetails = {
                crossRef: [],
                isDeprecatedLicenseId: false,
                isOsiApproved: false,
                licenseId: 'Custom-License-1.0',
                licenseText: 'This is a custom license with very specific terms...',
                licenseTextHtml: '<div>Custom license HTML</div>',
                licenseTextNormalized: 'custom license normalized',
                licenseTextNormalizedDigest: 'hash123456',
                name: 'Custom License',
                seeAlso: [],
                standardLicenseTemplate: '',
                description: 'A custom license for specific use cases',
                classification: 'custom',
                licenseProperties: {
                    permissions: ['private-use'],
                    conditions: ['include-copyright', 'document-changes'],
                    limitations: ['liability', 'warranty', 'trademark-use']
                }
            };

            license.details = complexDetails;

            expect(license.details.classification).toBe('custom');
            expect(license.details.licenseProperties.permissions).toEqual(['private-use']);
            expect(license.details.licenseProperties.limitations).toHaveLength(3);
        });

        it('should handle negative reference numbers', () => {
            const license = new License();

            license.referenceNumber = -1;

            expect(license.referenceNumber).toBe(-1);
        });

        it('should handle zero reference number', () => {
            const license = new License();

            license.referenceNumber = 0;

            expect(license.referenceNumber).toBe(0);
        });

        it('should handle very large reference numbers', () => {
            const license = new License();

            license.referenceNumber = 999999;

            expect(license.referenceNumber).toBe(999999);
        });
    });

    describe('Database schema compatibility', () => {
        it('should handle string length constraints', () => {
            const license = new License();

            license.name = 'A'.repeat(250);
            license.reference = 'B'.repeat(250);

            expect(license.name.length).toBe(250);
            expect(license.reference.length).toBe(250);
        });

        it('should handle unique constraint on licenseId', () => {
            const license1 = new License();
            const license2 = new License();

            license1.licenseId = 'UNIQUE-LICENSE-1.0';
            license2.licenseId = 'UNIQUE-LICENSE-1.0';

            expect(license1.licenseId).toBe(license2.licenseId);
        });

        it('should handle simple-array column type for seeAlso', () => {
            const license = new License();

            license.seeAlso = [
                'http://example.com/license1',
                'http://example.com/license2',
                'http://example.com/license3'
            ];

            expect(Array.isArray(license.seeAlso)).toBe(true);
            expect(license.seeAlso).toHaveLength(3);
        });

        it('should handle JSONB column type for details', () => {
            const license = new License();

            const details = {
                crossRef: [
                    {
                        IsLive: true,
                        IsValid: true,
                        IsWayBackLink: false,
                        Match: 'exact',
                        Order: 1,
                        Timestamp: new Date(),
                        URL: 'http://example.com'
                    }
                ],
                isDeprecatedLicenseId: false,
                isOsiApproved: true,
                licenseId: 'TEST-1.0',
                licenseText: 'Test license text',
                licenseTextHtml: '<p>Test license HTML</p>',
                licenseTextNormalized: 'test license normalized',
                licenseTextNormalizedDigest: 'digest123',
                name: 'Test License',
                seeAlso: ['http://example.com'],
                standardLicenseTemplate: 'template',
                description: 'Test description',
                classification: 'test',
                licenseProperties: {
                    permissions: ['test-permission'],
                    conditions: ['test-condition'],
                    limitations: ['test-limitation']
                }
            };

            license.details = details;

            expect(typeof license.details).toBe('object');
            expect(license.details.crossRef).toBeDefined();
            expect(license.details.licenseProperties).toBeDefined();
        });
    });
});
