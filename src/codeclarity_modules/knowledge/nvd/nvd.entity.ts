import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

@Entity('nvd')
export class NVD {
    @PrimaryGeneratedColumn('uuid')
    @ApiProperty()
    @Expose()
    id: string;

    @Column()
    @Index({ unique: true })
    @ApiProperty()
    @Expose()
    nvd_id: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    sourceIdentifier: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    published: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    lastModified: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    vulnStatus: string;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    descriptions: any;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    vlai_score: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    vlai_confidence: number;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    metrics: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    weaknesses: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    configurations: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    affectedFlattened: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    affected: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    references: any;
}
