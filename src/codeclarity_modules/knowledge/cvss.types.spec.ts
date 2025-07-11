import type { CVSS2, CVSS3, CVSS31 } from './cvss.types';

describe('CVSS Types', () => {
    describe('CVSS2', () => {
        it('should accept valid CVSS2 objects with all required properties', () => {
            const cvss2: CVSS2 = {
                base_score: 7.5,
                exploitability_score: 10.0,
                impact_score: 6.4,
                access_vector: 'NETWORK',
                access_complexity: 'LOW',
                confidentiality_impact: 'PARTIAL',
                availability_impact: 'PARTIAL',
                integrity_impact: 'PARTIAL',
                authentication: 'NONE'
            };

            expect(cvss2.base_score).toBe(7.5);
            expect(cvss2.exploitability_score).toBe(10.0);
            expect(cvss2.impact_score).toBe(6.4);
            expect(cvss2.access_vector).toBe('NETWORK');
            expect(cvss2.access_complexity).toBe('LOW');
            expect(cvss2.confidentiality_impact).toBe('PARTIAL');
            expect(cvss2.availability_impact).toBe('PARTIAL');
            expect(cvss2.integrity_impact).toBe('PARTIAL');
            expect(cvss2.authentication).toBe('NONE');
        });

        it('should accept CVSS2 objects with optional user_interaction_required', () => {
            const cvss2WithInteraction: CVSS2 = {
                base_score: 4.3,
                exploitability_score: 8.6,
                impact_score: 2.9,
                access_vector: 'NETWORK',
                access_complexity: 'MEDIUM',
                confidentiality_impact: 'NONE',
                availability_impact: 'NONE',
                integrity_impact: 'PARTIAL',
                authentication: 'NONE',
                user_interaction_required: true
            };

            expect(cvss2WithInteraction.user_interaction_required).toBe(true);
            expect(cvss2WithInteraction.base_score).toBe(4.3);
        });

        it('should accept CVSS2 objects without optional user_interaction_required', () => {
            const cvss2WithoutInteraction: CVSS2 = {
                base_score: 10.0,
                exploitability_score: 10.0,
                impact_score: 10.0,
                access_vector: 'NETWORK',
                access_complexity: 'LOW',
                confidentiality_impact: 'COMPLETE',
                availability_impact: 'COMPLETE',
                integrity_impact: 'COMPLETE',
                authentication: 'NONE'
            };

            expect(cvss2WithoutInteraction.user_interaction_required).toBeUndefined();
            expect(cvss2WithoutInteraction.base_score).toBe(10.0);
        });

        it('should handle different access vector values', () => {
            const networkVector: CVSS2 = {
                base_score: 7.5,
                exploitability_score: 10.0,
                impact_score: 6.4,
                access_vector: 'NETWORK',
                access_complexity: 'LOW',
                confidentiality_impact: 'PARTIAL',
                availability_impact: 'PARTIAL',
                integrity_impact: 'PARTIAL',
                authentication: 'NONE'
            };

            const localVector: CVSS2 = {
                ...networkVector,
                access_vector: 'LOCAL',
                base_score: 4.6,
                exploitability_score: 3.9
            };

            expect(networkVector.access_vector).toBe('NETWORK');
            expect(localVector.access_vector).toBe('LOCAL');
        });

        it('should handle different impact levels', () => {
            const highImpact: CVSS2 = {
                base_score: 10.0,
                exploitability_score: 10.0,
                impact_score: 10.0,
                access_vector: 'NETWORK',
                access_complexity: 'LOW',
                confidentiality_impact: 'COMPLETE',
                availability_impact: 'COMPLETE',
                integrity_impact: 'COMPLETE',
                authentication: 'NONE'
            };

            const lowImpact: CVSS2 = {
                base_score: 5.0,
                exploitability_score: 10.0,
                impact_score: 2.9,
                access_vector: 'NETWORK',
                access_complexity: 'LOW',
                confidentiality_impact: 'NONE',
                availability_impact: 'NONE',
                integrity_impact: 'PARTIAL',
                authentication: 'NONE'
            };

            expect(highImpact.confidentiality_impact).toBe('COMPLETE');
            expect(lowImpact.confidentiality_impact).toBe('NONE');
        });
    });

    describe('CVSS3', () => {
        it('should accept valid CVSS3 objects with all required properties', () => {
            const cvss3: CVSS3 = {
                base_score: 8.8,
                exploitability_score: 2.8,
                impact_score: 5.9,
                attack_vector: 'NETWORK',
                attack_complexity: 'LOW',
                confidentiality_impact: 'HIGH',
                availability_impact: 'HIGH',
                integrity_impact: 'HIGH',
                user_interaction: 'NONE',
                scope: 'UNCHANGED',
                privileges_required: 'NONE'
            };

            expect(cvss3.base_score).toBe(8.8);
            expect(cvss3.exploitability_score).toBe(2.8);
            expect(cvss3.impact_score).toBe(5.9);
            expect(cvss3.attack_vector).toBe('NETWORK');
            expect(cvss3.attack_complexity).toBe('LOW');
            expect(cvss3.confidentiality_impact).toBe('HIGH');
            expect(cvss3.availability_impact).toBe('HIGH');
            expect(cvss3.integrity_impact).toBe('HIGH');
            expect(cvss3.user_interaction).toBe('NONE');
            expect(cvss3.scope).toBe('UNCHANGED');
            expect(cvss3.privileges_required).toBe('NONE');
        });

        it('should handle different attack vectors', () => {
            const networkVector: CVSS3 = {
                base_score: 8.8,
                exploitability_score: 2.8,
                impact_score: 5.9,
                attack_vector: 'NETWORK',
                attack_complexity: 'LOW',
                confidentiality_impact: 'HIGH',
                availability_impact: 'HIGH',
                integrity_impact: 'HIGH',
                user_interaction: 'NONE',
                scope: 'UNCHANGED',
                privileges_required: 'NONE'
            };

            const physicalVector: CVSS3 = {
                ...networkVector,
                attack_vector: 'PHYSICAL',
                base_score: 6.8,
                exploitability_score: 0.9
            };

            expect(networkVector.attack_vector).toBe('NETWORK');
            expect(physicalVector.attack_vector).toBe('PHYSICAL');
        });

        it('should handle different scope values', () => {
            const unchangedScope: CVSS3 = {
                base_score: 8.8,
                exploitability_score: 2.8,
                impact_score: 5.9,
                attack_vector: 'NETWORK',
                attack_complexity: 'LOW',
                confidentiality_impact: 'HIGH',
                availability_impact: 'HIGH',
                integrity_impact: 'HIGH',
                user_interaction: 'NONE',
                scope: 'UNCHANGED',
                privileges_required: 'NONE'
            };

            const changedScope: CVSS3 = {
                ...unchangedScope,
                scope: 'CHANGED',
                base_score: 9.8,
                impact_score: 6.0
            };

            expect(unchangedScope.scope).toBe('UNCHANGED');
            expect(changedScope.scope).toBe('CHANGED');
        });

        it('should handle user interaction requirements', () => {
            const noInteraction: CVSS3 = {
                base_score: 8.8,
                exploitability_score: 2.8,
                impact_score: 5.9,
                attack_vector: 'NETWORK',
                attack_complexity: 'LOW',
                confidentiality_impact: 'HIGH',
                availability_impact: 'HIGH',
                integrity_impact: 'HIGH',
                user_interaction: 'NONE',
                scope: 'UNCHANGED',
                privileges_required: 'NONE'
            };

            const requiresInteraction: CVSS3 = {
                ...noInteraction,
                user_interaction: 'REQUIRED',
                base_score: 8.1,
                exploitability_score: 2.3
            };

            expect(noInteraction.user_interaction).toBe('NONE');
            expect(requiresInteraction.user_interaction).toBe('REQUIRED');
        });
    });

    describe('CVSS31', () => {
        it('should accept valid CVSS31 objects with all required properties', () => {
            const cvss31: CVSS31 = {
                base_score: 9.8,
                exploitability_score: 3.9,
                impact_score: 5.9,
                attack_vector: 'NETWORK',
                attack_complexity: 'LOW',
                confidentiality_impact: 'HIGH',
                availability_impact: 'HIGH',
                integrity_impact: 'HIGH',
                user_interaction: 'NONE',
                scope: 'UNCHANGED',
                privileges_required: 'NONE'
            };

            expect(cvss31.base_score).toBe(9.8);
            expect(cvss31.exploitability_score).toBe(3.9);
            expect(cvss31.impact_score).toBe(5.9);
            expect(cvss31.attack_vector).toBe('NETWORK');
            expect(cvss31.attack_complexity).toBe('LOW');
            expect(cvss31.confidentiality_impact).toBe('HIGH');
            expect(cvss31.availability_impact).toBe('HIGH');
            expect(cvss31.integrity_impact).toBe('HIGH');
            expect(cvss31.user_interaction).toBe('NONE');
            expect(cvss31.scope).toBe('UNCHANGED');
            expect(cvss31.privileges_required).toBe('NONE');
        });

        it('should handle privilege requirements', () => {
            const noPrivileges: CVSS31 = {
                base_score: 9.8,
                exploitability_score: 3.9,
                impact_score: 5.9,
                attack_vector: 'NETWORK',
                attack_complexity: 'LOW',
                confidentiality_impact: 'HIGH',
                availability_impact: 'HIGH',
                integrity_impact: 'HIGH',
                user_interaction: 'NONE',
                scope: 'UNCHANGED',
                privileges_required: 'NONE'
            };

            const lowPrivileges: CVSS31 = {
                ...noPrivileges,
                privileges_required: 'LOW',
                base_score: 8.8,
                exploitability_score: 2.8
            };

            const highPrivileges: CVSS31 = {
                ...noPrivileges,
                privileges_required: 'HIGH',
                base_score: 7.2,
                exploitability_score: 1.2
            };

            expect(noPrivileges.privileges_required).toBe('NONE');
            expect(lowPrivileges.privileges_required).toBe('LOW');
            expect(highPrivileges.privileges_required).toBe('HIGH');
        });

        it('should handle different attack complexity levels', () => {
            const lowComplexity: CVSS31 = {
                base_score: 9.8,
                exploitability_score: 3.9,
                impact_score: 5.9,
                attack_vector: 'NETWORK',
                attack_complexity: 'LOW',
                confidentiality_impact: 'HIGH',
                availability_impact: 'HIGH',
                integrity_impact: 'HIGH',
                user_interaction: 'NONE',
                scope: 'UNCHANGED',
                privileges_required: 'NONE'
            };

            const highComplexity: CVSS31 = {
                ...lowComplexity,
                attack_complexity: 'HIGH',
                base_score: 8.1,
                exploitability_score: 1.6
            };

            expect(lowComplexity.attack_complexity).toBe('LOW');
            expect(highComplexity.attack_complexity).toBe('HIGH');
        });

        it('should handle zero impact scenarios', () => {
            const noImpact: CVSS31 = {
                base_score: 0.0,
                exploitability_score: 3.9,
                impact_score: 0.0,
                attack_vector: 'NETWORK',
                attack_complexity: 'LOW',
                confidentiality_impact: 'NONE',
                availability_impact: 'NONE',
                integrity_impact: 'NONE',
                user_interaction: 'NONE',
                scope: 'UNCHANGED',
                privileges_required: 'NONE'
            };

            expect(noImpact.base_score).toBe(0.0);
            expect(noImpact.impact_score).toBe(0.0);
            expect(noImpact.confidentiality_impact).toBe('NONE');
            expect(noImpact.availability_impact).toBe('NONE');
            expect(noImpact.integrity_impact).toBe('NONE');
        });
    });

    describe('Type compatibility and edge cases', () => {
        it('should handle decimal scores correctly', () => {
            const cvss31: CVSS31 = {
                base_score: 7.3,
                exploitability_score: 2.77,
                impact_score: 4.1,
                attack_vector: 'NETWORK',
                attack_complexity: 'LOW',
                confidentiality_impact: 'HIGH',
                availability_impact: 'NONE',
                integrity_impact: 'NONE',
                user_interaction: 'NONE',
                scope: 'UNCHANGED',
                privileges_required: 'NONE'
            };

            expect(cvss31.base_score).toBe(7.3);
            expect(cvss31.exploitability_score).toBe(2.77);
            expect(cvss31.impact_score).toBe(4.1);
        });

        it('should handle maximum score values', () => {
            const maxScore: CVSS31 = {
                base_score: 10.0,
                exploitability_score: 3.9,
                impact_score: 6.0,
                attack_vector: 'NETWORK',
                attack_complexity: 'LOW',
                confidentiality_impact: 'HIGH',
                availability_impact: 'HIGH',
                integrity_impact: 'HIGH',
                user_interaction: 'NONE',
                scope: 'CHANGED',
                privileges_required: 'NONE'
            };

            expect(maxScore.base_score).toBe(10.0);
            expect(maxScore.scope).toBe('CHANGED');
        });

        it('should handle minimum score values', () => {
            const minScore: CVSS2 = {
                base_score: 0.0,
                exploitability_score: 0.0,
                impact_score: 0.0,
                access_vector: 'LOCAL',
                access_complexity: 'HIGH',
                confidentiality_impact: 'NONE',
                availability_impact: 'NONE',
                integrity_impact: 'NONE',
                authentication: 'MULTIPLE'
            };

            expect(minScore.base_score).toBe(0.0);
            expect(minScore.exploitability_score).toBe(0.0);
            expect(minScore.impact_score).toBe(0.0);
        });

        it('should handle string values with different cases', () => {
            const mixedCase: CVSS3 = {
                base_score: 7.5,
                exploitability_score: 2.8,
                impact_score: 5.9,
                attack_vector: 'network',
                attack_complexity: 'low',
                confidentiality_impact: 'high',
                availability_impact: 'HIGH',
                integrity_impact: 'High',
                user_interaction: 'none',
                scope: 'unchanged',
                privileges_required: 'NONE'
            };

            expect(mixedCase.attack_vector).toBe('network');
            expect(mixedCase.attack_complexity).toBe('low');
            expect(mixedCase.confidentiality_impact).toBe('high');
            expect(mixedCase.availability_impact).toBe('HIGH');
            expect(mixedCase.integrity_impact).toBe('High');
        });
    });

    describe('Real-world CVSS examples', () => {
        it('should handle CVE-2021-44228 (Log4Shell) CVSS 3.1 score', () => {
            const log4shell: CVSS31 = {
                base_score: 10.0,
                exploitability_score: 3.9,
                impact_score: 6.0,
                attack_vector: 'NETWORK',
                attack_complexity: 'LOW',
                confidentiality_impact: 'HIGH',
                availability_impact: 'HIGH',
                integrity_impact: 'HIGH',
                user_interaction: 'NONE',
                scope: 'CHANGED',
                privileges_required: 'NONE'
            };

            expect(log4shell.base_score).toBe(10.0);
            expect(log4shell.scope).toBe('CHANGED');
        });

        it('should handle a medium severity CVSS 2.0 score', () => {
            const mediumSeverity: CVSS2 = {
                base_score: 4.3,
                exploitability_score: 8.6,
                impact_score: 2.9,
                access_vector: 'NETWORK',
                access_complexity: 'MEDIUM',
                confidentiality_impact: 'NONE',
                availability_impact: 'NONE',
                integrity_impact: 'PARTIAL',
                authentication: 'NONE',
                user_interaction_required: false
            };

            expect(mediumSeverity.base_score).toBe(4.3);
            expect(mediumSeverity.user_interaction_required).toBe(false);
        });

        it('should handle a local privilege escalation CVSS 3.1 score', () => {
            const localPrivEsc: CVSS31 = {
                base_score: 7.8,
                exploitability_score: 1.8,
                impact_score: 5.9,
                attack_vector: 'LOCAL',
                attack_complexity: 'LOW',
                confidentiality_impact: 'HIGH',
                availability_impact: 'HIGH',
                integrity_impact: 'HIGH',
                user_interaction: 'NONE',
                scope: 'UNCHANGED',
                privileges_required: 'LOW'
            };

            expect(localPrivEsc.base_score).toBe(7.8);
            expect(localPrivEsc.attack_vector).toBe('LOCAL');
            expect(localPrivEsc.privileges_required).toBe('LOW');
        });
    });
});
