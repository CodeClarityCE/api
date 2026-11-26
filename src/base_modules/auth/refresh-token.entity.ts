import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";

import type { User } from "../users/users.entity";

/** One refresh token of a sign-in; only its hash is stored. */
@Entity()
export class RefreshToken {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // SHA-256 of the token, in hex.
  @Column("char", { length: 64, unique: true })
  token_hash!: string;

  // Shared by every token rotated from one sign-in.
  @Index()
  @Column("uuid")
  family_id!: string;

  @ManyToOne("User", { onDelete: "CASCADE", nullable: false })
  user!: Relation<User>;

  @Index()
  @Column("uuid")
  userId!: string;

  @Column("timestamptz")
  created_on!: Date;

  // Seven days after the sign-in; rotation keeps it.
  @Column("timestamptz")
  expires_on!: Date;

  // Set when the token is rotated; a second use revokes the family.
  @Column("timestamptz", { nullable: true })
  used_on!: Date | null;

  @Column("timestamptz", { nullable: true })
  revoked_on!: Date | null;
}
