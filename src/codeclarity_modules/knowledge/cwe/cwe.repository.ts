import { CWE } from 'src/codeclarity_modules/knowledge/cwe/cwe.entity';
import { EntityNotFound } from 'src/types/error.types';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class CWERepository {
    constructor(
        @InjectRepository(CWE, 'knowledge')
        private cweRepository: Repository<CWE>
    ) {}

    async getCWE(cweId: string): Promise<CWE> {
        const cwe = await this.getCWEWithoutFailing(cweId);
        if (!cwe) {
            throw new EntityNotFound();
        }
        return cwe;
    }

    async getCWEWithoutFailing(cweId: string): Promise<CWE | null> {
        return this.cweRepository.findOne({
            where: {
                cwe_id: cweId
            }
        });
    }
}
