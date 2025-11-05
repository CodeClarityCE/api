import { filter } from './filter';
import { PatchInfo, VulnerabilitySummary } from '../patching2.types';

describe('filter', () => {
    const createMockVulnerabilitySummary = (): VulnerabilitySummary => ({
        Severity: 'HIGH',
        Weaknesses: ['CWE-79']
    });

    const createMockPatchInfo = (overrides: Partial<PatchInfo> = {}): PatchInfo => ({
        affected_deps: ['dep1', 'dep2'],
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
        it('should return all patches when no filters are applied', () => {
            const patches = [
                createMockPatchInfo({ affected_dep_name: 'package-a' }),
                createMockPatchInfo({ affected_dep_name: 'package-b' })
            ];

            const [filteredPatches, counts] = filter(patches, undefined, undefined);

            expect(filteredPatches).toHaveLength(2);
            expect(filteredPatches).toEqual(patches);
            expect(counts).toEqual({
                full_patch: 2,
                partial_patch: 2,
                none_patch: 2
            });
        });

        it('should return empty array when input is empty', () => {
            const [filteredPatches, counts] = filter([], undefined, undefined);

            expect(filteredPatches).toHaveLength(0);
            expect(counts).toEqual({
                full_patch: 0,
                partial_patch: 0,
                none_patch: 0
            });
        });
    });

    describe('search key filtering', () => {
        const patches = [
            createMockPatchInfo({
                affected_dep_name: 'lodash',
                vulnerability_id: 'CVE-2023-1001'
            }),
            createMockPatchInfo({
                affected_dep_name: 'express',
                vulnerability_id: 'CVE-2023-2002'
            }),
            createMockPatchInfo({
                affected_dep_name: 'react',
                vulnerability_id: 'CVE-2023-3003'
            })
        ];

        it('should filter by dependency name (case insensitive)', () => {
            const [filteredPatches] = filter(patches, 'LODASH', undefined);

            expect(filteredPatches).toHaveLength(1);
            expect(filteredPatches[0]!.affected_dep_name).toBe('lodash');
        });

        it('should filter by partial dependency name match', () => {
            const [filteredPatches] = filter(patches, 'exp', undefined);

            expect(filteredPatches).toHaveLength(1);
            expect(filteredPatches[0]!.affected_dep_name).toBe('express');
        });

        it('should filter by vulnerability ID (case insensitive)', () => {
            const [filteredPatches] = filter(patches, 'cve-2023-1001', undefined);

            expect(filteredPatches).toHaveLength(1);
            expect(filteredPatches[0]!.vulnerability_id).toBe('CVE-2023-1001');
        });

        it('should filter by partial vulnerability ID match', () => {
            const [filteredPatches] = filter(patches, '2023-20', undefined);

            expect(filteredPatches).toHaveLength(1);
            expect(filteredPatches[0]!.vulnerability_id).toBe('CVE-2023-2002');
        });

        it('should return multiple matches when search key matches multiple patches', () => {
            const [filteredPatches] = filter(patches, '2023', undefined);

            expect(filteredPatches).toHaveLength(3);
        });

        it('should return empty array when search key matches nothing', () => {
            const [filteredPatches] = filter(patches, 'nonexistent', undefined);

            expect(filteredPatches).toHaveLength(0);
        });

        it('should handle empty search key', () => {
            const [filteredPatches] = filter(patches, '', undefined);

            expect(filteredPatches).toHaveLength(3);
            expect(filteredPatches).toEqual(patches);
        });
    });

    describe('null and undefined handling', () => {
        it('should handle null dependency name', () => {
            const patches = [
                createMockPatchInfo({ affected_dep_name: null as any }),
                createMockPatchInfo({ affected_dep_name: 'valid-package' })
            ];

            const [filteredPatches] = filter(patches, 'valid', undefined);

            expect(filteredPatches).toHaveLength(1);
            expect(filteredPatches[0]!.affected_dep_name).toBe('valid-package');
        });

        it('should handle null vulnerability ID', () => {
            const patches = [
                createMockPatchInfo({ vulnerability_id: null as any }),
                createMockPatchInfo({ vulnerability_id: 'CVE-2023-1234' })
            ];

            const [filteredPatches] = filter(patches, 'CVE', undefined);

            expect(filteredPatches).toHaveLength(1);
            expect(filteredPatches[0]!.vulnerability_id).toBe('CVE-2023-1234');
        });

        it('should handle null searchKey', () => {
            const patches = [createMockPatchInfo()];

            const [filteredPatches] = filter(patches, null as any, undefined);

            expect(filteredPatches).toHaveLength(1);
            expect(filteredPatches).toEqual(patches);
        });

        it('should handle null activeFilters', () => {
            const patches = [createMockPatchInfo()];

            const [filteredPatches] = filter(patches, undefined, null as any);

            expect(filteredPatches).toHaveLength(1);
            expect(filteredPatches).toEqual(patches);
        });
    });

    describe('active filters (currently not implemented)', () => {
        it('should return all patches regardless of active filters', () => {
            const patches = [
                createMockPatchInfo({ patch_type: 'full_patch' }),
                createMockPatchInfo({ patch_type: 'partial_patch' })
            ];

            const [filteredPatches] = filter(patches, undefined, ['full_patch']);

            expect(filteredPatches).toHaveLength(2);
            expect(filteredPatches).toEqual(patches);
        });

        it('should handle empty active filters array', () => {
            const patches = [createMockPatchInfo()];

            const [filteredPatches] = filter(patches, undefined, []);

            expect(filteredPatches).toHaveLength(1);
            expect(filteredPatches).toEqual(patches);
        });
    });

    describe('counts calculation', () => {
        it('should calculate counts correctly when no active filters are applied', () => {
            const patches = [createMockPatchInfo(), createMockPatchInfo(), createMockPatchInfo()];

            const [, counts] = filter(patches, undefined, undefined);

            expect(counts).toEqual({
                full_patch: 3,
                partial_patch: 3,
                none_patch: 3
            });
        });

        it('should include all filters in counts calculation (current implementation bug)', () => {
            const patches = [createMockPatchInfo(), createMockPatchInfo()];

            const [, counts] = filter(patches, undefined, ['full_patch']);

            // Note: Current implementation has a bug where it uses "filter in activeFiltersSafe"
            // instead of "activeFiltersSafe.includes(filter)", so filters are not actually excluded
            expect(counts).toEqual({
                full_patch: 2,
                partial_patch: 2,
                none_patch: 2
            });
        });

        it('should calculate counts based on search-filtered results', () => {
            const patches = [
                createMockPatchInfo({ affected_dep_name: 'lodash' }),
                createMockPatchInfo({ affected_dep_name: 'express' }),
                createMockPatchInfo({ affected_dep_name: 'react' })
            ];

            const [, counts] = filter(patches, 'lodash', undefined);

            expect(counts).toEqual({
                full_patch: 1,
                partial_patch: 1,
                none_patch: 1
            });
        });

        it('should return zero counts when search yields no results', () => {
            const patches = [createMockPatchInfo({ affected_dep_name: 'lodash' })];

            const [, counts] = filter(patches, 'nonexistent', undefined);

            expect(counts).toEqual({
                full_patch: 0,
                partial_patch: 0,
                none_patch: 0
            });
        });
    });

    describe('combined filtering', () => {
        it('should apply search key filtering before active filters', () => {
            const patches = [
                createMockPatchInfo({
                    affected_dep_name: 'lodash',
                    patch_type: 'full_patch'
                }),
                createMockPatchInfo({
                    affected_dep_name: 'express',
                    patch_type: 'partial_patch'
                })
            ];

            const [filteredPatches] = filter(patches, 'lodash', ['full_patch']);

            expect(filteredPatches).toHaveLength(1);
            expect(filteredPatches[0]!.affected_dep_name).toBe('lodash');
        });
    });

    describe('edge cases', () => {
        it('should handle patches with undefined fields gracefully', () => {
            const patches = [
                {
                    affected_deps: [],
                    affected_dep_name: undefined as any,
                    occurance_count: 0,
                    patchable_occurances_count: 0,
                    unpatchable_occurances_count: 0,
                    vulnerability_id: undefined as any,
                    introduction_type: undefined,
                    patch_type: undefined,
                    vulnerability_info: createMockVulnerabilitySummary(),
                    patches: {}
                }
            ];

            const [filteredPatches] = filter(patches, 'test', undefined);

            expect(filteredPatches).toHaveLength(0);
        });

        it('should handle special characters in search key', () => {
            const patches = [
                createMockPatchInfo({
                    affected_dep_name: '@scope/package-name',
                    vulnerability_id: 'CVE-2023-1234'
                })
            ];

            const [filteredPatches] = filter(patches, '@scope', undefined);

            expect(filteredPatches).toHaveLength(1);
            expect(filteredPatches[0]!.affected_dep_name).toBe('@scope/package-name');
        });

        it('should handle very long search keys', () => {
            const longSearchKey = 'a'.repeat(1000);
            const patches = [createMockPatchInfo()];

            const [filteredPatches] = filter(patches, longSearchKey, undefined);

            expect(filteredPatches).toHaveLength(0);
        });
    });
});
