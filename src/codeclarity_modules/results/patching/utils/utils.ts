import { PluginFailed, PluginResultNotAvailable } from 'src/types/errors/types';
import { Output as PatchesOutput } from 'src/types/entities/services/Patching';
import { Status } from 'src/types/apiResponses';
import { Result } from 'src/entity/codeclarity/Result';
import { Repository } from 'typeorm';

export async function getPatchingResult(
    analysis_id: string,
    resultRepository: Repository<Result>
): Promise<PatchesOutput> {
    const result = await resultRepository.findOne({
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
    if (patches.analysis_info.status == Status.Failure) {
        throw new PluginFailed();
    }
    return patches;
}
