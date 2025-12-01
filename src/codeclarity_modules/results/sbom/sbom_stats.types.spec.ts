import { newAnalysisStats, type AnalysisStats } from './sbom_stats.types';

describe('SBOM Stats Types', () => {
    describe('AnalysisStats interface', () => {
        it('should define analysis stats structure', () => {
            const stats: AnalysisStats = {
                number_of_dev_dependencies: 10,
                number_of_non_dev_dependencies: 20,
                number_of_peer_dependencies: 5,
                number_of_bundled_dependencies: 3,
                number_of_optional_dependencies: 2,
                number_of_outdated_dependencies: 8,
                number_of_deprecated_dependencies: 1,
                number_of_unlicensed_dependencies: 0,
                number_of_direct_dependencies: 15,
                number_of_transitive_dependencies: 25,
                number_of_both_direct_transitive_dependencies: 5,
                number_of_dependencies: 40,
                average_dependency_age: 365.5,
                number_of_dev_dependencies_diff: 2,
                number_of_non_dev_dependencies_diff: -1,
                number_of_peer_dependencies_diff: 0,
                number_of_bundled_dependencies_diff: 1,
                number_of_optional_dependencies_diff: 0,
                number_of_outdated_dependencies_diff: 3,
                number_of_deprecated_dependencies_diff: 0,
                number_of_unlicensed_dependencies_diff: -1,
                number_of_direct_dependencies_diff: 1,
                number_of_transitive_dependencies_diff: 2,
                number_of_dependencies_diff: 3,
                average_dependency_age_diff: 10.5,
                node_min_supported_version: '14.0.0',
                node_max_supported_version: '18.0.0'
            };

            expect(stats.number_of_dev_dependencies).toBe(10);
            expect(stats.number_of_non_dev_dependencies).toBe(20);
            expect(stats.number_of_peer_dependencies).toBe(5);
            expect(stats.number_of_bundled_dependencies).toBe(3);
            expect(stats.number_of_optional_dependencies).toBe(2);
            expect(stats.number_of_outdated_dependencies).toBe(8);
            expect(stats.number_of_deprecated_dependencies).toBe(1);
            expect(stats.number_of_unlicensed_dependencies).toBe(0);
            expect(stats.number_of_direct_dependencies).toBe(15);
            expect(stats.number_of_transitive_dependencies).toBe(25);
            expect(stats.number_of_both_direct_transitive_dependencies).toBe(5);
            expect(stats.number_of_dependencies).toBe(40);
            expect(stats.average_dependency_age).toBe(365.5);
            expect(stats.number_of_dev_dependencies_diff).toBe(2);
            expect(stats.number_of_non_dev_dependencies_diff).toBe(-1);
            expect(stats.number_of_peer_dependencies_diff).toBe(0);
            expect(stats.number_of_bundled_dependencies_diff).toBe(1);
            expect(stats.number_of_optional_dependencies_diff).toBe(0);
            expect(stats.number_of_outdated_dependencies_diff).toBe(3);
            expect(stats.number_of_deprecated_dependencies_diff).toBe(0);
            expect(stats.number_of_unlicensed_dependencies_diff).toBe(-1);
            expect(stats.number_of_direct_dependencies_diff).toBe(1);
            expect(stats.number_of_transitive_dependencies_diff).toBe(2);
            expect(stats.number_of_dependencies_diff).toBe(3);
            expect(stats.average_dependency_age_diff).toBe(10.5);
            expect(stats.node_min_supported_version).toBe('14.0.0');
            expect(stats.node_max_supported_version).toBe('18.0.0');
        });

        it('should allow zero values for all numeric fields', () => {
            const stats: AnalysisStats = {
                number_of_dev_dependencies: 0,
                number_of_non_dev_dependencies: 0,
                number_of_peer_dependencies: 0,
                number_of_bundled_dependencies: 0,
                number_of_optional_dependencies: 0,
                number_of_outdated_dependencies: 0,
                number_of_deprecated_dependencies: 0,
                number_of_unlicensed_dependencies: 0,
                number_of_direct_dependencies: 0,
                number_of_transitive_dependencies: 0,
                number_of_both_direct_transitive_dependencies: 0,
                number_of_dependencies: 0,
                average_dependency_age: 0,
                number_of_dev_dependencies_diff: 0,
                number_of_non_dev_dependencies_diff: 0,
                number_of_peer_dependencies_diff: 0,
                number_of_bundled_dependencies_diff: 0,
                number_of_optional_dependencies_diff: 0,
                number_of_outdated_dependencies_diff: 0,
                number_of_deprecated_dependencies_diff: 0,
                number_of_unlicensed_dependencies_diff: 0,
                number_of_direct_dependencies_diff: 0,
                number_of_transitive_dependencies_diff: 0,
                number_of_dependencies_diff: 0,
                average_dependency_age_diff: 0,
                node_min_supported_version: '0.0.0',
                node_max_supported_version: '0.0.0'
            };

            expect(stats.number_of_dev_dependencies).toBe(0);
            expect(stats.number_of_non_dev_dependencies).toBe(0);
            expect(stats.average_dependency_age).toBe(0);
            expect(stats.node_min_supported_version).toBe('0.0.0');
            expect(stats.node_max_supported_version).toBe('0.0.0');
        });

        it('should allow negative values for diff fields', () => {
            const stats: AnalysisStats = {
                number_of_dev_dependencies: 10,
                number_of_non_dev_dependencies: 20,
                number_of_peer_dependencies: 5,
                number_of_bundled_dependencies: 3,
                number_of_optional_dependencies: 2,
                number_of_outdated_dependencies: 8,
                number_of_deprecated_dependencies: 1,
                number_of_unlicensed_dependencies: 0,
                number_of_direct_dependencies: 15,
                number_of_transitive_dependencies: 25,
                number_of_both_direct_transitive_dependencies: 5,
                number_of_dependencies: 40,
                average_dependency_age: 365.5,
                number_of_dev_dependencies_diff: -5,
                number_of_non_dev_dependencies_diff: -10,
                number_of_peer_dependencies_diff: -2,
                number_of_bundled_dependencies_diff: -1,
                number_of_optional_dependencies_diff: -3,
                number_of_outdated_dependencies_diff: -7,
                number_of_deprecated_dependencies_diff: -1,
                number_of_unlicensed_dependencies_diff: -2,
                number_of_direct_dependencies_diff: -8,
                number_of_transitive_dependencies_diff: -15,
                number_of_dependencies_diff: -23,
                average_dependency_age_diff: -50.5,
                node_min_supported_version: '12.0.0',
                node_max_supported_version: '16.0.0'
            };

            expect(stats.number_of_dev_dependencies_diff).toBe(-5);
            expect(stats.number_of_non_dev_dependencies_diff).toBe(-10);
            expect(stats.number_of_peer_dependencies_diff).toBe(-2);
            expect(stats.number_of_bundled_dependencies_diff).toBe(-1);
            expect(stats.number_of_optional_dependencies_diff).toBe(-3);
            expect(stats.number_of_outdated_dependencies_diff).toBe(-7);
            expect(stats.number_of_deprecated_dependencies_diff).toBe(-1);
            expect(stats.number_of_unlicensed_dependencies_diff).toBe(-2);
            expect(stats.number_of_direct_dependencies_diff).toBe(-8);
            expect(stats.number_of_transitive_dependencies_diff).toBe(-15);
            expect(stats.number_of_dependencies_diff).toBe(-23);
            expect(stats.average_dependency_age_diff).toBe(-50.5);
        });

        it('should allow decimal values for average fields', () => {
            const stats: AnalysisStats = {
                number_of_dev_dependencies: 10,
                number_of_non_dev_dependencies: 20,
                number_of_peer_dependencies: 5,
                number_of_bundled_dependencies: 3,
                number_of_optional_dependencies: 2,
                number_of_outdated_dependencies: 8,
                number_of_deprecated_dependencies: 1,
                number_of_unlicensed_dependencies: 0,
                number_of_direct_dependencies: 15,
                number_of_transitive_dependencies: 25,
                number_of_both_direct_transitive_dependencies: 5,
                number_of_dependencies: 40,
                average_dependency_age: 123.456,
                number_of_dev_dependencies_diff: 2,
                number_of_non_dev_dependencies_diff: -1,
                number_of_peer_dependencies_diff: 0,
                number_of_bundled_dependencies_diff: 1,
                number_of_optional_dependencies_diff: 0,
                number_of_outdated_dependencies_diff: 3,
                number_of_deprecated_dependencies_diff: 0,
                number_of_unlicensed_dependencies_diff: -1,
                number_of_direct_dependencies_diff: 1,
                number_of_transitive_dependencies_diff: 2,
                number_of_dependencies_diff: 3,
                average_dependency_age_diff: -78.901,
                node_min_supported_version: '14.0.0',
                node_max_supported_version: '18.0.0'
            };

            expect(stats.average_dependency_age).toBe(123.456);
            expect(stats.average_dependency_age_diff).toBe(-78.901);
        });

        it('should allow semantic version strings', () => {
            const stats: AnalysisStats = {
                number_of_dev_dependencies: 10,
                number_of_non_dev_dependencies: 20,
                number_of_peer_dependencies: 5,
                number_of_bundled_dependencies: 3,
                number_of_optional_dependencies: 2,
                number_of_outdated_dependencies: 8,
                number_of_deprecated_dependencies: 1,
                number_of_unlicensed_dependencies: 0,
                number_of_direct_dependencies: 15,
                number_of_transitive_dependencies: 25,
                number_of_both_direct_transitive_dependencies: 5,
                number_of_dependencies: 40,
                average_dependency_age: 365.5,
                number_of_dev_dependencies_diff: 2,
                number_of_non_dev_dependencies_diff: -1,
                number_of_peer_dependencies_diff: 0,
                number_of_bundled_dependencies_diff: 1,
                number_of_optional_dependencies_diff: 0,
                number_of_outdated_dependencies_diff: 3,
                number_of_deprecated_dependencies_diff: 0,
                number_of_unlicensed_dependencies_diff: -1,
                number_of_direct_dependencies_diff: 1,
                number_of_transitive_dependencies_diff: 2,
                number_of_dependencies_diff: 3,
                average_dependency_age_diff: 10.5,
                node_min_supported_version: '14.15.0',
                node_max_supported_version: '18.12.1'
            };

            expect(stats.node_min_supported_version).toBe('14.15.0');
            expect(stats.node_max_supported_version).toBe('18.12.1');
        });

        it('should handle all required fields', () => {
            const stats: AnalysisStats = {
                number_of_dev_dependencies: 1,
                number_of_non_dev_dependencies: 2,
                number_of_peer_dependencies: 3,
                number_of_bundled_dependencies: 4,
                number_of_optional_dependencies: 5,
                number_of_outdated_dependencies: 6,
                number_of_deprecated_dependencies: 7,
                number_of_unlicensed_dependencies: 8,
                number_of_direct_dependencies: 9,
                number_of_transitive_dependencies: 10,
                number_of_both_direct_transitive_dependencies: 11,
                number_of_dependencies: 12,
                average_dependency_age: 13.5,
                number_of_dev_dependencies_diff: 14,
                number_of_non_dev_dependencies_diff: 15,
                number_of_peer_dependencies_diff: 16,
                number_of_bundled_dependencies_diff: 17,
                number_of_optional_dependencies_diff: 18,
                number_of_outdated_dependencies_diff: 19,
                number_of_deprecated_dependencies_diff: 20,
                number_of_unlicensed_dependencies_diff: 21,
                number_of_direct_dependencies_diff: 22,
                number_of_transitive_dependencies_diff: 23,
                number_of_dependencies_diff: 24,
                average_dependency_age_diff: 25.5,
                node_min_supported_version: '26.0.0',
                node_max_supported_version: '27.0.0'
            };

            // Verify all fields are present and have expected values
            expect(Object.keys(stats)).toHaveLength(27);
            expect(stats.number_of_dev_dependencies).toBe(1);
            expect(stats.number_of_non_dev_dependencies).toBe(2);
            expect(stats.number_of_peer_dependencies).toBe(3);
            expect(stats.number_of_bundled_dependencies).toBe(4);
            expect(stats.number_of_optional_dependencies).toBe(5);
            expect(stats.number_of_outdated_dependencies).toBe(6);
            expect(stats.number_of_deprecated_dependencies).toBe(7);
            expect(stats.number_of_unlicensed_dependencies).toBe(8);
            expect(stats.number_of_direct_dependencies).toBe(9);
            expect(stats.number_of_transitive_dependencies).toBe(10);
            expect(stats.number_of_both_direct_transitive_dependencies).toBe(11);
            expect(stats.number_of_dependencies).toBe(12);
            expect(stats.average_dependency_age).toBe(13.5);
            expect(stats.number_of_dev_dependencies_diff).toBe(14);
            expect(stats.number_of_non_dev_dependencies_diff).toBe(15);
            expect(stats.number_of_peer_dependencies_diff).toBe(16);
            expect(stats.number_of_bundled_dependencies_diff).toBe(17);
            expect(stats.number_of_optional_dependencies_diff).toBe(18);
            expect(stats.number_of_outdated_dependencies_diff).toBe(19);
            expect(stats.number_of_deprecated_dependencies_diff).toBe(20);
            expect(stats.number_of_unlicensed_dependencies_diff).toBe(21);
            expect(stats.number_of_direct_dependencies_diff).toBe(22);
            expect(stats.number_of_transitive_dependencies_diff).toBe(23);
            expect(stats.number_of_dependencies_diff).toBe(24);
            expect(stats.average_dependency_age_diff).toBe(25.5);
            expect(stats.node_min_supported_version).toBe('26.0.0');
            expect(stats.node_max_supported_version).toBe('27.0.0');
        });
    });

    describe('newAnalysisStats function', () => {
        it('should create a new AnalysisStats object with default values', () => {
            const stats = newAnalysisStats();

            expect(stats).toBeDefined();
            expect(typeof stats).toBe('object');
        });

        it('should initialize all count fields to 0', () => {
            const stats = newAnalysisStats();

            expect(stats.number_of_dev_dependencies).toBe(0);
            expect(stats.number_of_non_dev_dependencies).toBe(0);
            expect(stats.number_of_peer_dependencies).toBe(0);
            expect(stats.number_of_bundled_dependencies).toBe(0);
            expect(stats.number_of_optional_dependencies).toBe(0);
            expect(stats.number_of_outdated_dependencies).toBe(0);
            expect(stats.number_of_deprecated_dependencies).toBe(0);
            expect(stats.number_of_unlicensed_dependencies).toBe(0);
            expect(stats.number_of_direct_dependencies).toBe(0);
            expect(stats.number_of_transitive_dependencies).toBe(0);
            expect(stats.number_of_both_direct_transitive_dependencies).toBe(0);
            expect(stats.number_of_dependencies).toBe(0);
        });

        it('should initialize all diff fields to 0', () => {
            const stats = newAnalysisStats();

            expect(stats.number_of_dev_dependencies_diff).toBe(0);
            expect(stats.number_of_non_dev_dependencies_diff).toBe(0);
            expect(stats.number_of_peer_dependencies_diff).toBe(0);
            expect(stats.number_of_bundled_dependencies_diff).toBe(0);
            expect(stats.number_of_optional_dependencies_diff).toBe(0);
            expect(stats.number_of_outdated_dependencies_diff).toBe(0);
            expect(stats.number_of_deprecated_dependencies_diff).toBe(0);
            expect(stats.number_of_unlicensed_dependencies_diff).toBe(0);
            expect(stats.number_of_direct_dependencies_diff).toBe(0);
            expect(stats.number_of_transitive_dependencies_diff).toBe(0);
            expect(stats.number_of_dependencies_diff).toBe(0);
        });

        it('should initialize average fields to 0', () => {
            const stats = newAnalysisStats();

            expect(stats.average_dependency_age).toBe(0);
            expect(stats.average_dependency_age_diff).toBe(0);
        });

        it('should initialize node version fields to default values', () => {
            const stats = newAnalysisStats();

            expect(stats.node_min_supported_version).toBe('0.0.0');
            expect(stats.node_max_supported_version).toBe('100.0.0');
        });

        it('should create a new instance each time', () => {
            const stats1 = newAnalysisStats();
            const stats2 = newAnalysisStats();

            expect(stats1).not.toBe(stats2);
            expect(stats1).toEqual(stats2);
        });

        it('should return an object with all required fields', () => {
            const stats = newAnalysisStats();
            const expectedFields = [
                'number_of_dev_dependencies',
                'number_of_non_dev_dependencies',
                'number_of_peer_dependencies',
                'number_of_bundled_dependencies',
                'number_of_optional_dependencies',
                'number_of_outdated_dependencies',
                'number_of_deprecated_dependencies',
                'number_of_unlicensed_dependencies',
                'number_of_direct_dependencies',
                'number_of_transitive_dependencies',
                'number_of_both_direct_transitive_dependencies',
                'number_of_dependencies',
                'average_dependency_age',
                'number_of_dev_dependencies_diff',
                'number_of_non_dev_dependencies_diff',
                'number_of_peer_dependencies_diff',
                'number_of_bundled_dependencies_diff',
                'number_of_optional_dependencies_diff',
                'number_of_outdated_dependencies_diff',
                'number_of_deprecated_dependencies_diff',
                'number_of_unlicensed_dependencies_diff',
                'number_of_direct_dependencies_diff',
                'number_of_transitive_dependencies_diff',
                'number_of_dependencies_diff',
                'average_dependency_age_diff',
                'node_min_supported_version',
                'node_max_supported_version'
            ];

            expect(Object.keys(stats)).toHaveLength(expectedFields.length);

            for (const field of expectedFields) {
                expect(stats).toHaveProperty(field);
            }
        });

        it('should return an object that satisfies the AnalysisStats interface', () => {
            const stats = newAnalysisStats();

            // TypeScript compilation will fail if this doesn't match the interface
            const testStats: AnalysisStats = stats;
            expect(testStats).toBeDefined();
        });

        it('should allow modification of returned object', () => {
            const stats = newAnalysisStats();

            stats.number_of_dependencies = 100;
            stats.average_dependency_age = 365.25;
            stats.node_min_supported_version = '14.0.0';
            stats.node_max_supported_version = '18.0.0';

            expect(stats.number_of_dependencies).toBe(100);
            expect(stats.average_dependency_age).toBe(365.25);
            expect(stats.node_min_supported_version).toBe('14.0.0');
            expect(stats.node_max_supported_version).toBe('18.0.0');
        });

        it('should handle realistic usage pattern', () => {
            const stats = newAnalysisStats();

            // Simulate updating stats during analysis
            stats.number_of_dev_dependencies = 15;
            stats.number_of_non_dev_dependencies = 35;
            stats.number_of_dependencies = 50;
            stats.number_of_direct_dependencies = 20;
            stats.number_of_transitive_dependencies = 30;
            stats.number_of_outdated_dependencies = 8;
            stats.number_of_deprecated_dependencies = 2;
            stats.average_dependency_age = 180.5;
            stats.node_min_supported_version = '14.0.0';
            stats.node_max_supported_version = '18.0.0';

            // Simulate diff calculation
            stats.number_of_dependencies_diff = 5;
            stats.number_of_dev_dependencies_diff = 2;
            stats.number_of_non_dev_dependencies_diff = 3;
            stats.average_dependency_age_diff = -30.2;

            expect(stats.number_of_dependencies).toBe(50);
            expect(stats.number_of_dependencies_diff).toBe(5);
            expect(stats.average_dependency_age).toBe(180.5);
            expect(stats.average_dependency_age_diff).toBe(-30.2);
        });
    });

    describe('type compatibility', () => {
        it('should be compatible with AnalysisStats interface', () => {
            const stats = newAnalysisStats();

            // This should compile without errors
            function processStats(analysisStats: AnalysisStats): void {
                expect(analysisStats.number_of_dependencies).toBeDefined();
                expect(analysisStats.node_min_supported_version).toBeDefined();
                expect(analysisStats.node_max_supported_version).toBeDefined();
            }

            processStats(stats);
        });

        it('should allow partial updates while maintaining type safety', () => {
            const stats = newAnalysisStats();

            // Partial updates should work
            const updates: Partial<AnalysisStats> = {
                number_of_dependencies: 42,
                average_dependency_age: 200.5,
                node_min_supported_version: '16.0.0'
            };

            Object.assign(stats, updates);

            expect(stats.number_of_dependencies).toBe(42);
            expect(stats.average_dependency_age).toBe(200.5);
            expect(stats.node_min_supported_version).toBe('16.0.0');
            expect(stats.node_max_supported_version).toBe('100.0.0'); // Should remain default
        });
    });
});
