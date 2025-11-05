import { Test, type TestingModule } from '@nestjs/testing';
import { AuthenticatedUser, ROLE } from 'src/base_modules/auth/auth.types';


import { DependencyPatchPolicyController } from './dependencyPatch.controller';
import { DependencyPatchPolicyService } from './dependencyPatch.service';
import {
    type DependencyPatchPolicy,
    type DependencyPatchPolicyCreateBody,
    type DependencyPatchPolicyPatchBody,
    FullFixVersionSelection,
    PartialFixVersionSelection
} from './dependencyPatchPolicy.types';

describe('DependencyPatchPolicyController', () => {
    let controller: DependencyPatchPolicyController;
    let dependencyPatchPolicyService: DependencyPatchPolicyService;

    const mockUser = new AuthenticatedUser('user-123', [ROLE.USER], true);

    const mockCreateBody: DependencyPatchPolicyCreateBody = {
        name: 'Test Dependency Patch Policy',
        description: 'Test policy description',
        allow_downgrade: false,
        full_fix_version_selection_preference: FullFixVersionSelection.SELECT_NEWEST,
        partial_fix_version_selection_preference:
            PartialFixVersionSelection.SELECT_LOWEST_MAX_SEVERITY,
        default: false
    };

    const mockPatchBody: DependencyPatchPolicyPatchBody = {
        name: 'Updated Policy Name',
        description: 'Updated description'
    };

    const mockPolicy: DependencyPatchPolicy = {
        name: 'Test Dependency Patch Policy',
        description: 'Test policy description',
        allow_downgrade: false,
        full_fix_version_selection_preference: FullFixVersionSelection.SELECT_NEWEST,
        partial_fix_version_selection_preference:
            PartialFixVersionSelection.SELECT_LOWEST_MAX_SEVERITY,
        default: false,
        created_on: new Date('2024-01-01'),
        organization_id: 'org-123',
        policy_type: undefined as any
    };

    const mockDependencyPatchPolicyService = {
        create: jest.fn(),
        get: jest.fn(),
        getMany: jest.fn(),
        update: jest.fn(),
        remove: jest.fn()
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [DependencyPatchPolicyController],
            providers: [
                {
                    provide: DependencyPatchPolicyService,
                    useValue: mockDependencyPatchPolicyService
                }
            ]
        }).compile();

        controller = module.get<DependencyPatchPolicyController>(DependencyPatchPolicyController);
        dependencyPatchPolicyService = module.get<DependencyPatchPolicyService>(
            DependencyPatchPolicyService
        );

        jest.clearAllMocks();
    });

    describe('create', () => {
        it('should create a dependency patch policy', async () => {
            mockDependencyPatchPolicyService.create.mockResolvedValue('policy-123');

            const result = await controller.create(mockUser, 'org-123', mockCreateBody);

            expect(result).toEqual({ id: 'policy-123' });
            expect(dependencyPatchPolicyService.create).toHaveBeenCalledWith(
                'org-123',
                mockCreateBody,
                mockUser
            );
        });

        it('should handle service errors during creation', async () => {
            const error = new Error('Creation failed');
            mockDependencyPatchPolicyService.create.mockRejectedValue(error);

            await expect(controller.create(mockUser, 'org-123', mockCreateBody)).rejects.toThrow(
                'Creation failed'
            );

            expect(dependencyPatchPolicyService.create).toHaveBeenCalledWith(
                'org-123',
                mockCreateBody,
                mockUser
            );
        });

        it('should pass all parameters correctly', async () => {
            mockDependencyPatchPolicyService.create.mockResolvedValue('policy-456');

            await controller.create(mockUser, 'org-456', mockCreateBody);

            expect(dependencyPatchPolicyService.create).toHaveBeenCalledWith(
                'org-456',
                mockCreateBody,
                mockUser
            );
        });
    });

    describe('get', () => {
        it('should return a dependency patch policy', async () => {
            mockDependencyPatchPolicyService.get.mockResolvedValue(mockPolicy);

            const result = await controller.get(mockUser, 'org-123', 'policy-123');

            expect(result).toEqual({ data: mockPolicy });
            expect(dependencyPatchPolicyService.get).toHaveBeenCalledWith(
                'org-123',
                'policy-123',
                mockUser
            );
        });

        it('should handle service errors during retrieval', async () => {
            const error = new Error('Policy not found');
            mockDependencyPatchPolicyService.get.mockRejectedValue(error);

            await expect(controller.get(mockUser, 'org-123', 'policy-123')).rejects.toThrow(
                'Policy not found'
            );

            expect(dependencyPatchPolicyService.get).toHaveBeenCalledWith(
                'org-123',
                'policy-123',
                mockUser
            );
        });

        it('should handle different organization and policy IDs', async () => {
            mockDependencyPatchPolicyService.get.mockResolvedValue(mockPolicy);

            await controller.get(mockUser, 'org-456', 'policy-789');

            expect(dependencyPatchPolicyService.get).toHaveBeenCalledWith(
                'org-456',
                'policy-789',
                mockUser
            );
        });
    });

    describe('getMany', () => {
        it('should throw not implemented error', async () => {
            await expect(controller.getMany(mockUser, 'org-123', 0, 10)).rejects.toThrow(
                'Method not implemented.'
            );
        });

        it('should throw not implemented error with default parameters', async () => {
            await expect(controller.getMany(mockUser, 'org-123')).rejects.toThrow(
                'Method not implemented.'
            );
        });

        it('should throw not implemented error regardless of parameters', async () => {
            await expect(controller.getMany(mockUser, 'org-456', 1, 20)).rejects.toThrow(
                'Method not implemented.'
            );
        });
    });

    describe('update', () => {
        it('should update a dependency patch policy', async () => {
            mockDependencyPatchPolicyService.update.mockResolvedValue(undefined);

            const result = await controller.update(
                mockUser,
                'org-123',
                'policy-123',
                mockPatchBody
            );

            expect(result).toEqual({});
            expect(dependencyPatchPolicyService.update).toHaveBeenCalledWith(
                'org-123',
                'policy-123',
                mockPatchBody,
                mockUser
            );
        });

        it('should handle service errors during update', async () => {
            const error = new Error('Update failed');
            mockDependencyPatchPolicyService.update.mockRejectedValue(error);

            await expect(
                controller.update(mockUser, 'org-123', 'policy-123', mockPatchBody)
            ).rejects.toThrow('Update failed');

            expect(dependencyPatchPolicyService.update).toHaveBeenCalledWith(
                'org-123',
                'policy-123',
                mockPatchBody,
                mockUser
            );
        });

        it('should return empty object on successful update', async () => {
            mockDependencyPatchPolicyService.update.mockResolvedValue(undefined);

            const result = await controller.update(
                mockUser,
                'org-123',
                'policy-123',
                mockPatchBody
            );

            expect(result).toEqual({});
        });

        it('should handle partial patch body', async () => {
            const partialPatchBody = { name: 'Only name updated' };
            mockDependencyPatchPolicyService.update.mockResolvedValue(undefined);

            await controller.update(mockUser, 'org-123', 'policy-123', partialPatchBody);

            expect(dependencyPatchPolicyService.update).toHaveBeenCalledWith(
                'org-123',
                'policy-123',
                partialPatchBody,
                mockUser
            );
        });
    });

    describe('remove', () => {
        it('should remove a dependency patch policy', async () => {
            mockDependencyPatchPolicyService.remove.mockResolvedValue(undefined);

            const result = await controller.remove(mockUser, 'org-123', 'policy-123');

            expect(result).toEqual({});
            expect(dependencyPatchPolicyService.remove).toHaveBeenCalledWith(
                'org-123',
                'policy-123',
                mockUser
            );
        });

        it('should handle service errors during removal', async () => {
            const error = new Error('Removal failed');
            mockDependencyPatchPolicyService.remove.mockRejectedValue(error);

            await expect(controller.remove(mockUser, 'org-123', 'policy-123')).rejects.toThrow(
                'Removal failed'
            );

            expect(dependencyPatchPolicyService.remove).toHaveBeenCalledWith(
                'org-123',
                'policy-123',
                mockUser
            );
        });

        it('should return empty object on successful removal', async () => {
            mockDependencyPatchPolicyService.remove.mockResolvedValue(undefined);

            const result = await controller.remove(mockUser, 'org-123', 'policy-123');

            expect(result).toEqual({});
        });

        it('should handle different organization and policy IDs', async () => {
            mockDependencyPatchPolicyService.remove.mockResolvedValue(undefined);

            await controller.remove(mockUser, 'org-789', 'policy-456');

            expect(dependencyPatchPolicyService.remove).toHaveBeenCalledWith(
                'org-789',
                'policy-456',
                mockUser
            );
        });
    });
});
