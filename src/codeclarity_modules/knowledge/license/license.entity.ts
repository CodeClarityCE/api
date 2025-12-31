import { ApiProperty } from "@nestjs/swagger";
import { Expose } from "class-transformer";
import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("licenses")
export class License {
  @PrimaryGeneratedColumn("uuid")
  @ApiProperty()
  @Expose()
  id!: string;

  @Column({
    length: 250,
    nullable: true,
  })
  @Index("idx_license_name")
  @ApiProperty()
  @Expose()
  name!: string;

  @Column({
    length: 250,
    nullable: true,
  })
  @ApiProperty()
  @Expose()
  reference!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  isDeprecatedLicenseId!: boolean;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  detailsUrl!: string;

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  referenceNumber!: number;

  @Column({ nullable: true })
  @Index({ unique: true })
  @ApiProperty()
  @Expose()
  licenseId!: string;

  @Column("simple-array", { nullable: true })
  @ApiProperty()
  @Expose()
  seeAlso!: string[];

  @Column({ nullable: true })
  @ApiProperty()
  @Expose()
  isOsiApproved!: boolean;

  @Column("jsonb", { nullable: true })
  @ApiProperty()
  @Expose()
  details!: Details;
}

interface Details {
  crossRef: CrossRef[];
  isDeprecatedLicenseId: boolean;
  isOsiApproved: boolean;
  licenseId: string;
  licenseText: string;
  licenseTextHtml: string;
  licenseTextNormalized: string;
  licenseTextNormalizedDigest: string;
  name: string;
  seeAlso: string[];
  standardLicenseTemplate: string;
  description: string;
  classification: string;
  licenseProperties: LicenseProperties;
}

interface LicenseProperties {
  permissions: string[];
  conditions: string[];
  limitations: string[];
}

interface CrossRef {
  IsLive: boolean;
  IsValid: boolean;
  IsWayBackLink: boolean;
  Match: string;
  Order: number;
  Timestamp: Date;
  URL: string;
}
