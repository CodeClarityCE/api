import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

@Entity('osv')
export class OSV {
    @PrimaryGeneratedColumn('uuid')
    @ApiProperty()
    @Expose()
    id: string;

    @Column()
    @Index({ unique: true })
    @ApiProperty()
    @Expose()
    osv_id: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    schema_version: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    vlai_score: string;

    @Column('float', { nullable: true })
    @ApiProperty()
    @Expose()
    vlai_confidence: number;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    modified: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    published: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    withdrawn: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    summary: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    details: string;

    @Column({ nullable: true })
    @ApiProperty()
    @Expose()
    cve: string;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    aliases: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    related: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    severity: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    affected: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    references: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    credits: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    database_specific: any;

    @Column('jsonb', { nullable: true })
    @ApiProperty()
    @Expose()
    cwes: any;
}
