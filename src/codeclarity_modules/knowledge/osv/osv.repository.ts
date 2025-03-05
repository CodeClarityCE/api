import { Injectable } from '@nestjs/common';
import { EntityNotFound } from 'src/types/errors/types';
import { OSV } from 'src/entity/knowledge/OSV';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class OSVRepository {
    constructor(
        @InjectRepository(OSV, 'knowledge')
        private osvRepository: Repository<OSV>
    ) {}

    async getVulnGHSA(ghsa: string): Promise<OSV> {
        const osv = await this.osvRepository.findOne({
            where: {
                osv_id: ghsa
            }
        });
        if (!osv) {
            throw new EntityNotFound();
        }
        return osv;
    }

    async getVulnCVE(cve: string): Promise<OSV> {
        const osv = await this.osvRepository.findOne({
            where: {
                cve: cve
            }
        });
        if (!osv) {
            throw new EntityNotFound();
        }
        return osv;
    }
}
