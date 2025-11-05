import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { Plugin } from './plugin.entity';
import { PluginsRepository } from './plugin.repository';

describe('PluginsRepository', () => {
    let pluginsRepository: PluginsRepository;
    let mockRepository: jest.Mocked<Repository<Plugin>>;

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
        mockRepository = {
            findOne: jest.fn(),
            find: jest.fn()
        } as any;

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PluginsRepository,
                {
                    provide: getRepositoryToken(Plugin, 'plugin'),
                    useValue: mockRepository
                }
            ]
        }).compile();

        pluginsRepository = module.get<PluginsRepository>(PluginsRepository);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getById', () => {
        it('should return a plugin when it exists', async () => {
            mockRepository.findOne.mockResolvedValue(mockPlugin);

            const result = await pluginsRepository.getById('test-uuid-123');

            expect(result).toEqual(mockPlugin);
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { id: 'test-uuid-123' }
            });
            expect(mockRepository.findOne).toHaveBeenCalledTimes(1);
        });

        it('should throw an error when plugin is not found', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await expect(pluginsRepository.getById('non-existent-id')).rejects.toThrow(
                'No plugins found'
            );

            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { id: 'non-existent-id' }
            });
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Database connection failed');
            mockRepository.findOne.mockRejectedValue(dbError);

            await expect(pluginsRepository.getById('test-id')).rejects.toThrow(
                'Database connection failed'
            );
        });

        it('should handle empty string id', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await expect(pluginsRepository.getById('')).rejects.toThrow('No plugins found');

            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { id: '' }
            });
        });

        it('should handle special characters in id', async () => {
            const specialId = 'id-with-special-chars!@#$%';
            mockRepository.findOne.mockResolvedValue(mockPlugin);

            const result = await pluginsRepository.getById(specialId);

            expect(result).toEqual(mockPlugin);
            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { id: specialId }
            });
        });

        it('should handle very long id strings', async () => {
            const longId = 'a'.repeat(1000);
            mockRepository.findOne.mockResolvedValue(null);

            await expect(pluginsRepository.getById(longId)).rejects.toThrow('No plugins found');

            expect(mockRepository.findOne).toHaveBeenCalledWith({
                where: { id: longId }
            });
        });
    });

    describe('getAll', () => {
        it('should return all plugins when they exist', async () => {
            mockRepository.find.mockResolvedValue(mockPlugins);

            const result = await pluginsRepository.getAll();

            expect(result).toEqual(mockPlugins);
            expect(result).toHaveLength(3);
            expect(mockRepository.find).toHaveBeenCalledWith();
            expect(mockRepository.find).toHaveBeenCalledTimes(1);
        });

        it('should return an empty array when no plugins exist', async () => {
            mockRepository.find.mockResolvedValue([]);

            const result = await pluginsRepository.getAll();

            expect(result).toEqual([]);
            expect(result).toHaveLength(0);
            expect(mockRepository.find).toHaveBeenCalledWith();
        });

        it('should throw an error when find returns null', async () => {
            mockRepository.find.mockResolvedValue(null as any);

            await expect(pluginsRepository.getAll()).rejects.toThrow('No plugins found');

            expect(mockRepository.find).toHaveBeenCalledWith();
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Database query failed');
            mockRepository.find.mockRejectedValue(dbError);

            await expect(pluginsRepository.getAll()).rejects.toThrow('Database query failed');
        });

        it('should return single plugin correctly', async () => {
            mockRepository.find.mockResolvedValue([mockPlugin]);

            const result = await pluginsRepository.getAll();

            expect(result).toEqual([mockPlugin]);
            expect(result).toHaveLength(1);
        });

        it('should handle plugins with undefined fields', async () => {
            const pluginsWithUndefined: Plugin[] = [
                {
                    id: 'test-uuid'
                }
            ];
            mockRepository.find.mockResolvedValue(pluginsWithUndefined);

            const result = await pluginsRepository.getAll();

            expect(result).toEqual(pluginsWithUndefined);
            expect(result[0]!.name).toBeUndefined();
            expect(result[0]!.config).toBeUndefined();
        });

        it('should preserve plugin order from database', async () => {
            const orderedPlugins = [...mockPlugins].reverse();
            mockRepository.find.mockResolvedValue(orderedPlugins);

            const result = await pluginsRepository.getAll();

            expect(result).toEqual(orderedPlugins);
            expect(result[0]!.id).toBe('test-uuid-789');
            expect(result[2]!.id).toBe('test-uuid-123');
        });
    });

    describe('Repository Instance', () => {
        it('should be defined', () => {
            expect(pluginsRepository).toBeDefined();
        });

        it('should have getById method', () => {
            expect(pluginsRepository.getById).toBeDefined();
            expect(typeof pluginsRepository.getById).toBe('function');
        });

        it('should have getAll method', () => {
            expect(pluginsRepository.getAll).toBeDefined();
            expect(typeof pluginsRepository.getAll).toBe('function');
        });
    });
});
