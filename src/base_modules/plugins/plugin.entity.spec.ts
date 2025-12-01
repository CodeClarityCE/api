import { plainToClass } from 'class-transformer';
import { Plugin } from './plugin.entity';

describe('Plugin Entity', () => {
    describe('Basic Properties', () => {
        it('should create a plugin instance with all properties', () => {
            const plugin = new Plugin();
            plugin.id = 'test-uuid';
            plugin.name = 'Test Plugin';
            plugin.version = '1.0.0';
            plugin.description = 'Test description';
            plugin.depends_on = ['dependency1', 'dependency2'];
            plugin.config = { key: 'value', nested: { prop: 'test' } };

            expect(plugin.id).toBe('test-uuid');
            expect(plugin.name).toBe('Test Plugin');
            expect(plugin.version).toBe('1.0.0');
            expect(plugin.description).toBe('Test description');
            expect(plugin.depends_on).toEqual(['dependency1', 'dependency2']);
            expect(plugin.config).toEqual({ key: 'value', nested: { prop: 'test' } });
        });

        it('should handle undefined values for nullable fields', () => {
            const plugin = new Plugin();
            plugin.id = 'test-uuid';
            // Properties are already undefined by default

            expect(plugin.id).toBe('test-uuid');
            expect(plugin.name).toBeUndefined();
            expect(plugin.version).toBeUndefined();
            expect(plugin.description).toBeUndefined();
            expect(plugin.depends_on).toBeUndefined();
            expect(plugin.config).toBeUndefined();
        });
    });

    describe('JSON Fields', () => {
        it('should handle empty arrays for depends_on', () => {
            const plugin = new Plugin();
            plugin.depends_on = [];

            expect(plugin.depends_on).toEqual([]);
            expect(Array.isArray(plugin.depends_on)).toBe(true);
        });

        it('should handle complex config objects', () => {
            const plugin = new Plugin();
            const complexConfig = {
                enabled: true,
                settings: {
                    timeout: 30000,
                    retries: 3,
                    endpoints: ['http://api1.com', 'http://api2.com']
                },
                features: {
                    autoUpdate: false,
                    logging: {
                        level: 'debug',
                        output: ['console', 'file']
                    }
                }
            };
            plugin.config = complexConfig;

            expect(plugin.config).toEqual(complexConfig);
            const typedConfig = plugin.config as typeof complexConfig;
            expect(typedConfig.settings.timeout).toBe(30000);
            expect(typedConfig.features.logging.level).toBe('debug');
        });

        it('should handle empty config objects', () => {
            const plugin = new Plugin();
            plugin.config = {};

            expect(plugin.config).toEqual({});
            expect(Object.keys(plugin.config).length).toBe(0);
        });
    });

    describe('Class Transformation', () => {
        it('should transform plain object to Plugin instance', () => {
            const plainObject = {
                id: 'uuid-123',
                name: 'Sample Plugin',
                version: '2.1.0',
                description: 'A sample plugin for testing',
                depends_on: ['core', 'auth'],
                config: { mode: 'production' }
            };

            const plugin = plainToClass(Plugin, plainObject);

            expect(plugin).toBeInstanceOf(Plugin);
            expect(plugin.id).toBe('uuid-123');
            expect(plugin.name).toBe('Sample Plugin');
            expect(plugin.version).toBe('2.1.0');
            expect(plugin.description).toBe('A sample plugin for testing');
            expect(plugin.depends_on).toEqual(['core', 'auth']);
            expect(plugin.config).toEqual({ mode: 'production' });
        });

        it('should handle transformation with missing fields', () => {
            const plainObject = {
                id: 'uuid-456'
            };

            const plugin = plainToClass(Plugin, plainObject);

            expect(plugin).toBeInstanceOf(Plugin);
            expect(plugin.id).toBe('uuid-456');
            expect(plugin.name).toBeUndefined();
            expect(plugin.version).toBeUndefined();
            expect(plugin.description).toBeUndefined();
            expect(plugin.depends_on).toBeUndefined();
            expect(plugin.config).toBeUndefined();
        });

        it('should handle transformation with extra fields', () => {
            const plainObject = {
                id: 'uuid-789',
                name: 'Test Plugin',
                extraField: 'should be ignored',
                anotherExtra: 123
            };

            const plugin = plainToClass(Plugin, plainObject);

            expect(plugin).toBeInstanceOf(Plugin);
            expect(plugin.id).toBe('uuid-789');
            expect(plugin.name).toBe('Test Plugin');
            // plainToClass includes extra fields by default unless excludeExtraneousValues is used
            expect((plugin as any).extraField).toBe('should be ignored');
            expect((plugin as any).anotherExtra).toBe(123);
        });
    });

    describe('Edge Cases', () => {
        it('should handle special characters in string fields', () => {
            const plugin = new Plugin();
            plugin.name = 'Plugin™ with 特殊 characters!@#$%^&*()';
            plugin.version = '1.0.0-beta.1+build.123';
            plugin.description = 'Description with\nnewlines\tand\ttabs';

            expect(plugin.name).toBe('Plugin™ with 特殊 characters!@#$%^&*()');
            expect(plugin.version).toBe('1.0.0-beta.1+build.123');
            expect(plugin.description).toBe('Description with\nnewlines\tand\ttabs');
        });

        it('should handle very long strings', () => {
            const plugin = new Plugin();
            const longString = 'a'.repeat(10000);
            plugin.description = longString;

            expect(plugin.description).toBe(longString);
            expect(plugin.description.length).toBe(10000);
        });

        it('should handle deeply nested config objects', () => {
            const plugin = new Plugin();
            const deepConfig = {
                level1: {
                    level2: {
                        level3: {
                            level4: {
                                level5: {
                                    value: 'deep value'
                                }
                            }
                        }
                    }
                }
            };
            plugin.config = deepConfig;

            const config = plugin.config as typeof deepConfig;
            expect(config.level1.level2.level3.level4.level5.value).toBe('deep value');
        });

        it('should handle config with various data types', () => {
            const plugin = new Plugin();
            plugin.config = {
                string: 'text',
                number: 42,
                float: 3.14,
                boolean: true,
                null: null,
                array: [1, 2, 3],
                object: { nested: true },
                date: '2023-01-01T00:00:00Z'
            };

            expect(plugin.config['string']).toBe('text');
            expect(plugin.config['number']).toBe(42);
            expect(plugin.config['float']).toBe(3.14);
            expect(plugin.config['boolean']).toBe(true);
            expect(plugin.config['null']).toBeNull();
            expect(plugin.config['array']).toEqual([1, 2, 3]);
            expect(plugin.config['object']).toEqual({ nested: true });
            expect(plugin.config['date']).toBe('2023-01-01T00:00:00Z');
        });

        it('should handle depends_on with duplicate values', () => {
            const plugin = new Plugin();
            plugin.depends_on = ['auth', 'core', 'auth', 'database', 'core'];

            expect(plugin.depends_on).toEqual(['auth', 'core', 'auth', 'database', 'core']);
            expect(plugin.depends_on.length).toBe(5);
        });
    });

    describe('JSON Serialization', () => {
        it('should serialize and deserialize correctly', () => {
            const plugin = new Plugin();
            plugin.id = 'test-id';
            plugin.name = 'Test Plugin';
            plugin.version = '1.0.0';
            plugin.description = 'Test description';
            plugin.depends_on = ['dep1', 'dep2'];
            plugin.config = { setting: 'value' };

            const jsonString = JSON.stringify(plugin);
            const parsed = JSON.parse(jsonString);

            expect(parsed.id).toBe('test-id');
            expect(parsed.name).toBe('Test Plugin');
            expect(parsed.version).toBe('1.0.0');
            expect(parsed.description).toBe('Test description');
            expect(parsed.depends_on).toEqual(['dep1', 'dep2']);
            expect(parsed.config).toEqual({ setting: 'value' });
        });

        it('should handle circular references in config', () => {
            const plugin = new Plugin();
            const circularConfig: any = { prop: 'value' };
            circularConfig.self = circularConfig;

            expect(() => {
                plugin.config = circularConfig;
                JSON.stringify(plugin);
            }).toThrow();
        });
    });
});
