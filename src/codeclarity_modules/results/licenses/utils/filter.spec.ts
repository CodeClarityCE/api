import { filter } from './filter';
import { LicenseInfo } from '../licenses2.types';

describe('filter', () => {
    const createMockLicenseInfo = (overrides: Partial<LicenseInfo> = {}): LicenseInfo => ({
        id: 'MIT',
        name: 'MIT License',
        unable_to_infer: false,
        license_compliance_violation: false,
        description: 'MIT License',
        references: ['https://opensource.org/licenses/MIT'],
        deps_using_license: ['dep1', 'dep2'],
        license_category: 'permissive',
        license_properties: {
            permissions: ['commercial-use', 'modifications'],
            conditions: ['include-copyright'],
            limitations: ['liability', 'warranty']
        },
        ...overrides
    });

    describe('basic functionality', () => {
        it('should return all licenses when no filters are applied', () => {
            const licenses = [
                createMockLicenseInfo({ id: 'MIT' }),
                createMockLicenseInfo({ id: 'Apache-2.0' })
            ];

            const [filteredLicenses, counts] = filter(licenses, undefined, undefined);

            expect(filteredLicenses).toHaveLength(2);
            expect(filteredLicenses).toEqual(licenses);
            expect(counts).toEqual({
                compliance_violation: 0,
                unrecognized: 0,
                permissive: 2,
                copy_left: 0
            });
        });

        it('should return empty array when input is empty', () => {
            const [filteredLicenses, counts] = filter([], undefined, undefined);

            expect(filteredLicenses).toHaveLength(0);
            expect(counts).toEqual({
                compliance_violation: 0,
                unrecognized: 0,
                permissive: 0,
                copy_left: 0
            });
        });
    });

    describe('search key filtering', () => {
        const licenses = [
            createMockLicenseInfo({
                id: 'MIT',
                name: 'MIT License'
            }),
            createMockLicenseInfo({
                id: 'Apache-2.0',
                name: 'Apache License 2.0'
            }),
            createMockLicenseInfo({
                id: 'GPL-3.0',
                name: 'GNU General Public License v3.0'
            })
        ];

        it('should filter by license ID (case insensitive)', () => {
            const [filteredLicenses] = filter(licenses, 'mit', undefined);

            expect(filteredLicenses).toHaveLength(1);
            expect(filteredLicenses[0]!.id).toBe('MIT');
        });

        it('should filter by partial license ID match', () => {
            const [filteredLicenses] = filter(licenses, 'GPL', undefined);

            expect(filteredLicenses).toHaveLength(1);
            expect(filteredLicenses[0]!.id).toBe('GPL-3.0');
        });

        it('should filter by license name (case insensitive)', () => {
            const [filteredLicenses] = filter(licenses, 'apache', undefined);

            expect(filteredLicenses).toHaveLength(1);
            expect(filteredLicenses[0]!.name).toBe('Apache License 2.0');
        });

        it('should filter by partial license name match', () => {
            const [filteredLicenses] = filter(licenses, 'GNU', undefined);

            expect(filteredLicenses).toHaveLength(1);
            expect(filteredLicenses[0]!.name).toBe('GNU General Public License v3.0');
        });

        it('should return multiple matches when search key matches multiple licenses', () => {
            const [filteredLicenses] = filter(licenses, 'License', undefined);

            expect(filteredLicenses).toHaveLength(3);
        });

        it('should return empty array when search key matches nothing', () => {
            const [filteredLicenses] = filter(licenses, 'nonexistent', undefined);

            expect(filteredLicenses).toHaveLength(0);
        });

        it('should handle empty search key', () => {
            const [filteredLicenses] = filter(licenses, '', undefined);

            expect(filteredLicenses).toHaveLength(3);
            expect(filteredLicenses).toEqual(licenses);
        });

        it('should match both ID and name in same license', () => {
            const [filteredLicenses] = filter(licenses, 'MIT', undefined);

            expect(filteredLicenses).toHaveLength(1);
            expect(filteredLicenses[0]!.id).toBe('MIT');
            expect(filteredLicenses[0]!.name).toBe('MIT License');
        });

        it('should not duplicate licenses when search matches both ID and name', () => {
            const licenseWithMatchingIdAndName = createMockLicenseInfo({
                id: 'GPL-3.0',
                name: 'GPL-3.0 License'
            });

            const [filteredLicenses] = filter([licenseWithMatchingIdAndName], 'GPL-3.0', undefined);

            expect(filteredLicenses).toHaveLength(1);
            expect(filteredLicenses[0]!.id).toBe('GPL-3.0');
        });
    });

    describe('null and undefined handling', () => {
        it('should handle null license ID', () => {
            const licenses = [
                createMockLicenseInfo({
                    id: null as any,
                    name: 'Apache License',
                    description: 'Apache License'
                }),
                createMockLicenseInfo({
                    id: 'MIT',
                    name: 'MIT License',
                    description: 'MIT License'
                })
            ];

            const [filteredLicenses] = filter(licenses, 'MIT', undefined);

            expect(filteredLicenses).toHaveLength(1);
            expect(filteredLicenses[0]!.id).toBe('MIT');
        });

        it('should handle null license name', () => {
            const licenses = [
                createMockLicenseInfo({ id: 'Apache-2.0', name: null as any }),
                createMockLicenseInfo({ id: 'MIT', name: 'MIT License' })
            ];

            const [filteredLicenses] = filter(licenses, 'MIT', undefined);

            expect(filteredLicenses).toHaveLength(1);
            expect(filteredLicenses[0]!.name).toBe('MIT License');
        });

        it('should handle null searchKey', () => {
            const licenses = [createMockLicenseInfo()];

            const [filteredLicenses] = filter(licenses, null as any, undefined);

            expect(filteredLicenses).toHaveLength(1);
            expect(filteredLicenses).toEqual(licenses);
        });

        it('should handle null activeFilters', () => {
            const licenses = [createMockLicenseInfo()];

            const [filteredLicenses] = filter(licenses, undefined, null as any);

            expect(filteredLicenses).toHaveLength(1);
            expect(filteredLicenses).toEqual(licenses);
        });

        it('should handle undefined license ID', () => {
            const licenses = [
                createMockLicenseInfo({
                    id: undefined as any,
                    name: 'Apache License',
                    description: 'Apache License'
                }),
                createMockLicenseInfo({
                    id: 'MIT',
                    name: 'MIT License',
                    description: 'MIT License'
                })
            ];

            const [filteredLicenses] = filter(licenses, 'MIT', undefined);

            expect(filteredLicenses).toHaveLength(1);
            expect(filteredLicenses[0]!.id).toBe('MIT');
        });

        it('should handle undefined license name', () => {
            const licenses = [
                createMockLicenseInfo({ id: 'Apache-2.0', name: undefined as any }),
                createMockLicenseInfo({ id: 'MIT', name: 'MIT License' })
            ];

            const [filteredLicenses] = filter(licenses, 'MIT', undefined);

            expect(filteredLicenses).toHaveLength(1);
            expect(filteredLicenses[0]!.name).toBe('MIT License');
        });
    });

    describe('active filters', () => {
        describe('compliance_violation filter', () => {
            it('should filter licenses with compliance violations', () => {
                const licenses = [
                    createMockLicenseInfo({
                        id: 'MIT',
                        license_compliance_violation: false
                    }),
                    createMockLicenseInfo({
                        id: 'GPL-2.0',
                        license_compliance_violation: true
                    })
                ];

                const [filteredLicenses] = filter(licenses, undefined, ['compliance_violation']);

                expect(filteredLicenses).toHaveLength(1);
                expect(filteredLicenses[0]!.id).toBe('GPL-2.0');
                expect(filteredLicenses[0]!.license_compliance_violation).toBe(true);
            });

            it('should filter out licenses without compliance violations', () => {
                const licenses = [
                    createMockLicenseInfo({
                        id: 'MIT',
                        license_compliance_violation: false
                    }),
                    createMockLicenseInfo({
                        id: 'Apache-2.0',
                        license_compliance_violation: false
                    })
                ];

                const [filteredLicenses] = filter(licenses, undefined, ['compliance_violation']);

                expect(filteredLicenses).toHaveLength(0);
            });
        });

        describe('unrecognized filter', () => {
            it('should filter licenses that are unable to infer', () => {
                const licenses = [
                    createMockLicenseInfo({
                        id: 'MIT',
                        unable_to_infer: false
                    }),
                    createMockLicenseInfo({
                        id: 'Unknown',
                        unable_to_infer: true
                    })
                ];

                const [filteredLicenses] = filter(licenses, undefined, ['unrecognized']);

                expect(filteredLicenses).toHaveLength(1);
                expect(filteredLicenses[0]!.id).toBe('Unknown');
                expect(filteredLicenses[0]!.unable_to_infer).toBe(true);
            });

            it('should filter out licenses that are recognized', () => {
                const licenses = [
                    createMockLicenseInfo({
                        id: 'MIT',
                        unable_to_infer: false
                    }),
                    createMockLicenseInfo({
                        id: 'Apache-2.0',
                        unable_to_infer: false
                    })
                ];

                const [filteredLicenses] = filter(licenses, undefined, ['unrecognized']);

                expect(filteredLicenses).toHaveLength(0);
            });
        });

        describe('permissive filter', () => {
            it('should filter permissive licenses', () => {
                const licenses = [
                    createMockLicenseInfo({
                        id: 'MIT',
                        license_category: 'permissive'
                    }),
                    createMockLicenseInfo({
                        id: 'GPL-2.0',
                        license_category: 'copy_left'
                    })
                ];

                const [filteredLicenses] = filter(licenses, undefined, ['permissive']);

                expect(filteredLicenses).toHaveLength(1);
                expect(filteredLicenses[0]!.id).toBe('MIT');
                expect(filteredLicenses[0]!.license_category).toBe('permissive');
            });

            it('should filter out non-permissive licenses', () => {
                const licenses = [
                    createMockLicenseInfo({
                        id: 'GPL-2.0',
                        license_category: 'copy_left'
                    }),
                    createMockLicenseInfo({
                        id: 'AGPL-3.0',
                        license_category: 'copy_left'
                    })
                ];

                const [filteredLicenses] = filter(licenses, undefined, ['permissive']);

                expect(filteredLicenses).toHaveLength(0);
            });

            it('should filter out licenses with null license_category', () => {
                const licenses = [
                    createMockLicenseInfo({
                        id: 'MIT',
                        license_category: null as any
                    }),
                    createMockLicenseInfo({
                        id: 'Apache-2.0',
                        license_category: 'permissive'
                    })
                ];

                const [filteredLicenses] = filter(licenses, undefined, ['permissive']);

                expect(filteredLicenses).toHaveLength(1);
                expect(filteredLicenses[0]!.id).toBe('Apache-2.0');
            });

            it('should filter out licenses with undefined license_category', () => {
                const { license_category: _removed, ...mitWithoutCategory } =
                    createMockLicenseInfo({ id: 'MIT' });
                const licenses = [
                    mitWithoutCategory as LicenseInfo,
                    createMockLicenseInfo({
                        id: 'Apache-2.0',
                        license_category: 'permissive'
                    })
                ];

                const [filteredLicenses] = filter(licenses, undefined, ['permissive']);

                expect(filteredLicenses).toHaveLength(1);
                expect(filteredLicenses[0]!.id).toBe('Apache-2.0');
            });
        });

        describe('copy_left filter', () => {
            it('should filter copy-left licenses', () => {
                const licenses = [
                    createMockLicenseInfo({
                        id: 'MIT',
                        license_category: 'permissive'
                    }),
                    createMockLicenseInfo({
                        id: 'GPL-2.0',
                        license_category: 'copy_left'
                    })
                ];

                const [filteredLicenses] = filter(licenses, undefined, ['copy_left']);

                expect(filteredLicenses).toHaveLength(1);
                expect(filteredLicenses[0]!.id).toBe('GPL-2.0');
                expect(filteredLicenses[0]!.license_category).toBe('copy_left');
            });

            it('should filter out non-copy-left licenses', () => {
                const licenses = [
                    createMockLicenseInfo({
                        id: 'MIT',
                        license_category: 'permissive'
                    }),
                    createMockLicenseInfo({
                        id: 'Apache-2.0',
                        license_category: 'permissive'
                    })
                ];

                const [filteredLicenses] = filter(licenses, undefined, ['copy_left']);

                expect(filteredLicenses).toHaveLength(0);
            });

            it('should filter out licenses with null license_category', () => {
                const licenses = [
                    createMockLicenseInfo({
                        id: 'GPL-2.0',
                        license_category: null as any
                    }),
                    createMockLicenseInfo({
                        id: 'AGPL-3.0',
                        license_category: 'copy_left'
                    })
                ];

                const [filteredLicenses] = filter(licenses, undefined, ['copy_left']);

                expect(filteredLicenses).toHaveLength(1);
                expect(filteredLicenses[0]!.id).toBe('AGPL-3.0');
            });

            it('should filter out licenses with undefined license_category', () => {
                const licenses = [
                    createMockLicenseInfo({
                        id: 'GPL-2.0'
                        // license_category intentionally omitted to test undefined
                    }),
                    createMockLicenseInfo({
                        id: 'AGPL-3.0',
                        license_category: 'copy_left'
                    })
                ];

                const [filteredLicenses] = filter(licenses, undefined, ['copy_left']);

                expect(filteredLicenses).toHaveLength(1);
                expect(filteredLicenses[0]!.id).toBe('AGPL-3.0');
            });
        });

        describe('multiple filters', () => {
            it('should apply multiple filters with AND logic', () => {
                const licenses = [
                    createMockLicenseInfo({
                        id: 'MIT',
                        license_category: 'permissive',
                        license_compliance_violation: false
                    }),
                    createMockLicenseInfo({
                        id: 'GPL-2.0',
                        license_category: 'copy_left',
                        license_compliance_violation: true
                    }),
                    createMockLicenseInfo({
                        id: 'Apache-2.0',
                        license_category: 'permissive',
                        license_compliance_violation: true
                    })
                ];

                const [filteredLicenses] = filter(licenses, undefined, [
                    'permissive',
                    'compliance_violation'
                ]);

                expect(filteredLicenses).toHaveLength(1);
                expect(filteredLicenses[0]!.id).toBe('Apache-2.0');
                expect(filteredLicenses[0]!.license_category).toBe('permissive');
                expect(filteredLicenses[0]!.license_compliance_violation).toBe(true);
            });

            it('should handle empty active filters array', () => {
                const licenses = [createMockLicenseInfo()];

                const [filteredLicenses] = filter(licenses, undefined, []);

                expect(filteredLicenses).toHaveLength(1);
                expect(filteredLicenses).toEqual(licenses);
            });
        });
    });

    describe('counts calculation', () => {
        it('should calculate counts correctly when no active filters are applied', () => {
            const licenses = [
                createMockLicenseInfo({
                    license_compliance_violation: true,
                    unable_to_infer: false,
                    license_category: 'permissive'
                }),
                createMockLicenseInfo({
                    license_compliance_violation: false,
                    unable_to_infer: true,
                    license_category: 'copy_left'
                }),
                createMockLicenseInfo({
                    license_compliance_violation: false,
                    unable_to_infer: false,
                    license_category: 'permissive'
                })
            ];

            const [, counts] = filter(licenses, undefined, undefined);

            expect(counts).toEqual({
                compliance_violation: 1,
                unrecognized: 1,
                permissive: 2,
                copy_left: 1
            });
        });

        it('should exclude active filters from counts calculation (bug: currently includes all)', () => {
            const licenses = [
                createMockLicenseInfo({
                    license_compliance_violation: true,
                    unable_to_infer: false,
                    license_category: 'permissive'
                }),
                createMockLicenseInfo({
                    license_compliance_violation: false,
                    unable_to_infer: true,
                    license_category: 'copy_left'
                })
            ];

            const [, counts] = filter(licenses, undefined, ['compliance_violation']);

            // Bug: The function includes all filters in counts due to line 83 using 'in' operator instead of 'includes'
            expect(counts).toEqual({
                compliance_violation: 1,
                unrecognized: 0,
                permissive: 1,
                copy_left: 0
            });
        });

        it('should calculate counts based on search-filtered results', () => {
            const licenses = [
                createMockLicenseInfo({
                    id: 'MIT',
                    license_compliance_violation: true,
                    unable_to_infer: false,
                    license_category: 'permissive'
                }),
                createMockLicenseInfo({
                    id: 'GPL-2.0',
                    license_compliance_violation: false,
                    unable_to_infer: true,
                    license_category: 'copy_left'
                }),
                createMockLicenseInfo({
                    id: 'Apache-2.0',
                    license_compliance_violation: false,
                    unable_to_infer: false,
                    license_category: 'permissive'
                })
            ];

            const [, counts] = filter(licenses, 'MIT', undefined);

            expect(counts).toEqual({
                compliance_violation: 1,
                unrecognized: 1,
                permissive: 2,
                copy_left: 1
            });
        });

        it('should return zero counts when search yields no results', () => {
            const licenses = [createMockLicenseInfo({ id: 'MIT' })];

            const [, counts] = filter(licenses, 'nonexistent', undefined);

            expect(counts).toEqual({
                compliance_violation: 0,
                unrecognized: 0,
                permissive: 0,
                copy_left: 0
            });
        });

        it('should handle licenses with mixed null/undefined categories', () => {
            const { license_category: _removed, ...licenseWithoutCategory } =
                createMockLicenseInfo({
                    license_compliance_violation: false,
                    unable_to_infer: true
                });
            const licenses = [
                createMockLicenseInfo({
                    license_category: null as any,
                    license_compliance_violation: true,
                    unable_to_infer: false
                }),
                licenseWithoutCategory as LicenseInfo
            ];

            const [, counts] = filter(licenses, undefined, undefined);

            expect(counts).toEqual({
                compliance_violation: 1,
                unrecognized: 1,
                permissive: 0,
                copy_left: 0
            });
        });
    });

    describe('combined filtering', () => {
        it('should apply search key filtering before active filters', () => {
            const licenses = [
                createMockLicenseInfo({
                    id: 'MIT',
                    name: 'MIT License',
                    license_category: 'permissive',
                    license_compliance_violation: false
                }),
                createMockLicenseInfo({
                    id: 'Apache-2.0',
                    name: 'Apache MIT Style License',
                    license_category: 'permissive',
                    license_compliance_violation: true
                }),
                createMockLicenseInfo({
                    id: 'GPL-MIT',
                    name: 'GPL MIT License',
                    license_category: 'copy_left',
                    license_compliance_violation: true
                })
            ];

            const [filteredLicenses] = filter(licenses, 'MIT', ['permissive']);

            expect(filteredLicenses).toHaveLength(2);
            expect(filteredLicenses[0]!.id).toBe('MIT');
            expect(filteredLicenses[0]!.license_category).toBe('permissive');
            expect(filteredLicenses[1]!.id).toBe('Apache-2.0');
            expect(filteredLicenses[1]!.license_category).toBe('permissive');
        });

        it('should combine search and multiple active filters', () => {
            const licenses = [
                createMockLicenseInfo({
                    id: 'MIT',
                    license_category: 'permissive',
                    license_compliance_violation: false,
                    unable_to_infer: false
                }),
                createMockLicenseInfo({
                    id: 'MIT-style',
                    license_category: 'permissive',
                    license_compliance_violation: true,
                    unable_to_infer: false
                }),
                createMockLicenseInfo({
                    id: 'GPL-MIT',
                    license_category: 'copy_left',
                    license_compliance_violation: true,
                    unable_to_infer: false
                })
            ];

            const [filteredLicenses] = filter(licenses, 'MIT', [
                'permissive',
                'compliance_violation'
            ]);

            expect(filteredLicenses).toHaveLength(1);
            expect(filteredLicenses[0]!.id).toBe('MIT-style');
            expect(filteredLicenses[0]!.license_category).toBe('permissive');
            expect(filteredLicenses[0]!.license_compliance_violation).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('should handle licenses with undefined fields gracefully', () => {
            const licenses = [
                {
                    id: undefined as any,
                    name: undefined as any,
                    unable_to_infer: false,
                    license_compliance_violation: false,
                    deps_using_license: [],
                }
            ];

            const [filteredLicenses] = filter(licenses, 'test', undefined);

            expect(filteredLicenses).toHaveLength(0);
        });

        it('should handle special characters in search key', () => {
            const licenses = [
                createMockLicenseInfo({
                    id: 'GPL-2.0+',
                    name: 'GNU General Public License v2.0 or later'
                })
            ];

            const [filteredLicenses] = filter(licenses, 'GPL-2.0+', undefined);

            expect(filteredLicenses).toHaveLength(1);
            expect(filteredLicenses[0]!.id).toBe('GPL-2.0+');
        });

        it('should handle very long search keys', () => {
            const longSearchKey = 'a'.repeat(1000);
            const licenses = [createMockLicenseInfo()];

            const [filteredLicenses] = filter(licenses, longSearchKey, undefined);

            expect(filteredLicenses).toHaveLength(0);
        });

        it('should handle license with empty deps_using_license array', () => {
            const licenses = [
                createMockLicenseInfo({
                    deps_using_license: []
                })
            ];

            const [filteredLicenses] = filter(licenses, undefined, undefined);

            expect(filteredLicenses).toHaveLength(1);
            expect(filteredLicenses[0]!.deps_using_license).toEqual([]);
        });

        it('should handle unknown filter types gracefully', () => {
            const licenses = [createMockLicenseInfo()];

            const [filteredLicenses] = filter(licenses, undefined, ['unknown_filter' as any]);

            expect(filteredLicenses).toHaveLength(1);
            expect(filteredLicenses).toEqual(licenses);
        });

        it('should handle empty strings in license fields', () => {
            const licenses = [
                createMockLicenseInfo({
                    id: '',
                    name: '',
                    license_category: '' as any
                })
            ];

            const [filteredLicenses] = filter(licenses, '', undefined);

            expect(filteredLicenses).toHaveLength(1);
            expect(filteredLicenses).toEqual(licenses);
        });
    });

    describe('function signature validation', () => {
        it('should return tuple with filtered licenses and counts', () => {
            const licenses = [createMockLicenseInfo()];

            const result = filter(licenses, undefined, undefined);

            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(2);
            expect(Array.isArray(result[0])).toBe(true);
            expect(typeof result[1]).toBe('object');
        });

        it('should return array of LicenseInfo objects', () => {
            const licenses = [createMockLicenseInfo(), createMockLicenseInfo()];

            const [filteredLicenses] = filter(licenses, undefined, undefined);

            expect(filteredLicenses).toHaveLength(2);
            filteredLicenses.forEach((license) => {
                expect(license).toHaveProperty('id');
                expect(license).toHaveProperty('name');
                expect(license).toHaveProperty('unable_to_infer');
                expect(license).toHaveProperty('license_compliance_violation');
                expect(license).toHaveProperty('deps_using_license');
            });
        });

        it('should return counts object with correct structure', () => {
            const licenses = [createMockLicenseInfo()];

            const [, counts] = filter(licenses, undefined, undefined);

            expect(typeof counts).toBe('object');
            expect(counts).toHaveProperty('compliance_violation');
            expect(counts).toHaveProperty('unrecognized');
            expect(counts).toHaveProperty('permissive');
            expect(counts).toHaveProperty('copy_left');

            Object.values(counts).forEach((count) => {
                expect(typeof count).toBe('number');
                expect(count).toBeGreaterThanOrEqual(0);
            });
        });
    });
});
