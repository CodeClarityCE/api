import { FileModule } from './file.module';
import { FileController } from './file.controller';
import { FileService } from './file.service';
import { FileRepository } from './file.repository';

describe('FileModule', () => {
    describe('Module Structure', () => {
        it('should be defined', () => {
            expect(FileModule).toBeDefined();
        });

        it('should have correct module configuration', () => {
            const module = new FileModule();
            expect(module).toBeDefined();
            expect(module).toBeInstanceOf(FileModule);
        });
    });

    describe('Module Metadata', () => {
        it('should have imports configured', () => {
            const imports = Reflect.getMetadata('imports', FileModule);
            expect(imports).toBeDefined();
            expect(imports).toBeInstanceOf(Array);
            expect(imports.length).toBeGreaterThan(0);
        });

        it('should have providers configured', () => {
            const providers = Reflect.getMetadata('providers', FileModule);
            expect(providers).toBeDefined();
            expect(providers).toContain(FileService);
            expect(providers).toContain(FileRepository);
        });

        it('should have controllers configured', () => {
            const controllers = Reflect.getMetadata('controllers', FileModule);
            expect(controllers).toBeDefined();
            expect(controllers).toContain(FileController);
        });

        it('should have exports configured', () => {
            const exports = Reflect.getMetadata('exports', FileModule);
            expect(exports).toBeDefined();
            expect(exports).toContain(FileRepository);
        });
    });

    describe('Module Configuration', () => {
        it('should export FileRepository', () => {
            const exports = Reflect.getMetadata('exports', FileModule);
            expect(exports).toContain(FileRepository);
        });

        it('should provide FileService and FileRepository', () => {
            const providers = Reflect.getMetadata('providers', FileModule);
            expect(providers).toContain(FileService);
            expect(providers).toContain(FileRepository);
        });

        it('should register FileController', () => {
            const controllers = Reflect.getMetadata('controllers', FileModule);
            expect(controllers).toContain(FileController);
        });
    });
});
