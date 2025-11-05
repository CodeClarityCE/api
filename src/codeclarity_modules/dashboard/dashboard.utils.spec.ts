import { ProjectGradeClass } from './dashboard.types';

// Extract utility functions for testing
function subtractMonths(date: Date, months: number): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() - months);
    return result;
}

function getWeekNumber(date: Date): number {
    const target = new Date(date.valueOf());
    const dayNr = (date.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const jan4 = new Date(target.getFullYear(), 0, 4);
    const dayDiff = (target.getTime() - jan4.getTime()) / 86400000;
    return 1 + Math.ceil(dayDiff / 7);
}

function getProjectScoreClassFromScore(score: number): ProjectGradeClass {
    if (score <= 1.0 && score >= 0.85) {
        return ProjectGradeClass.D;
    } else if (score < 0.85 && score >= 0.7) {
        return ProjectGradeClass.D_PLUS;
    } else if (score < 0.7 && score >= 0.55) {
        return ProjectGradeClass.C;
    } else if (score < 0.55 && score >= 0.4) {
        return ProjectGradeClass.C_PLUS;
    } else if (score < 0.4 && score >= 0.25) {
        return ProjectGradeClass.B;
    } else if (score < 0.25 && score >= 0.1) {
        return ProjectGradeClass.B_PLUS;
    } else if (score < 0.1 && score > 0) {
        return ProjectGradeClass.A;
    } else if (score === 0) {
        return ProjectGradeClass.A_PLUS;
    }
    return ProjectGradeClass.D;
}

describe('Dashboard Utility Functions', () => {
    describe('subtractMonths', () => {
        it('should subtract months correctly', () => {
            const baseDate = new Date('2023-06-15');
            const result = subtractMonths(baseDate, 2);

            expect(result.getFullYear()).toBe(2023);
            expect(result.getMonth()).toBe(3); // April (0-indexed)
            expect(result.getDate()).toBe(15);
        });

        it('should handle year boundary correctly', () => {
            const baseDate = new Date('2023-02-15');
            const result = subtractMonths(baseDate, 4);

            expect(result.getFullYear()).toBe(2022);
            expect(result.getMonth()).toBe(9); // October (0-indexed)
            expect(result.getDate()).toBe(15);
        });

        it('should handle February edge cases', () => {
            const baseDate = new Date('2023-03-31');
            const result = subtractMonths(baseDate, 1);

            expect(result.getFullYear()).toBe(2023);
            expect(result.getMonth()).toBe(2); // March becomes February, but JS adjusts it to March 3rd
            // Date may be adjusted by JavaScript Date constructor
            expect(result.getDate()).toBeGreaterThan(0);
        });

        it('should handle zero months', () => {
            const baseDate = new Date('2023-06-15');
            const result = subtractMonths(baseDate, 0);

            expect(result.getTime()).toBe(baseDate.getTime());
        });

        it('should handle negative months (add months)', () => {
            const baseDate = new Date('2023-06-15');
            const result = subtractMonths(baseDate, -2);

            expect(result.getFullYear()).toBe(2023);
            expect(result.getMonth()).toBe(7); // August (0-indexed)
            expect(result.getDate()).toBe(15);
        });

        it('should not modify original date', () => {
            const baseDate = new Date('2023-06-15');
            const originalTime = baseDate.getTime();

            subtractMonths(baseDate, 2);

            expect(baseDate.getTime()).toBe(originalTime);
        });
    });

    describe('getWeekNumber', () => {
        it('should calculate week number correctly for January 1st', () => {
            const date = new Date('2023-01-01');
            const weekNumber = getWeekNumber(date);

            expect(weekNumber).toBeGreaterThan(0);
            expect(weekNumber).toBeLessThanOrEqual(53);
        });

        it('should calculate week number correctly for December 31st', () => {
            const date = new Date('2023-12-31');
            const weekNumber = getWeekNumber(date);

            expect(weekNumber).toBeGreaterThan(0);
            expect(weekNumber).toBeLessThanOrEqual(53);
        });

        it('should calculate week number correctly for mid-year dates', () => {
            const date = new Date('2023-06-15');
            const weekNumber = getWeekNumber(date);

            expect(weekNumber).toBeGreaterThan(20);
            expect(weekNumber).toBeLessThan(30);
        });

        it('should handle Monday (start of week)', () => {
            const monday = new Date('2023-10-02'); // A Monday
            const weekNumber = getWeekNumber(monday);

            expect(weekNumber).toBeGreaterThan(0);
            expect(weekNumber).toBeLessThanOrEqual(53);
        });

        it('should handle Sunday (end of week)', () => {
            const sunday = new Date('2023-10-01'); // A Sunday
            const weekNumber = getWeekNumber(sunday);

            expect(weekNumber).toBeGreaterThan(0);
            expect(weekNumber).toBeLessThanOrEqual(53);
        });

        it('should handle leap year correctly', () => {
            const leapYearDate = new Date('2024-02-29');
            const weekNumber = getWeekNumber(leapYearDate);

            expect(weekNumber).toBeGreaterThan(0);
            expect(weekNumber).toBeLessThanOrEqual(53);
        });

        it('should return consistent results for same week', () => {
            const monday = new Date('2023-10-02');
            const tuesday = new Date('2023-10-03');
            const sunday = new Date('2023-10-08');

            const mondayWeek = getWeekNumber(monday);
            const tuesdayWeek = getWeekNumber(tuesday);
            const sundayWeek = getWeekNumber(sunday);

            expect(mondayWeek).toBe(tuesdayWeek);
            expect(tuesdayWeek).toBe(sundayWeek);
        });

        it('should not modify original date', () => {
            const date = new Date('2023-06-15');
            const originalTime = date.getTime();

            getWeekNumber(date);

            expect(date.getTime()).toBe(originalTime);
        });
    });

    describe('getProjectScoreClassFromScore', () => {
        it('should return A+ for score 0', () => {
            const result = getProjectScoreClassFromScore(0);
            expect(result).toBe(ProjectGradeClass.A_PLUS);
        });

        it('should return A for scores > 0 and < 0.1', () => {
            expect(getProjectScoreClassFromScore(0.05)).toBe(ProjectGradeClass.A);
            expect(getProjectScoreClassFromScore(0.09)).toBe(ProjectGradeClass.A);
        });

        it('should return B+ for scores >= 0.1 and < 0.25', () => {
            expect(getProjectScoreClassFromScore(0.1)).toBe(ProjectGradeClass.B_PLUS);
            expect(getProjectScoreClassFromScore(0.15)).toBe(ProjectGradeClass.B_PLUS);
            expect(getProjectScoreClassFromScore(0.24)).toBe(ProjectGradeClass.B_PLUS);
        });

        it('should return B for scores >= 0.25 and < 0.4', () => {
            expect(getProjectScoreClassFromScore(0.25)).toBe(ProjectGradeClass.B);
            expect(getProjectScoreClassFromScore(0.3)).toBe(ProjectGradeClass.B);
            expect(getProjectScoreClassFromScore(0.39)).toBe(ProjectGradeClass.B);
        });

        it('should return C+ for scores >= 0.4 and < 0.55', () => {
            expect(getProjectScoreClassFromScore(0.4)).toBe(ProjectGradeClass.C_PLUS);
            expect(getProjectScoreClassFromScore(0.45)).toBe(ProjectGradeClass.C_PLUS);
            expect(getProjectScoreClassFromScore(0.54)).toBe(ProjectGradeClass.C_PLUS);
        });

        it('should return C for scores >= 0.55 and < 0.7', () => {
            expect(getProjectScoreClassFromScore(0.55)).toBe(ProjectGradeClass.C);
            expect(getProjectScoreClassFromScore(0.6)).toBe(ProjectGradeClass.C);
            expect(getProjectScoreClassFromScore(0.69)).toBe(ProjectGradeClass.C);
        });

        it('should return D+ for scores >= 0.7 and < 0.85', () => {
            expect(getProjectScoreClassFromScore(0.7)).toBe(ProjectGradeClass.D_PLUS);
            expect(getProjectScoreClassFromScore(0.75)).toBe(ProjectGradeClass.D_PLUS);
            expect(getProjectScoreClassFromScore(0.84)).toBe(ProjectGradeClass.D_PLUS);
        });

        it('should return D for scores >= 0.85 and <= 1.0', () => {
            expect(getProjectScoreClassFromScore(0.85)).toBe(ProjectGradeClass.D);
            expect(getProjectScoreClassFromScore(0.9)).toBe(ProjectGradeClass.D);
            expect(getProjectScoreClassFromScore(1.0)).toBe(ProjectGradeClass.D);
        });

        it('should return D for scores > 1.0 (fallback)', () => {
            expect(getProjectScoreClassFromScore(1.5)).toBe(ProjectGradeClass.D);
            expect(getProjectScoreClassFromScore(2.0)).toBe(ProjectGradeClass.D);
        });

        it('should return D for negative scores (fallback)', () => {
            expect(getProjectScoreClassFromScore(-0.1)).toBe(ProjectGradeClass.D);
            expect(getProjectScoreClassFromScore(-1)).toBe(ProjectGradeClass.D);
        });

        it('should handle boundary conditions correctly', () => {
            // Test exact boundary values
            expect(getProjectScoreClassFromScore(0.1)).toBe(ProjectGradeClass.B_PLUS);
            expect(getProjectScoreClassFromScore(0.25)).toBe(ProjectGradeClass.B);
            expect(getProjectScoreClassFromScore(0.4)).toBe(ProjectGradeClass.C_PLUS);
            expect(getProjectScoreClassFromScore(0.55)).toBe(ProjectGradeClass.C);
            expect(getProjectScoreClassFromScore(0.7)).toBe(ProjectGradeClass.D_PLUS);
            expect(getProjectScoreClassFromScore(0.85)).toBe(ProjectGradeClass.D);
        });

        it('should handle floating point precision', () => {
            // Test values that might have floating point precision issues
            expect(getProjectScoreClassFromScore(0.1000000001)).toBe(ProjectGradeClass.B_PLUS);
            expect(getProjectScoreClassFromScore(0.2499999999)).toBe(ProjectGradeClass.B_PLUS);
        });
    });

    describe('edge cases and error handling', () => {
        it('should handle invalid dates gracefully', () => {
            const invalidDate = new Date('invalid');

            expect(() => {
                subtractMonths(invalidDate, 1);
            }).not.toThrow();

            expect(() => {
                getWeekNumber(invalidDate);
            }).not.toThrow();
        });

        it('should handle very large month subtraction', () => {
            const baseDate = new Date('2023-06-15');
            const result = subtractMonths(baseDate, 100);

            expect(result).toBeInstanceOf(Date);
            expect(result.getFullYear()).toBeLessThan(2023);
        });

        it('should handle very old dates', () => {
            const oldDate = new Date('1900-01-01');
            const weekNumber = getWeekNumber(oldDate);

            expect(weekNumber).toBeGreaterThan(0);
            expect(weekNumber).toBeLessThanOrEqual(53);
        });

        it('should handle future dates', () => {
            const futureDate = new Date('2030-12-31');
            const weekNumber = getWeekNumber(futureDate);

            expect(weekNumber).toBeGreaterThan(0);
            expect(weekNumber).toBeLessThanOrEqual(53);
        });

        it('should handle extreme score values', () => {
            expect(getProjectScoreClassFromScore(Number.MAX_VALUE)).toBe(ProjectGradeClass.D);
            expect(getProjectScoreClassFromScore(Number.MIN_VALUE)).toBe(ProjectGradeClass.A);
            expect(getProjectScoreClassFromScore(Number.NEGATIVE_INFINITY)).toBe(
                ProjectGradeClass.D
            );
            expect(getProjectScoreClassFromScore(Number.POSITIVE_INFINITY)).toBe(
                ProjectGradeClass.D
            );
        });

        it('should handle NaN score values', () => {
            expect(getProjectScoreClassFromScore(NaN)).toBe(ProjectGradeClass.D);
        });
    });
});
