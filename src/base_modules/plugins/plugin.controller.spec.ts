import { Test, type TestingModule } from '@nestjs/testing';
import { AuthenticatedUser, ROLE } from 'src/base_modules/auth/auth.types';
import { PluginController } from './plugin.controller';
import type { Plugin } from './plugin.entity';
import { PluginService } from './plugin.service';

describe('PluginController', () => {
    let pluginController: PluginController;
    let pluginService: jest.Mocked<PluginService>;

    const mockUser = new AuthenticatedUser('test-user-123', [ROLE.USER], true);

    const mockPlugin: Plugin = {
        id: 'test-uuid-123',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'Test plugin description',
        depends_on: ['core', 'auth'],
        config: { enabled: true, timeout: 30000 }
    };

    const mockPlugins: Plugin[] = [
        mockPlugin,
        {
            id: 'test-uuid-456',
            name: 'Another Plugin',
            version: '2.0.0',
            description: 'Another plugin description',
            depends_on: ['database'],
            config: { mode: 'production' }
        },
        {
            id: 'test-uuid-789',
            name: 'Third Plugin',
            version: '0.5.0',
            description: 'Beta plugin',
            depends_on: [],
            config: {}
        }
    ];

    beforeEach(async () => {
        const mockPluginService = {
            get: jest.fn(),
            getAll: jest.fn()
        };

        const module: TestingModule = await Test.createTestingModule({
            controllers: [PluginController],
            providers: [
                {
                    provide: PluginService,
                    useValue: mockPluginService
                }
            ]
        }).compile();

        pluginController = module.get<PluginController>(PluginController);
        pluginService = module.get(PluginService);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('get', () => {
        it('should return a plugin successfully', async () => {
            pluginService.get.mockResolvedValue(mockPlugin);

            const result = await pluginController.get(mockUser, 'test-uuid-123');

            expect(result).toEqual({ data: mockPlugin });
            expect(pluginService.get).toHaveBeenCalledWith('test-uuid-123');
            expect(pluginService.get).toHaveBeenCalledTimes(1);
        });

        it('should handle service errors', async () => {
            const error = new Error('Plugin not found');
            pluginService.get.mockRejectedValue(error);

            await expect(pluginController.get(mockUser, 'non-existent-id')).rejects.toThrow(
                'Plugin not found'
            );

            expect(pluginService.get).toHaveBeenCalledWith('non-existent-id');
        });

        it('should work with different user contexts', async () => {
            const differentUser = new AuthenticatedUser('other-user-789', [ROLE.USER], true);
            pluginService.get.mockResolvedValue(mockPlugin);

            const result = await pluginController.get(differentUser, 'test-uuid-123');

            expect(result).toEqual({ data: mockPlugin });
            expect(pluginService.get).toHaveBeenCalledWith('test-uuid-123');
        });

        it('should handle empty string plugin_id', async () => {
            const emptyPlugin = {
                id: '',
                name: undefined,
                version: undefined,
                description: undefined,
                depends_on: undefined,
                config: undefined
            } as unknown as Plugin;
            pluginService.get.mockResolvedValue(emptyPlugin);

            const result = await pluginController.get(mockUser, '');

            expect(result).toEqual({ data: emptyPlugin });
            expect(pluginService.get).toHaveBeenCalledWith('');
        });

        it('should handle special characters in plugin_id', async () => {
            const specialId = 'id-with-special-chars!@#$%';
            pluginService.get.mockResolvedValue(mockPlugin);

            const result = await pluginController.get(mockUser, specialId);

            expect(result).toEqual({ data: mockPlugin });
            expect(pluginService.get).toHaveBeenCalledWith(specialId);
        });

        it('should handle plugin with undefined fields', async () => {
            const pluginWithUndefined: Plugin = {
                id: 'test-uuid'
            };
            pluginService.get.mockResolvedValue(pluginWithUndefined);

            const result = await pluginController.get(mockUser, 'test-uuid');

            expect(result).toEqual({ data: pluginWithUndefined });
            expect(result.data.name).toBeUndefined();
        });

        it('should handle concurrent requests', async () => {
            const emptyPlugin = {
                id: 'empty',
                name: undefined,
                version: undefined,
                description: undefined,
                depends_on: undefined,
                config: undefined
            } as unknown as Plugin;
            pluginService.get.mockImplementation(async (id) => {
                await new Promise((resolve) => setTimeout(resolve, 10));
                return id === 'test-uuid-123' ? mockPlugin : emptyPlugin;
            });

            const results = await Promise.all([
                pluginController.get(mockUser, 'test-uuid-123'),
                pluginController.get(mockUser, 'test-uuid-456'),
                pluginController.get(mockUser, 'test-uuid-789')
            ]);

            expect(results[0]).toEqual({ data: mockPlugin });
            expect(results[1]).toEqual({ data: emptyPlugin });
            expect(results[2]).toEqual({ data: emptyPlugin });
            expect(pluginService.get).toHaveBeenCalledTimes(3);
        });
    });

    describe('getAll', () => {
        it('should return all plugins successfully', async () => {
            pluginService.getAll.mockResolvedValue(mockPlugins);

            const result = await pluginController.getAll(mockUser);

            expect(result).toEqual({ data: mockPlugins });
            expect(result.data).toHaveLength(3);
            expect(pluginService.getAll).toHaveBeenCalledWith();
            expect(pluginService.getAll).toHaveBeenCalledTimes(1);
        });

        it('should return empty array when no plugins exist', async () => {
            pluginService.getAll.mockResolvedValue([]);

            const result = await pluginController.getAll(mockUser);

            expect(result).toEqual({ data: [] });
            expect(result.data).toHaveLength(0);
            expect(pluginService.getAll).toHaveBeenCalledWith();
        });

        it('should handle service errors', async () => {
            const error = new Error('Database error');
            pluginService.getAll.mockRejectedValue(error);

            await expect(pluginController.getAll(mockUser)).rejects.toThrow('Database error');

            expect(pluginService.getAll).toHaveBeenCalledWith();
        });

        it('should work with different user contexts', async () => {
            const differentUser = new AuthenticatedUser('admin-user-999', [ROLE.ADMIN], true);
            pluginService.getAll.mockResolvedValue(mockPlugins);

            const result = await pluginController.getAll(differentUser);

            expect(result).toEqual({ data: mockPlugins });
            expect(pluginService.getAll).toHaveBeenCalledWith();
        });

        it('should return single plugin correctly', async () => {
            pluginService.getAll.mockResolvedValue([mockPlugin]);

            const result = await pluginController.getAll(mockUser);

            expect(result).toEqual({ data: [mockPlugin] });
            expect(result.data).toHaveLength(1);
        });

        it('should preserve plugin order', async () => {
            const reversedPlugins = [...mockPlugins].reverse();
            pluginService.getAll.mockResolvedValue(reversedPlugins);

            const result = await pluginController.getAll(mockUser);

            expect(result.data[0]!.id).toBe('test-uuid-789');
            expect(result.data[2]!.id).toBe('test-uuid-123');
        });

        it('should handle plugins with various configurations', async () => {
            const variedPlugins: Plugin[] = [
                {
                    id: 'minimal-plugin',
                    name: 'Minimal',
                    version: '0.0.1',
                    description: '',
                    depends_on: [],
                    config: {}
                },
                {
                    id: 'complex-plugin',
                    name: 'Complex Plugin with Very Long Name That Tests String Limits',
                    version: '99.99.99-beta.999+build.12345',
                    description: 'A'.repeat(1000),
                    depends_on: Array(50).fill('dependency'),
                    config: {
                        nested: {
                            deeply: {
                                structured: {
                                    data: Array(100).fill({ key: 'value' })
                                }
                            }
                        }
                    }
                }
            ];
            pluginService.getAll.mockResolvedValue(variedPlugins);

            const result = await pluginController.getAll(mockUser);

            expect(result).toEqual({ data: variedPlugins });
            expect(result.data).toHaveLength(2);
            expect(result.data[1]!.depends_on).toHaveLength(50);
        });
    });

    describe('Controller Instance', () => {
        it('should be defined', () => {
            expect(pluginController).toBeDefined();
        });

        it('should have get method', () => {
            expect(pluginController.get).toBeDefined();
            expect(typeof pluginController.get).toBe('function');
        });

        it('should have getAll method', () => {
            expect(pluginController.getAll).toBeDefined();
            expect(typeof pluginController.getAll).toBe('function');
        });
    });

    describe('Response Format', () => {
        it('should always wrap single plugin response in data property', async () => {
            pluginService.get.mockResolvedValue(mockPlugin);

            const result = await pluginController.get(mockUser, 'test-id');

            expect(result).toHaveProperty('data');
            expect(result.data).toEqual(mockPlugin);
            expect(Object.keys(result)).toEqual(['data']);
        });

        it('should always wrap plugin array response in data property', async () => {
            pluginService.getAll.mockResolvedValue(mockPlugins);

            const result = await pluginController.getAll(mockUser);

            expect(result).toHaveProperty('data');
            expect(result.data).toEqual(mockPlugins);
            expect(Object.keys(result)).toEqual(['data']);
        });
    });

    describe('Error Scenarios', () => {
        it('should propagate timeout errors from service', async () => {
            const timeoutError = new Error('Request timeout');
            pluginService.get.mockRejectedValue(timeoutError);

            await expect(pluginController.get(mockUser, 'test-id')).rejects.toThrow(
                'Request timeout'
            );
        });

        it('should propagate unexpected errors from service', async () => {
            pluginService.getAll.mockRejectedValue(new TypeError('Cannot read property'));

            await expect(pluginController.getAll(mockUser)).rejects.toThrow(TypeError);
        });
    });
});
