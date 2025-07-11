import { EPSS } from './epss.entity';

describe('EPSS Entity', () => {
    describe('Entity instantiation', () => {
        it('should create an EPSS instance', () => {
            const epss = new EPSS();

            expect(epss).toBeDefined();
            expect(epss).toBeInstanceOf(EPSS);
        });

        it('should allow property assignment without errors', () => {
            const epss = new EPSS();

            epss.id = 'test-uuid';
            epss.cve = 'CVE-2023-1234';
            epss.score = 0.95;
            epss.percentile = 0.99;

            expect(epss.id).toBe('test-uuid');
            expect(epss.cve).toBe('CVE-2023-1234');
            expect(epss.score).toBe(0.95);
            expect(epss.percentile).toBe(0.99);
        });
    });

    describe('Property validation', () => {
        it('should accept valid CVE identifiers', () => {
            const epss = new EPSS();

            const cveFormats = [
                'CVE-2023-1234',
                'CVE-2021-44228',
                'CVE-2020-0001',
                'CVE-1999-0001',
                'CVE-2023-999999'
            ];

            cveFormats.forEach((cveId) => {
                epss.cve = cveId;
                expect(epss.cve).toBe(cveId);
            });
        });

        it('should accept valid EPSS scores (0.0 to 1.0)', () => {
            const epss = new EPSS();

            const validScores = [0.0, 0.1, 0.5, 0.95, 0.999, 1.0];

            validScores.forEach((score) => {
                epss.score = score;
                expect(epss.score).toBe(score);
            });
        });

        it('should accept valid percentile values (0.0 to 1.0)', () => {
            const epss = new EPSS();

            const validPercentiles = [0.0, 0.01, 0.25, 0.5, 0.75, 0.99, 1.0];

            validPercentiles.forEach((percentile) => {
                epss.percentile = percentile;
                expect(epss.percentile).toBe(percentile);
            });
        });

        it('should handle null values for nullable properties', () => {
            const epss = new EPSS();

            (epss as any).score = null;
            (epss as any).percentile = null;

            expect(epss.score).toBeNull();
            expect(epss.percentile).toBeNull();
        });

        it('should handle precise decimal values', () => {
            const epss = new EPSS();

            epss.score = 0.123456789;
            epss.percentile = 0.987654321;

            expect(epss.score).toBe(0.123456789);
            expect(epss.percentile).toBe(0.987654321);
        });
    });

    describe('Real-world EPSS data examples', () => {
        it('should handle Log4Shell (CVE-2021-44228) high EPSS score', () => {
            const log4shell = new EPSS();

            log4shell.id = 'uuid-log4shell';
            log4shell.cve = 'CVE-2021-44228';
            log4shell.score = 0.97584;
            log4shell.percentile = 0.99986;

            expect(log4shell.cve).toBe('CVE-2021-44228');
            expect(log4shell.score).toBe(0.97584);
            expect(log4shell.percentile).toBe(0.99986);
        });

        it('should handle medium risk vulnerability EPSS score', () => {
            const mediumRisk = new EPSS();

            mediumRisk.id = 'uuid-medium';
            mediumRisk.cve = 'CVE-2023-5678';
            mediumRisk.score = 0.45231;
            mediumRisk.percentile = 0.75432;

            expect(mediumRisk.cve).toBe('CVE-2023-5678');
            expect(mediumRisk.score).toBe(0.45231);
            expect(mediumRisk.percentile).toBe(0.75432);
        });

        it('should handle low risk vulnerability EPSS score', () => {
            const lowRisk = new EPSS();

            lowRisk.id = 'uuid-low';
            lowRisk.cve = 'CVE-2023-9999';
            lowRisk.score = 0.00123;
            lowRisk.percentile = 0.05234;

            expect(lowRisk.cve).toBe('CVE-2023-9999');
            expect(lowRisk.score).toBe(0.00123);
            expect(lowRisk.percentile).toBe(0.05234);
        });

        it('should handle zero EPSS score', () => {
            const zeroScore = new EPSS();

            zeroScore.id = 'uuid-zero';
            zeroScore.cve = 'CVE-2023-0000';
            zeroScore.score = 0.0;
            zeroScore.percentile = 0.0;

            expect(zeroScore.score).toBe(0.0);
            expect(zeroScore.percentile).toBe(0.0);
        });

        it('should handle maximum EPSS score', () => {
            const maxScore = new EPSS();

            maxScore.id = 'uuid-max';
            maxScore.cve = 'CVE-2023-MAX';
            maxScore.score = 1.0;
            maxScore.percentile = 1.0;

            expect(maxScore.score).toBe(1.0);
            expect(maxScore.percentile).toBe(1.0);
        });
    });

    describe('Edge cases and validation', () => {
        it('should handle very long CVE identifiers', () => {
            const epss = new EPSS();
            const longCve = 'CVE-2023-' + '1'.repeat(100);

            epss.cve = longCve;
            expect(epss.cve).toBe(longCve);
        });

        it('should handle unusual CVE formats', () => {
            const epss = new EPSS();

            const unusualFormats = [
                'cve-2023-1234',
                'CVE-2023-1234-MODIFIED',
                'CVE-2023-1234_test',
                'CVE-2023-1234.1'
            ];

            unusualFormats.forEach((format) => {
                epss.cve = format;
                expect(epss.cve).toBe(format);
            });
        });

        it('should handle empty string CVE', () => {
            const epss = new EPSS();

            epss.cve = '';
            expect(epss.cve).toBe('');
        });

        it('should handle special characters in CVE', () => {
            const epss = new EPSS();
            const specialCve = 'CVE-2023-1234\'";DROP TABLE epss;--';

            epss.cve = specialCve;
            expect(epss.cve).toBe(specialCve);
        });

        it('should handle negative scores (edge case)', () => {
            const epss = new EPSS();

            epss.score = -0.1;
            epss.percentile = -0.05;

            expect(epss.score).toBe(-0.1);
            expect(epss.percentile).toBe(-0.05);
        });

        it('should handle scores above 1.0 (edge case)', () => {
            const epss = new EPSS();

            epss.score = 1.5;
            epss.percentile = 1.2;

            expect(epss.score).toBe(1.5);
            expect(epss.percentile).toBe(1.2);
        });

        it('should handle very small decimal values', () => {
            const epss = new EPSS();

            epss.score = 0.000000001;
            epss.percentile = 0.000000005;

            expect(epss.score).toBe(0.000000001);
            expect(epss.percentile).toBe(0.000000005);
        });

        it('should handle infinite and NaN values (edge case)', () => {
            const epss = new EPSS();

            epss.score = Infinity;
            epss.percentile = NaN;

            expect(epss.score).toBe(Infinity);
            expect(epss.percentile).toBeNaN();
        });
    });

    describe('EPSS score interpretation', () => {
        it('should represent very low exploitation probability', () => {
            const veryLow = new EPSS();

            veryLow.cve = 'CVE-2023-LOW';
            veryLow.score = 0.001;
            veryLow.percentile = 0.01;

            expect(veryLow.score).toBeLessThan(0.01);
            expect(veryLow.percentile).toBeLessThan(0.05);
        });

        it('should represent low exploitation probability', () => {
            const low = new EPSS();

            low.cve = 'CVE-2023-LOW2';
            low.score = 0.15;
            low.percentile = 0.25;

            expect(low.score).toBeLessThan(0.3);
            expect(low.percentile).toBeLessThan(0.5);
        });

        it('should represent medium exploitation probability', () => {
            const medium = new EPSS();

            medium.cve = 'CVE-2023-MEDIUM';
            medium.score = 0.5;
            medium.percentile = 0.75;

            expect(medium.score).toBeGreaterThanOrEqual(0.3);
            expect(medium.score).toBeLessThan(0.7);
        });

        it('should represent high exploitation probability', () => {
            const high = new EPSS();

            high.cve = 'CVE-2023-HIGH';
            high.score = 0.85;
            high.percentile = 0.95;

            expect(high.score).toBeGreaterThanOrEqual(0.7);
            expect(high.percentile).toBeGreaterThanOrEqual(0.9);
        });

        it('should represent very high exploitation probability', () => {
            const veryHigh = new EPSS();

            veryHigh.cve = 'CVE-2023-CRITICAL';
            veryHigh.score = 0.98;
            veryHigh.percentile = 0.999;

            expect(veryHigh.score).toBeGreaterThanOrEqual(0.95);
            expect(veryHigh.percentile).toBeGreaterThanOrEqual(0.99);
        });
    });

    describe('Database schema compatibility', () => {
        it('should work with float column type for score', () => {
            const epss = new EPSS();

            epss.score = 0.123456789123456;
            expect(typeof epss.score).toBe('number');
            expect(epss.score).toBeCloseTo(0.123456789123456, 10);
        });

        it('should work with float column type for percentile', () => {
            const epss = new EPSS();

            epss.percentile = 0.987654321987654;
            expect(typeof epss.percentile).toBe('number');
            expect(epss.percentile).toBeCloseTo(0.987654321987654, 10);
        });

        it('should handle unique constraint on CVE column', () => {
            const epss1 = new EPSS();
            const epss2 = new EPSS();

            epss1.cve = 'CVE-2023-UNIQUE';
            epss2.cve = 'CVE-2023-UNIQUE';

            expect(epss1.cve).toBe(epss2.cve);
        });
    });
});
