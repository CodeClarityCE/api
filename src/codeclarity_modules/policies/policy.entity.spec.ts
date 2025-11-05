
import { Analysis } from '../../base_modules/analyses/analysis.entity';
import { Organization } from '../../base_modules/organizations/organization.entity';
import { User } from '../../base_modules/users/users.entity';

import { Policy, PolicyType } from './policy.entity';
import type { PolicyFrontend } from './policy.entity';

describe('Policy Entity', () => {
    let policy: Policy;

    beforeEach(() => {
        policy = new Policy();
    });

    it('should create an instance', () => {
        expect(policy).toBeDefined();
        expect(policy).toBeInstanceOf(Policy);
    });

    it('should have all required properties when populated', () => {
        // Initialize the policy with test data
        policy.id = 'test-id';
        policy.name = 'test-name';
        policy.description = 'test-description';
        policy.content = [];
        policy.policy_type = PolicyType.LICENSE_POLICY;
        policy.default = false;
        policy.created_on = new Date();
        policy.organizations = [] as any; // Initialize organizations
        policy.created_by = {} as any; // Initialize created_by
        policy.analyses = [] as any; // Initialize analyses

        expect(policy).toHaveProperty('id');
        expect(policy).toHaveProperty('name');
        expect(policy).toHaveProperty('description');
        expect(policy).toHaveProperty('content');
        expect(policy).toHaveProperty('policy_type');
        expect(policy).toHaveProperty('default');
        expect(policy).toHaveProperty('created_on');
        expect(policy).toHaveProperty('organizations');
        expect(policy).toHaveProperty('created_by');
        expect(policy).toHaveProperty('analyses');
    });

    it('should allow setting basic properties', () => {
        const testData = {
            id: 'policy-uuid',
            name: 'Test License Policy',
            description: 'A test policy for license compliance',
            content: ['MIT', 'Apache-2.0', 'BSD-3-Clause'],
            policy_type: PolicyType.LICENSE_POLICY,
            default: false,
            created_on: new Date('2024-01-01T00:00:00.000Z')
        };

        Object.assign(policy, testData);

        expect(policy.id).toBe(testData.id);
        expect(policy.name).toBe(testData.name);
        expect(policy.description).toBe(testData.description);
        expect(policy.content).toEqual(testData.content);
        expect(policy.policy_type).toBe(testData.policy_type);
        expect(policy.default).toBe(testData.default);
        expect(policy.created_on).toEqual(testData.created_on);
    });

    it('should handle different policy types', () => {
        // Test LICENSE_POLICY
        policy.policy_type = PolicyType.LICENSE_POLICY;
        expect(policy.policy_type).toBe(PolicyType.LICENSE_POLICY);

        // Test DEP_UPGRADE_POLICY
        policy.policy_type = PolicyType.DEP_UPGRADE_POLICY;
        expect(policy.policy_type).toBe(PolicyType.DEP_UPGRADE_POLICY);
    });

    it('should handle content as string array', () => {
        // License policy content
        const licenseContent = ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'ISC'];
        policy.content = licenseContent;
        expect(policy.content).toEqual(licenseContent);
        expect(Array.isArray(policy.content)).toBe(true);

        // Dependency upgrade policy content
        const depContent = ['major', 'minor', 'patch'];
        policy.content = depContent;
        expect(policy.content).toEqual(depContent);
    });

    it('should handle default flag correctly', () => {
        // Not default policy
        policy.default = false;
        expect(policy.default).toBe(false);

        // Default policy
        policy.default = true;
        expect(policy.default).toBe(true);
    });

    it('should handle relationships', () => {
        const mockUser = new User();
        mockUser.id = 'user-123';

        const mockOrganization = new Organization();
        mockOrganization.id = 'org-123';

        const mockAnalysis = new Analysis();
        mockAnalysis.id = 'analysis-123';

        policy.created_by = mockUser;
        policy.organizations = [mockOrganization];
        policy.analyses = [mockAnalysis];

        expect(policy.created_by).toBe(mockUser);
        expect(policy.organizations).toEqual([mockOrganization]);
        expect(policy.analyses).toEqual([mockAnalysis]);
    });

    it('should handle multiple organizations', () => {
        const org1 = new Organization();
        org1.id = 'org-1';

        const org2 = new Organization();
        org2.id = 'org-2';

        const org3 = new Organization();
        org3.id = 'org-3';

        policy.organizations = [org1, org2, org3];

        expect(policy.organizations).toHaveLength(3);
        expect(policy.organizations).toContain(org1);
        expect(policy.organizations).toContain(org2);
        expect(policy.organizations).toContain(org3);
    });

    it('should handle multiple analyses', () => {
        const analysis1 = new Analysis();
        analysis1.id = 'analysis-1';

        const analysis2 = new Analysis();
        analysis2.id = 'analysis-2';

        policy.analyses = [analysis1, analysis2];

        expect(policy.analyses).toHaveLength(2);
        expect(policy.analyses).toContain(analysis1);
        expect(policy.analyses).toContain(analysis2);
    });

    it('should handle empty content array', () => {
        policy.content = [];
        expect(policy.content).toEqual([]);
        expect(Array.isArray(policy.content)).toBe(true);
        expect(policy.content).toHaveLength(0);
    });

    it('should handle long content arrays', () => {
        const longContent = Array.from({ length: 100 }, (_, i) => `license-${i}`);
        policy.content = longContent;

        expect(policy.content).toHaveLength(100);
        expect(policy.content[0]).toBe('license-0');
        expect(policy.content[99]).toBe('license-99');
    });

    it('should handle timestamp properly', () => {
        const now = new Date();
        policy.created_on = now;

        expect(policy.created_on).toBe(now);
        expect(policy.created_on instanceof Date).toBe(true);
    });

    it('should create license policy correctly', () => {
        policy.name = 'Permissive License Policy';
        policy.description = 'Only allow permissive licenses';
        policy.policy_type = PolicyType.LICENSE_POLICY;
        policy.content = ['MIT', 'Apache-2.0', 'BSD-3-Clause'];
        policy.default = true;

        expect(policy.policy_type).toBe(PolicyType.LICENSE_POLICY);
        expect(policy.content).toContain('MIT');
        expect(policy.default).toBe(true);
    });

    it('should create dependency upgrade policy correctly', () => {
        policy.name = 'Conservative Upgrade Policy';
        policy.description = 'Only allow minor and patch upgrades';
        policy.policy_type = PolicyType.DEP_UPGRADE_POLICY;
        policy.content = ['minor', 'patch'];
        policy.default = false;

        expect(policy.policy_type).toBe(PolicyType.DEP_UPGRADE_POLICY);
        expect(policy.content).toContain('minor');
        expect(policy.content).toContain('patch');
        expect(policy.content).not.toContain('major');
        expect(policy.default).toBe(false);
    });
});

