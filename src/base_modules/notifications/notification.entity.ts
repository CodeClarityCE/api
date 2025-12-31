import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  Relation,
} from "typeorm";

import type { User } from "../users/users.entity";

enum NotificationType {
  Info = "info",
  Warning = "warning",
  Error = "error",
}

enum NotificationContentType {
  NewVersion = "new_version",
  FixAvailable = "fix_available",
  VulnSummary = "vuln_summary",
}

@Entity()
export class Notification {
  @ApiProperty()
  @Expose()
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ApiProperty()
  @Expose()
  @Column({ length: 100 })
  title!: string;

  @ApiProperty()
  @Expose()
  @Column("text")
  description!: string;

  @ApiProperty()
  @Expose()
  @Column("jsonb")
  content!: Record<string, unknown>;

  @ApiProperty()
  @Expose()
  @Column()
  type!: NotificationType;

  @ApiProperty()
  @Expose()
  @Column()
  content_type!: NotificationContentType;

  // Users who have this notification
  @ManyToMany("User", "notifications")
  @JoinTable()
  users!: Relation<User[]>;
}
