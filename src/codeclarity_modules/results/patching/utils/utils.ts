import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Output as PatchesOutput } from 'src/codeclarity_modules/results/patching/patching.types';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { Status } from 'src/types/apiResponses.types';
import { PluginFailed, PluginResultNotAvailable } from 'src/types/error.types';
import { Repository } from 'typeorm';

@Injectable()
export class PatchingUtilsService {
    constructor(
        @InjectRepository(Result, 'codeclarity')
        private resultRepository: Repository<Result>
    ) {}

    async getPatchingResult(analysis_id: string): Promise<PatchesOutput> {
        const result = await this.resultRepository.findOne({
            relations: { analysis: true },
            where: {
                analysis: {
                    id: analysis_id
                },
                plugin: 'js-patching'
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

        const patches: PatchesOutput = result.result as unknown as PatchesOutput;
        if (patches.analysis_info.status === Status.Failure) {
            throw new PluginFailed();
        }
        return patches;
    }
}
