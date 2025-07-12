import { Test, TestingModule } from '@nestjs/testing';
import { DependencyPatchPolicyService } from './dependencyPatch.service';
import { AuthenticatedUser, ROLE } from 'src/base_modules/auth/auth.types';
import { SortDirection } from 'src/types/sort.types';
import {
    DependencyPatchPolicyCreateBody,
    DependencyPatchPolicyPatchBody,
    FullFixVersionSelection,
    PartialFixVersionSelection
} from './dependencyPatchPolicy.types';

describe('DependencyPatchPolicyService', () => {
    let service: DependencyPatchPolicyService;

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
        name: 'Updated Policy Name'
    };

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [DependencyPatchPolicyService]
        }).compile();

        service = module.get<DependencyPatchPolicyService>(DependencyPatchPolicyService);
    });

    describe('create', () => {
        it('should throw not implemented error', async () => {
            await expect(service.create('org-123', mockCreateBody, mockUser)).rejects.toThrow(
                'Method not implemented.'
            );
        });
    });

    describe('get', () => {
        it('should throw not implemented error', async () => {
            await expect(service.get('org-123', 'policy-123', mockUser)).rejects.toThrow(
                'Method not implemented.'
            );
        });
    });

    describe('getMany', () => {
        it('should throw not implemented error', async () => {
            await expect(service.getMany('org-123', mockUser)).rejects.toThrow(
                'Method not implemented.'
            );
        });

        it('should throw not implemented error with search parameters', async () => {
            await expect(
                service.getMany('org-123', mockUser, 'search', 'name', SortDirection.ASC)
            ).rejects.toThrow('Method not implemented.');
        });
    });

    describe('update', () => {
        it('should throw not implemented error', async () => {
            await expect(
                service.update('org-123', 'policy-123', mockPatchBody, mockUser)
            ).rejects.toThrow('Method not implemented.');
        });
    });

    describe('remove', () => {
        it('should throw not implemented error', async () => {
            await expect(service.remove('org-123', 'policy-123', mockUser)).rejects.toThrow(
                'Method not implemented.'
            );
        });
    });
});