describe('PolicyFrontend Interface', () => {
    it('should match the expected structure', () => {
        const policyFrontend: PolicyFrontend = {
            id: 'policy-123',
            name: 'Test Policy',
            description: 'Test description',
            policy_type: PolicyType.LICENSE_POLICY,
            default: false,
            created_by: 'user-123',
            created_on: new Date('2024-01-01'),
            content: ['MIT', 'Apache-2.0']
        };

        expect(policyFrontend.id).toBe('policy-123');
        expect(policyFrontend.name).toBe('Test Policy');
        expect(policyFrontend.description).toBe('Test description');
        expect(policyFrontend.policy_type).toBe(PolicyType.LICENSE_POLICY);
        expect(policyFrontend.default).toBe(false);
        expect(policyFrontend.created_by).toBe('user-123');
        expect(policyFrontend.created_on).toEqual(new Date('2024-01-01'));
        expect(policyFrontend.content).toEqual(['MIT', 'Apache-2.0']);
    });

    it('should handle different policy types in frontend', () => {
        const licensePolicyFrontend: PolicyFrontend = {
            id: 'policy-1',
            name: 'License Policy',
            description: 'License policy',
            policy_type: PolicyType.LICENSE_POLICY,
            default: true,
            created_by: 'user-1',
            created_on: new Date(),
            content: ['MIT']
        };

        const depPolicyFrontend: PolicyFrontend = {
            id: 'policy-2',
            name: 'Dependency Policy',
            description: 'Dependency policy',
            policy_type: PolicyType.DEP_UPGRADE_POLICY,
            default: false,
            created_by: 'user-2',
            created_on: new Date(),
            content: ['major', 'minor']
        };

        expect(licensePolicyFrontend.policy_type).toBe(PolicyType.LICENSE_POLICY);
        expect(depPolicyFrontend.policy_type).toBe(PolicyType.DEP_UPGRADE_POLICY);
    });
});

describe('PolicyType Enum', () => {
    it('should have correct enum values', () => {
        expect(PolicyType.LICENSE_POLICY).toBe('LICENSE_POLICY');
        expect(PolicyType.DEP_UPGRADE_POLICY).toBe('DEP_UPGRADE_POLICY');
    });

    it('should have exactly three policy types', () => {
        const policyTypes = Object.values(PolicyType);
        expect(policyTypes).toHaveLength(3);
        expect(policyTypes).toContain('LICENSE_POLICY');
        expect(policyTypes).toContain('DEP_UPGRADE_POLICY');
        expect(policyTypes).toContain('VULNERABILITY_POLICY');
    });
});
