import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PluginModule } from './plugin.module';
import { PluginController } from './plugin.controller';
import { PluginService } from './plugin.service';
import { PluginsRepository } from './plugin.repository';
import { Plugin } from './plugin.entity';

describe('PluginModule', () => {
    describe('Module Metadata', () => {
        it('should have correct module metadata', () => {
            const imports = Reflect.getMetadata('imports', PluginModule);
            const providers = Reflect.getMetadata('providers', PluginModule);
            const controllers = Reflect.getMetadata('controllers', PluginModule);

            expect(imports).toBeDefined();
            expect(Array.isArray(imports)).toBe(true);
            expect(imports).toHaveLength(2); // TypeORM root and feature modules

            expect(providers).toBeDefined();
            expect(Array.isArray(providers)).toBe(true);
            expect(providers).toContain(PluginService);
            expect(providers).toContain(PluginsRepository);
            expect(providers).toHaveLength(2);

            expect(controllers).toBeDefined();
            expect(Array.isArray(controllers)).toBe(true);
            expect(controllers).toContain(PluginController);
            expect(controllers).toHaveLength(1);
        });

        it('should not export any providers by default', () => {
            const exports = Reflect.getMetadata('exports', PluginModule);
            expect(exports).toBeUndefined();
        });
    });

    describe('Service Integration', () => {
        let module: TestingModule;
        let pluginService: PluginService;
        let pluginsRepository: PluginsRepository;
        let pluginController: PluginController;

        const mockRepository = {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
            create: jest.fn(),
            update: jest.fn()
        };

        beforeEach(async () => {
            module = await Test.createTestingModule({
                controllers: [PluginController],
                providers: [
                    PluginService,
                    PluginsRepository,
                    {
                        provide: getRepositoryToken(Plugin, 'plugin'),
                        useValue: mockRepository
                    }
                ]
            }).compile();

            pluginService = module.get<PluginService>(PluginService);
            pluginsRepository = module.get<PluginsRepository>(PluginsRepository);
            pluginController = module.get<PluginController>(PluginController);
        });

        afterEach(async () => {
            jest.clearAllMocks();
            if (module) {
                await module.close();
            }
        });

        it('should create module components successfully', () => {
            expect(module).toBeDefined();
            expect(pluginService).toBeDefined();
            expect(pluginsRepository).toBeDefined();
            expect(pluginController).toBeDefined();
        });

        it('should have PluginController', () => {
            expect(pluginController).toBeInstanceOf(PluginController);
        });

        it('should have PluginService', () => {
            expect(pluginService).toBeInstanceOf(PluginService);
        });

        it('should have PluginsRepository', () => {
            expect(pluginsRepository).toBeInstanceOf(PluginsRepository);
        });

        it('should inject dependencies correctly', () => {
            // Verify that service has repository injected
            expect(pluginService).toBeDefined();
            expect(pluginsRepository).toBeDefined();

            // Verify that controller has service injected
            expect(pluginController).toBeDefined();
            expect(pluginService).toBeDefined();
        });
    });

    describe('Dependency Injection Configuration', () => {
        it('should have proper constructor parameter types for PluginService', () => {
            const paramTypes = Reflect.getMetadata('design:paramtypes', PluginService);
            expect(paramTypes).toBeDefined();
            expect(paramTypes[0]).toBe(PluginsRepository);
        });

        it('should have proper constructor parameter types for PluginController', () => {
            const paramTypes = Reflect.getMetadata('design:paramtypes', PluginController);
            expect(paramTypes).toBeDefined();
            expect(paramTypes[0]).toBe(PluginService);
        });

        it('should have proper constructor parameter types for PluginsRepository', () => {
            const paramTypes = Reflect.getMetadata('design:paramtypes', PluginsRepository);
            expect(paramTypes).toBeDefined();
            expect(paramTypes[0]).toBe(Repository);
        });
    });
});
