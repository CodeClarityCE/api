import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";

import { Analysis } from "../../base_modules/analyses/analysis.entity";
import { Organization } from "../../base_modules/organizations/organization.entity";
import { User } from "../../base_modules/users/users.entity";

// The join table between policies and the analyses they apply to.
export const POLICY_ANALYSES_TABLE = "policy_analyses_analysis";

export enum PolicyType {
  LICENSE_POLICY = "LICENSE_POLICY",
  VULNERABILITY_POLICY = "VULNERABILITY_POLICY",
}

@Entity()
export class Policy {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  @Column()
  description!: string;

  @Column("jsonb")
  content!: string[];

  @Column()
  policy_type!: PolicyType;

  @Column()
  default!: boolean;

  @Column("timestamptz")
  created_on!: Date;

  // Foreign keys
  @ManyToMany(() => Organization, (organization) => organization.policies)
  organizations!: Relation<Organization[]>;

  @ManyToOne(() => User, (user) => user.policies)
  created_by!: Relation<User>;

  @ManyToMany(() => Analysis, (analysis) => analysis.policies)
  @JoinTable({ name: POLICY_ANALYSES_TABLE })
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

/** Maps a policy to its API shape, with the creator as an email or "". */
export function toPolicyFrontend(policy: Policy): PolicyFrontend {
  return {
    id: policy.id,
    name: policy.name,
    description: policy.description,
    default: policy.default,
    content: policy.content,
    created_on: policy.created_on,
    created_by: policy.created_by?.email || "",
    policy_type: policy.policy_type,
  };
}
