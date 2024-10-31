import { Injectable } from '@nestjs/common';
import { EntityNotFound } from 'src/types/errors/types';
import { NVD } from 'src/entity/knowledge/NVD';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class NVDRepository {
    constructor(
        @InjectRepository(NVD, 'knowledge')
        private nvdRepository: Repository<NVD>
    ) {}

    async getVuln(cve: string): Promise<NVD> {
        const nvd = await this.nvdRepository.findOne({
            where: {
                nvd_id: cve
            }
        });
        if (!nvd) {
            throw new EntityNotFound();
        }
        return nvd;
    }
}