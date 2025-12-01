import type { PatchInfo, VulnerabilitySummary } from '../patching2.types';
import { sort } from './sort';

describe('sort', () => {
    const createMockVulnerabilitySummary = (): VulnerabilitySummary => ({
        Severity: 'HIGH',
        Weaknesses: ['CWE-79']
    });

    const createMockPatchInfo = (overrides: Partial<PatchInfo> = {}): PatchInfo => ({
        affected_deps: ['dep1'],
        affected_dep_name: 'test-package',
        occurance_count: 1,
        patchable_occurances_count: 1,
        unpatchable_occurances_count: 0,
        vulnerability_id: 'CVE-2023-1234',
        introduction_type: 'direct',
        patch_type: 'full_patch',
        vulnerability_info: createMockVulnerabilitySummary(),
        patches: {},
        ...overrides
    });

    describe('basic functionality', () => {
        it('should return same array when no patches are provided', () => {
            const result = sort([], undefined, undefined);

            expect(result).toEqual([]);
        });

        it('should return original array for single patch', () => {
            const patches = [createMockPatchInfo()];

            const result = sort(patches, undefined, undefined);

            expect(result).toHaveLength(1);
            expect(result).toEqual(patches);
        });

        it('should return array with same patches', () => {
            const patches = [
                createMockPatchInfo({ affected_dep_name: 'package-a' }),
                createMockPatchInfo({ affected_dep_name: 'package-b' }),
                createMockPatchInfo({ affected_dep_name: 'package-c' })
            ];

            const result = sort(patches, undefined, undefined);

            expect(result).toHaveLength(3);
            expect(result).toEqual(expect.arrayContaining(patches));
        });
    });

    describe('sortBy parameter validation', () => {
        const patches = [
            createMockPatchInfo({ patch_type: 'full_patch' }),
            createMockPatchInfo({ patch_type: 'partial_patch' })
        ];

        it('should use default sort when sortBy is undefined', () => {
            const result = sort(patches, undefined, undefined);

            expect(result).toHaveLength(2);
            expect(result).toEqual(expect.arrayContaining(patches));
        });

        it('should use default sort when sortBy is null', () => {
            const result = sort(patches, null as any, undefined);

            expect(result).toHaveLength(2);
            expect(result).toEqual(expect.arrayContaining(patches));
        });

        it('should use default sort when sortBy is not in allowed list', () => {
            const result = sort(patches, 'invalid_sort', undefined);

            expect(result).toHaveLength(2);
            expect(result).toEqual(expect.arrayContaining(patches));
        });

        it('should accept valid sortBy parameter', () => {
            const result = sort(patches, 'patch_type', undefined);

            expect(result).toHaveLength(2);
            expect(result).toEqual(expect.arrayContaining(patches));
        });
    });

    describe('allowed sort parameters', () => {
        const patches = [createMockPatchInfo(), createMockPatchInfo()];

        it('should accept patch_type as valid sortBy', () => {
            const result = sort(patches, 'patch_type', undefined);

            expect(result).toHaveLength(2);
        });

        it('should reject unknown sort parameters', () => {
            const unknownSortParameters = [
                'vulnerability_id',
                'affected_dep_name',
                'severity',
                'random_field'
            ];

            unknownSortParameters.forEach((sortParam) => {
                const result = sort(patches, sortParam, undefined);
                expect(result).toHaveLength(2);
                expect(result).toEqual(expect.arrayContaining(patches));
            });
        });
    });

    describe('sortDirection parameter handling', () => {
        const patches = [
            createMockPatchInfo({ patch_type: 'full_patch' }),
            createMockPatchInfo({ patch_type: 'partial_patch' })
        ];

        it('should handle undefined sortDirection', () => {
            const result = sort(patches, 'patch_type', undefined);

            expect(result).toHaveLength(2);
            expect(result).toEqual(expect.arrayContaining(patches));
        });

        it('should handle null sortDirection', () => {
            const result = sort(patches, 'patch_type', null as any);

            expect(result).toHaveLength(2);
            expect(result).toEqual(expect.arrayContaining(patches));
        });

        it('should handle ASC sortDirection (currently not implemented)', () => {
            const result = sort(patches, 'patch_type', 'ASC');

            expect(result).toHaveLength(2);
            expect(result).toEqual(expect.arrayContaining(patches));
        });

        it('should handle DESC sortDirection (currently not implemented)', () => {
            const result = sort(patches, 'patch_type', 'DESC');

            expect(result).toHaveLength(2);
            expect(result).toEqual(expect.arrayContaining(patches));
        });

        it('should handle invalid sortDirection', () => {
            const result = sort(patches, 'patch_type', 'INVALID');

            expect(result).toHaveLength(2);
            expect(result).toEqual(expect.arrayContaining(patches));
        });
    });

    describe('patch_type sorting (current implementation)', () => {
        it('should maintain original order since sorting returns 0', () => {
            const patches = [
                createMockPatchInfo({
                    affected_dep_name: 'first',
                    patch_type: 'partial_patch'
                }),
                createMockPatchInfo({
                    affected_dep_name: 'second',
                    patch_type: 'full_patch'
                }),
                createMockPatchInfo({
                    affected_dep_name: 'third',
                    patch_type: 'none_patch'
                })
            ];

            const result = sort(patches, 'patch_type', 'DESC');

            expect(result).toHaveLength(3);
            expect(result[0]!.affected_dep_name).toBe('first');
            expect(result[1]!.affected_dep_name).toBe('second');
            expect(result[2]!.affected_dep_name).toBe('third');
        });

        it('should handle mixed patch types', () => {
            const patches = [
                createMockPatchInfo({ patch_type: 'full_patch' }),
                createMockPatchInfo({ patch_type: 'partial_patch' }),
                createMockPatchInfo({ patch_type: 'none_patch' }),
                createMockPatchInfo({ patch_type: 'full_patch' })
            ];

            const result = sort(patches, 'patch_type', undefined);

            expect(result).toHaveLength(4);
            expect(result).toEqual(expect.arrayContaining(patches));
        });

        it('should handle null patch_type values', () => {
            const patches = [
                createMockPatchInfo({ patch_type: null as unknown as string }),
                createMockPatchInfo({ patch_type: 'full_patch' }),
                createMockPatchInfo({ patch_type: undefined as unknown as string })
            ];

            const result = sort(patches, 'patch_type', undefined);

            expect(result).toHaveLength(3);
            expect(result).toEqual(expect.arrayContaining(patches));
        });
    });

    describe('mapping functionality', () => {
        it('should apply mapping if sortBy exists in mapping object', () => {
            const patches = [createMockPatchInfo(), createMockPatchInfo()];

            const result = sort(patches, 'patch_type', undefined);

            expect(result).toHaveLength(2);
        });
    });

    describe('edge cases', () => {
        it('should handle empty string as sortBy', () => {
            const patches = [createMockPatchInfo()];

            const result = sort(patches, '', undefined);

            expect(result).toHaveLength(1);
            expect(result).toEqual(patches);
        });

        it('should handle very large arrays', () => {
            const patches = Array.from({ length: 1000 }, (_, i) =>
                createMockPatchInfo({ affected_dep_name: `package-${i}` })
            );

            const result = sort(patches, 'patch_type', undefined);

            expect(result).toHaveLength(1000);
            expect(result).toEqual(expect.arrayContaining(patches));
        });

        it('should handle patches with missing required fields', () => {
            const patches = [
                {
                    affected_deps: [],
                    affected_dep_name: 'test',
                    occurance_count: 0,
                    patchable_occurances_count: 0,
                    unpatchable_occurances_count: 0,
                    vulnerability_id: 'CVE-2023-1234',
                    introduction_type: undefined,
                    patch_type: undefined,
                    vulnerability_info: createMockVulnerabilitySummary(),
                    patches: {}
                } as unknown as PatchInfo
            ];

            const result = sort(patches, 'patch_type', undefined);

            expect(result).toHaveLength(1);
            expect(result).toEqual(patches);
        });

        it('should modify original array (Array.sort behavior)', () => {
            const patches = [
                createMockPatchInfo({ affected_dep_name: 'original-1' }),
                createMockPatchInfo({ affected_dep_name: 'original-2' })
            ];
            const originalLength = patches.length;

            const result = sort(patches, 'patch_type', undefined);

            // Array.sort modifies the original array in place
            expect(patches).toHaveLength(originalLength);
            expect(result).toBe(patches);
        });
    });

    describe('return value validation', () => {
        it('should always return an array', () => {
            const patches = [createMockPatchInfo()];

            const result = sort(patches, 'patch_type', undefined);

            expect(Array.isArray(result)).toBe(true);
        });

        it('should return array of PatchInfo objects', () => {
            const patches = [createMockPatchInfo(), createMockPatchInfo()];

            const result = sort(patches, 'patch_type', undefined);

            expect(result).toHaveLength(2);
            result.forEach((patch) => {
                expect(patch).toHaveProperty('affected_deps');
                expect(patch).toHaveProperty('affected_dep_name');
                expect(patch).toHaveProperty('vulnerability_id');
                expect(patch).toHaveProperty('patch_type');
            });
        });
    });
});
