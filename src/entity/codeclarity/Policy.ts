import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToMany,
    Relation,
    JoinTable,
    ManyToOne
} from 'typeorm';
import { Organization } from '../../base_modules/organizations/organization.entity';
import { Analysis } from './Analysis';
import { User } from '../../base_modules/users/users.entity';

export enum PolicyType {
    LICENSE_POLICY = 'LICENSE_POLICY',
    DEP_UPGRADE_POLICY = 'DEP_UPGRADE_POLICY'
}

@Entity()
export class Policy {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    name: string;

    @Column()
    description: string;

    @Column('jsonb')
    content: string[];

    @Column()
    policy_type: PolicyType;

    @Column()
    default: boolean;

    @Column('timestamptz')
    created_on: Date;

    // Foreign keys
    @ManyToMany(() => Organization, (organization) => organization.policies)
    organizations: Relation<Organization[]>;

    @ManyToOne(() => User, (user) => user.policies)
    created_by: Relation<User>;

    @ManyToMany(() => Analysis, (analysis) => analysis.policies)
    @JoinTable()
    analyses?: Relation<Analysis[]>;
}

export interface PolicyFrontend {
    id: string;
    name: string;
    description: string;
    policy_type: PolicyType;
    default: boolean;
    created_by: string;
    created_on: Date;
    content: string[];
}
