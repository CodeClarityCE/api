import { NVD } from './nvd.entity';

describe('NVD Entity', () => {
    let nvdEntity: NVD;

    beforeEach(() => {
        nvdEntity = new NVD();
    });

    it('should create an instance', () => {
        expect(nvdEntity).toBeDefined();
        expect(nvdEntity).toBeInstanceOf(NVD);
    });

    it('should have all required properties when populated', () => {
        // Initialize with test data
        nvdEntity.id = 'test-id';
        nvdEntity.nvd_id = 'CVE-2024-1234';
        nvdEntity.sourceIdentifier = 'test@example.com';
        nvdEntity.published = '2024-01-01T00:00:00Z';
        nvdEntity.lastModified = '2024-01-01T00:00:00Z';
        nvdEntity.vulnStatus = 'PUBLISHED';
        nvdEntity.descriptions = [];
        nvdEntity.vlai_score = '7.5';

        expect(nvdEntity).toHaveProperty('id');
        expect(nvdEntity).toHaveProperty('nvd_id');
        expect(nvdEntity).toHaveProperty('sourceIdentifier');
        expect(nvdEntity).toHaveProperty('published');
        expect(nvdEntity).toHaveProperty('lastModified');
        expect(nvdEntity).toHaveProperty('vulnStatus');
        expect(nvdEntity).toHaveProperty('descriptions');
        expect(nvdEntity).toHaveProperty('vlai_score');
    });

    it('should allow setting all properties', () => {
        const testData = {
            id: 'test-uuid',
            nvd_id: 'CVE-2024-1234',
            sourceIdentifier: 'cna@test.com',
            published: '2024-01-01T00:00:00.000Z',
            lastModified: '2024-01-02T00:00:00.000Z',
            vulnStatus: 'Published',
            descriptions: [
                {
                    lang: 'en',
                    value: 'Test vulnerability description'
                }
            ],
            vlai_score: '7.5'
        };

        Object.assign(nvdEntity, testData);

        expect(nvdEntity.id).toBe(testData.id);
        expect(nvdEntity.nvd_id).toBe(testData.nvd_id);
        expect(nvdEntity.sourceIdentifier).toBe(testData.sourceIdentifier);
        expect(nvdEntity.published).toBe(testData.published);
        expect(nvdEntity.lastModified).toBe(testData.lastModified);
        expect(nvdEntity.vulnStatus).toBe(testData.vulnStatus);
        expect(nvdEntity.descriptions).toEqual(testData.descriptions);
        expect(nvdEntity.vlai_score).toBe(testData.vlai_score);
    });

    it('should handle nullable properties', () => {
        nvdEntity.id = 'test-uuid';
        nvdEntity.nvd_id = 'CVE-2024-1234';

        // These properties should be nullable
        nvdEntity.sourceIdentifier = null as any;
        nvdEntity.published = null as any;
        nvdEntity.lastModified = null as any;
        nvdEntity.vulnStatus = null as any;
        nvdEntity.descriptions = null;
        nvdEntity.vlai_score = null as any;

        expect(nvdEntity.sourceIdentifier).toBeNull();
        expect(nvdEntity.published).toBeNull();
        expect(nvdEntity.lastModified).toBeNull();
        expect(nvdEntity.vulnStatus).toBeNull();
        expect(nvdEntity.descriptions).toBeNull();
        expect(nvdEntity.vlai_score).toBeNull();
    });

    it('should handle CVE identifiers correctly', () => {
        nvdEntity.nvd_id = 'CVE-2024-1234';
        expect(nvdEntity.nvd_id).toBe('CVE-2024-1234');

        nvdEntity.nvd_id = 'CVE-2023-45678';
        expect(nvdEntity.nvd_id).toBe('CVE-2023-45678');
    });

    it('should handle JSONB descriptions properly', () => {
        const descriptions = [
            {
                lang: 'en',
                value: 'A vulnerability in the authentication system allows unauthorized access'
            },
            {
                lang: 'es',
                value: 'Una vulnerabilidad en el sistema de autenticación permite acceso no autorizado'
            }
        ];

        nvdEntity.descriptions = descriptions;
        expect(nvdEntity.descriptions).toEqual(descriptions);
        expect(Array.isArray(nvdEntity.descriptions)).toBe(true);
        expect(nvdEntity.descriptions).toHaveLength(2);
    });

    it('should handle different vulnerability statuses', () => {
        const statuses = ['Published', 'Modified', 'Rejected', 'Awaiting Analysis'];

        statuses.forEach((status) => {
            nvdEntity.vulnStatus = status;
            expect(nvdEntity.vulnStatus).toBe(status);
        });
    });

    it('should handle date strings in ISO format', () => {
        const publishedDate = '2024-01-01T00:00:00.000Z';
        const modifiedDate = '2024-01-02T12:30:45.123Z';

        nvdEntity.published = publishedDate;
        nvdEntity.lastModified = modifiedDate;

        expect(nvdEntity.published).toBe(publishedDate);
        expect(nvdEntity.lastModified).toBe(modifiedDate);
    });

    it('should handle various score formats', () => {
        const scores = ['7.5', '9.8', '3.1', '0.0', '10.0'];

        scores.forEach((score) => {
            nvdEntity.vlai_score = score;
            expect(nvdEntity.vlai_score).toBe(score);
        });
    });

    it('should handle source identifiers', () => {
        const sourceIdentifiers = [
            'cna@test.com',
            'security@vendor.com',
            'nvd@nist.gov',
            'researcher@university.edu'
        ];

        sourceIdentifiers.forEach((sourceId) => {
            nvdEntity.sourceIdentifier = sourceId;
            expect(nvdEntity.sourceIdentifier).toBe(sourceId);
        });
    });

    it('should handle complex descriptions structure', () => {
        const complexDescriptions = {
            description_data: [
                {
                    lang: 'en',
                    value: 'Primary description'
                }
            ],
            additional_info: {
                severity: 'HIGH',
                impact: 'Complete system compromise'
            }
        };

        nvdEntity.descriptions = complexDescriptions;
        expect(nvdEntity.descriptions).toEqual(complexDescriptions);
        expect(nvdEntity.descriptions.description_data).toBeDefined();
        expect(nvdEntity.descriptions.additional_info).toBeDefined();
    });
});
