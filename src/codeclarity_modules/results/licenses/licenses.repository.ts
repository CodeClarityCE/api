import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
    Output as LicensesOutput,
    Status
} from 'src/codeclarity_modules/results/licenses/licenses.types';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { PluginFailed, PluginResultNotAvailable } from 'src/types/error.types';
import { Repository } from 'typeorm';

@Injectable()
export class LicensesRepository {
    constructor(
        @InjectRepository(Result, 'codeclarity')
        private resultRepository: Repository<Result>
    ) {}

    async getLicensesResult(analysis_id: string): Promise<LicensesOutput> {
        const result = await this.resultRepository.findOne({
            relations: { analysis: true },
            where: {
                analysis: {
                    id: analysis_id
                },
                plugin: 'js-license'
            },
            order: {
                analysis: {
                    created_on: 'DESC'
                }
            },
            cache: true
        });
        if (!result) {
            throw new PluginResultNotAvailable();
        }

        const licenses: LicensesOutput = result.result as unknown as LicensesOutput;
        if (licenses.analysis_info.status === Status.Failure) {
            throw new PluginFailed();
        }
        return licenses;
    }
}
