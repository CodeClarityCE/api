import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

@Entity('epss')
export class EPSS {
    @PrimaryGeneratedColumn('uuid')
    @ApiProperty()
    @Expose()
    id: string;

    @Column()
    @ApiProperty()
    @Expose()
    @Index({ unique: true })
    cve: string;

    @Column('float', { nullable: true })
    @ApiProperty()
    @Expose()
    score: number;

    @Column('float', { nullable: true })
    @ApiProperty()
    @Expose()
    percentile: number;
}
