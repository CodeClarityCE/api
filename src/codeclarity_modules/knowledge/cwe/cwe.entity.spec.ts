import { CWE } from './cwe.entity';

describe('CWE Entity', () => {
    describe('Entity instantiation', () => {
        it('should create a CWE instance with all properties', () => {
            const cwe = new CWE();

            expect(cwe).toBeDefined();
            expect(cwe).toBeInstanceOf(CWE);
        });

        it('should allow property assignment without errors', () => {
            const cwe = new CWE();

            cwe.id = 'test-id';
            cwe.cwe_id = 'CWE-123';
            cwe.name = 'Test CWE';

            expect(cwe.id).toBe('test-id');
            expect(cwe.cwe_id).toBe('CWE-123');
            expect(cwe.name).toBe('Test CWE');
        });
    });

    describe('Property assignment', () => {
        it('should accept valid string properties', () => {
            const cwe = new CWE();

            cwe.id = 'uuid-123';
            cwe.cwe_id = 'CWE-79';
            cwe.name = 'Cross-site Scripting';
            cwe.abstraction = 'Base';
            cwe.structure = 'Simple';
            cwe.status = 'Stable';
            cwe.description = 'Improper neutralization of input during web page generation';
            cwe.extended_description =
                'The software does not neutralize or incorrectly neutralizes user-controllable input before it is placed in output that is used as a web page that is served to other users.';
            cwe.likelihood_of_exploit = 'High';

            expect(cwe.id).toBe('uuid-123');
            expect(cwe.cwe_id).toBe('CWE-79');
            expect(cwe.name).toBe('Cross-site Scripting');
            expect(cwe.abstraction).toBe('Base');
            expect(cwe.structure).toBe('Simple');
            expect(cwe.status).toBe('Stable');
            expect(cwe.description).toBe(
                'Improper neutralization of input during web page generation'
            );
            expect(cwe.extended_description).toBe(
                'The software does not neutralize or incorrectly neutralizes user-controllable input before it is placed in output that is used as a web page that is served to other users.'
            );
            expect(cwe.likelihood_of_exploit).toBe('High');
        });

        it('should accept null values for nullable properties', () => {
            const cwe = new CWE();

            (cwe as any).name = null;
            (cwe as any).abstraction = null;
            (cwe as any).structure = null;
            (cwe as any).status = null;
            (cwe as any).description = null;
            (cwe as any).extended_description = null;
            (cwe as any).likelihood_of_exploit = null;

            expect(cwe.name).toBeNull();
            expect(cwe.abstraction).toBeNull();
            expect(cwe.structure).toBeNull();
            expect(cwe.status).toBeNull();
            expect(cwe.description).toBeNull();
            expect(cwe.extended_description).toBeNull();
            expect(cwe.likelihood_of_exploit).toBeNull();
        });

        it('should accept complex JSONB objects for jsonb properties', () => {
            const cwe = new CWE();

            const relatedWeaknesses = [{ nature: 'ChildOf', cwe_id: 'CWE-20', view_id: '1000' }];

            const modesOfIntroduction = [
                { phase: 'Implementation', note: 'Failure to validate input' }
            ];

            const commonConsequences = [
                {
                    scope: ['Confidentiality', 'Integrity', 'Availability'],
                    impact: [
                        'Read Application Data',
                        'Modify Application Data',
                        'Execute Unauthorized Code or Commands'
                    ],
                    note: 'The most common attack performed with cross-site scripting involves the disclosure of information stored in user cookies.'
                }
            ];

            const detectionMethods = [
                {
                    method: 'Automated Static Analysis',
                    description:
                        'Use automated static analysis tools that target this type of weakness.'
                }
            ];

            const potentialMitigations = [
                {
                    phase: 'Implementation',
                    description:
                        'Use a vetted library or framework that does not allow this weakness to occur or provides constructs that make this weakness easier to avoid.'
                }
            ];

            cwe.related_weaknesses = relatedWeaknesses;
            cwe.modes_of_introduction = modesOfIntroduction;
            cwe.common_consequences = commonConsequences;
            cwe.detection_methods = detectionMethods;
            cwe.potential_mitigations = potentialMitigations;

            expect(cwe.related_weaknesses).toEqual(relatedWeaknesses);
            expect(cwe.modes_of_introduction).toEqual(modesOfIntroduction);
            expect(cwe.common_consequences).toEqual(commonConsequences);
            expect(cwe.detection_methods).toEqual(detectionMethods);
            expect(cwe.potential_mitigations).toEqual(potentialMitigations);
        });

        it('should accept null values for JSONB properties', () => {
            const cwe = new CWE();

            cwe.related_weaknesses = null;
            cwe.modes_of_introduction = null;
            cwe.common_consequences = null;
            cwe.detection_methods = null;
            cwe.potential_mitigations = null;
            cwe.taxonomy_mappings = null;
            cwe.observed_examples = null;
            cwe.alternate_terms = null;
            cwe.affected_resources = null;
            cwe.functional_areas = null;
            cwe.categories = null;
            cwe.applicable_platforms = null;

            expect(cwe.related_weaknesses).toBeNull();
            expect(cwe.modes_of_introduction).toBeNull();
            expect(cwe.common_consequences).toBeNull();
            expect(cwe.detection_methods).toBeNull();
            expect(cwe.potential_mitigations).toBeNull();
            expect(cwe.taxonomy_mappings).toBeNull();
            expect(cwe.observed_examples).toBeNull();
            expect(cwe.alternate_terms).toBeNull();
            expect(cwe.affected_resources).toBeNull();
            expect(cwe.functional_areas).toBeNull();
            expect(cwe.categories).toBeNull();
            expect(cwe.applicable_platforms).toBeNull();
        });
    });

    describe('Real-world CWE data examples', () => {
        it('should handle CWE-79 (Cross-site Scripting) data structure', () => {
            const cwe = new CWE();

            cwe.cwe_id = 'CWE-79';
            cwe.name = 'Cross-site Scripting';
            cwe.abstraction = 'Base';
            cwe.structure = 'Simple';
            cwe.status = 'Stable';
            cwe.description =
                'Improper Neutralization of Input During Web Page Generation (Cross-site Scripting)';

            cwe.related_weaknesses = [
                { nature: 'ChildOf', cwe_id: 'CWE-20', view_id: '1000' },
                { nature: 'ChildOf', cwe_id: 'CWE-20', view_id: '699' }
            ];

            cwe.common_consequences = [
                {
                    scope: ['Confidentiality', 'Integrity', 'Availability'],
                    impact: [
                        'Read Application Data',
                        'Modify Application Data',
                        'Execute Unauthorized Code or Commands'
                    ]
                }
            ];

            cwe.applicable_platforms = {
                languages: [
                    { name: 'JavaScript', prevalence: 'Often' },
                    { name: 'PHP', prevalence: 'Often' },
                    { name: 'ASP.NET', prevalence: 'Often' }
                ],
                technologies: [{ name: 'Web Server', prevalence: 'Often' }]
            };

            expect(cwe.cwe_id).toBe('CWE-79');
            expect(cwe.name).toBe('Cross-site Scripting');
            expect(cwe.related_weaknesses).toHaveLength(2);
            expect(cwe.common_consequences).toHaveLength(1);
            expect(cwe.applicable_platforms.languages).toHaveLength(3);
            expect(cwe.applicable_platforms.technologies).toHaveLength(1);
        });

        it('should handle CWE-89 (SQL Injection) data structure', () => {
            const cwe = new CWE();

            cwe.cwe_id = 'CWE-89';
            cwe.name = 'SQL Injection';
            cwe.abstraction = 'Base';
            cwe.structure = 'Simple';
            cwe.status = 'Stable';
            cwe.likelihood_of_exploit = 'High';

            cwe.modes_of_introduction = [
                {
                    phase: 'Implementation',
                    note: 'REALIZATION: This weakness is caused during implementation of an architectural security tactic.'
                }
            ];

            cwe.observed_examples = [
                {
                    reference: 'CVE-2008-2790',
                    description: 'SQL injection through an ID parameter.',
                    link: 'https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2008-2790'
                },
                {
                    reference: 'CVE-2008-2665',
                    description: 'SQL injection in library intended for database authentication.',
                    link: 'https://cve.mitre.org/cgi-bin/cvename.cgi?name=CVE-2008-2665'
                }
            ];

            expect(cwe.cwe_id).toBe('CWE-89');
            expect(cwe.name).toBe('SQL Injection');
            expect(cwe.likelihood_of_exploit).toBe('High');
            expect(cwe.modes_of_introduction).toHaveLength(1);
            expect(cwe.observed_examples).toHaveLength(2);
            expect(cwe.observed_examples[0].reference).toBe('CVE-2008-2790');
        });

        it('should handle empty arrays and objects in JSONB fields', () => {
            const cwe = new CWE();

            cwe.cwe_id = 'CWE-1000';
            cwe.related_weaknesses = [];
            cwe.modes_of_introduction = [];
            cwe.common_consequences = [];
            cwe.applicable_platforms = {};
            cwe.taxonomy_mappings = {};

            expect(cwe.related_weaknesses).toEqual([]);
            expect(cwe.modes_of_introduction).toEqual([]);
            expect(cwe.common_consequences).toEqual([]);
            expect(cwe.applicable_platforms).toEqual({});
            expect(cwe.taxonomy_mappings).toEqual({});
        });
    });

    describe('Edge cases and validation', () => {
        it('should handle very long description texts', () => {
            const cwe = new CWE();
            const longDescription = 'A'.repeat(10000);

            cwe.description = longDescription;
            cwe.extended_description = longDescription;

            expect(cwe.description).toBe(longDescription);
            expect(cwe.extended_description).toBe(longDescription);
            expect(cwe.description.length).toBe(10000);
        });

        it('should handle special characters in text fields', () => {
            const cwe = new CWE();
            const specialText = 'Test with special chars: <>&"\'`\n\t\r';

            cwe.name = specialText;
            cwe.description = specialText;

            expect(cwe.name).toBe(specialText);
            expect(cwe.description).toBe(specialText);
        });

        it('should handle deeply nested JSONB objects', () => {
            const cwe = new CWE();
            const deepObject = {
                level1: {
                    level2: {
                        level3: {
                            data: 'deep nested value',
                            array: [1, 2, 3],
                            nested_array: [
                                { id: 1, name: 'item1' },
                                { id: 2, name: 'item2' }
                            ]
                        }
                    }
                }
            };

            cwe.taxonomy_mappings = deepObject;

            expect(cwe.taxonomy_mappings).toEqual(deepObject);
            expect(cwe.taxonomy_mappings.level1.level2.level3.data).toBe('deep nested value');
            expect(cwe.taxonomy_mappings.level1.level2.level3.nested_array).toHaveLength(2);
        });
    });
});
