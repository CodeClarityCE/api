import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { Output as SBOMOutput, Status } from 'src/codeclarity_modules/results/sbom/sbom.types';
import { PluginFailed, PluginResultNotAvailable } from 'src/types/error.types';
import { Repository, In } from 'typeorm';

@Injectable()
export class SBOMRepository {
    constructor(
        @InjectRepository(Result, 'codeclarity')
        private resultRepository: Repository<Result>
    ) {}

    async getSbomResult(analysis_id: string): Promise<SBOMOutput> {
        // Look for either js-sbom or php-sbom results
        const result = await this.resultRepository.findOne({
            relations: { analysis: true },
            where: {
                analysis: {
                    id: analysis_id
                },
                plugin: In(['js-sbom', 'php-sbom'])
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

        const sbom: SBOMOutput = result.result as unknown as SBOMOutput;
        if (sbom.analysis_info.status === Status.Failure) {
            throw new PluginFailed();
        }
        return sbom;
    }
}
