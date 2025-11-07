import { Test, type TestingModule } from '@nestjs/testing';
import type { Plugin } from './plugin.entity';
import { PluginsRepository } from './plugin.repository';
import { PluginService } from './plugin.service';

describe('PluginService', () => {
    let pluginService: PluginService;
    let pluginsRepository: jest.Mocked<PluginsRepository>;

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
        const mockPluginsRepository = {
            getById: jest.fn(),
            getAll: jest.fn()
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PluginService,
                {
                    provide: PluginsRepository,
                    useValue: mockPluginsRepository
                }
            ]
        }).compile();

        pluginService = module.get<PluginService>(PluginService);
        pluginsRepository = module.get(PluginsRepository);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('get', () => {
        it('should return a plugin when it exists', async () => {
            pluginsRepository.getById.mockResolvedValue(mockPlugin);

            const result = await pluginService.get('test-uuid-123');

            expect(result).toEqual(mockPlugin);
            expect(pluginsRepository.getById).toHaveBeenCalledWith('test-uuid-123');
            expect(pluginsRepository.getById).toHaveBeenCalledTimes(1);
        });

        it('should propagate error when repository throws', async () => {
            const error = new Error('No plugins found');
            pluginsRepository.getById.mockRejectedValue(error);

            await expect(pluginService.get('non-existent-id')).rejects.toThrow('No plugins found');

            expect(pluginsRepository.getById).toHaveBeenCalledWith('non-existent-id');
        });

        it('should handle empty string id', async () => {
            pluginsRepository.getById.mockResolvedValue(mockPlugin);

            const result = await pluginService.get('');

            expect(result).toEqual(mockPlugin);
            expect(pluginsRepository.getById).toHaveBeenCalledWith('');
        });

        it('should handle special characters in id', async () => {
            const specialId = 'id-with-特殊-chars!@#$%';
            pluginsRepository.getById.mockResolvedValue(mockPlugin);

            const result = await pluginService.get(specialId);

            expect(result).toEqual(mockPlugin);
            expect(pluginsRepository.getById).toHaveBeenCalledWith(specialId);
        });

        it('should handle undefined result from repository', async () => {
            const undefinedPlugin = {
                id: 'test-id',
                name: undefined,
                version: undefined,
                description: undefined,
                depends_on: undefined,
                config: undefined
            } as unknown as Plugin;
            pluginsRepository.getById.mockResolvedValue(undefinedPlugin);

            const result = await pluginService.get('test-id');

            expect(result).toEqual(undefinedPlugin);
            expect(pluginsRepository.getById).toHaveBeenCalledWith('test-id');
        });

        it('should not call getAll when getting single plugin', async () => {
            pluginsRepository.getById.mockResolvedValue(mockPlugin);

            await pluginService.get('test-id');

            expect(pluginsRepository.getAll).not.toHaveBeenCalled();
        });

        it('should handle concurrent calls', async () => {
            const emptyPlugin = {
                id: 'empty',
                name: undefined,
                version: undefined,
                description: undefined,
                depends_on: undefined,
                config: undefined
            } as unknown as Plugin;
            pluginsRepository.getById.mockImplementation(async (id) => {
                await new Promise((resolve) => setTimeout(resolve, 10));
                return id === 'test-uuid-123' ? mockPlugin : emptyPlugin;
            });

            const results = await Promise.all([
                pluginService.get('test-uuid-123'),
                pluginService.get('test-uuid-456'),
                pluginService.get('test-uuid-789')
            ]);

            expect(results[0]).toEqual(mockPlugin);
            expect(results[1]).toEqual(emptyPlugin);
            expect(results[2]).toEqual(emptyPlugin);
            expect(pluginsRepository.getById).toHaveBeenCalledTimes(3);
        });
    });

    describe('getAll', () => {
        it('should return all plugins', async () => {
            pluginsRepository.getAll.mockResolvedValue(mockPlugins);

            const result = await pluginService.getAll();

            expect(result).toEqual(mockPlugins);
            expect(result).toHaveLength(3);
            expect(pluginsRepository.getAll).toHaveBeenCalledWith();
            expect(pluginsRepository.getAll).toHaveBeenCalledTimes(1);
        });

        it('should return empty array when no plugins exist', async () => {
            pluginsRepository.getAll.mockResolvedValue([]);

            const result = await pluginService.getAll();

            expect(result).toEqual([]);
            expect(result).toHaveLength(0);
            expect(pluginsRepository.getAll).toHaveBeenCalledWith();
        });

        it('should propagate error when repository throws', async () => {
            const error = new Error('Database error');
            pluginsRepository.getAll.mockRejectedValue(error);

            await expect(pluginService.getAll()).rejects.toThrow('Database error');

            expect(pluginsRepository.getAll).toHaveBeenCalledWith();
        });

        it('should handle single plugin result', async () => {
            pluginsRepository.getAll.mockResolvedValue([mockPlugin]);

            const result = await pluginService.getAll();

            expect(result).toEqual([mockPlugin]);
            expect(result).toHaveLength(1);
        });

        it('should not call getById when getting all plugins', async () => {
            pluginsRepository.getAll.mockResolvedValue(mockPlugins);

            await pluginService.getAll();

            expect(pluginsRepository.getById).not.toHaveBeenCalled();
        });

        it('should preserve order from repository', async () => {
            const reversedPlugins = [...mockPlugins].reverse();
            pluginsRepository.getAll.mockResolvedValue(reversedPlugins);

            const result = await pluginService.getAll();

            expect(result).toEqual(reversedPlugins);
            expect(result[0]!.id).toBe('test-uuid-789');
            expect(result[2]!.id).toBe('test-uuid-123');
        });

        it('should handle plugins with undefined values', async () => {
            const pluginsWithUndefined: Plugin[] = [
                {
                    id: 'test-uuid'
                }
            ];
            pluginsRepository.getAll.mockResolvedValue(pluginsWithUndefined);

            const result = await pluginService.getAll();

            expect(result).toEqual(pluginsWithUndefined);
            expect(result[0]!.name).toBeUndefined();
        });
    });

    describe('Service Instance', () => {
        it('should be defined', () => {
            expect(pluginService).toBeDefined();
        });

        it('should have get method', () => {
            expect(pluginService.get).toBeDefined();
            expect(typeof pluginService.get).toBe('function');
        });

        it('should have getAll method', () => {
            expect(pluginService.getAll).toBeDefined();
            expect(typeof pluginService.getAll).toBe('function');
        });
    });

    describe('Error Handling', () => {
        it('should handle repository timeout errors', async () => {
            const timeoutError = new Error('Query timeout');
            pluginsRepository.getById.mockRejectedValue(timeoutError);

            await expect(pluginService.get('test-id')).rejects.toThrow('Query timeout');
        });

        it('should handle unexpected repository errors', async () => {
            pluginsRepository.getAll.mockRejectedValue(
                new TypeError('Cannot read property of undefined')
            );

            await expect(pluginService.getAll()).rejects.toThrow(TypeError);
        });
    });
});
