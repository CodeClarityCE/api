import { PluginFailed, PluginResultNotAvailable } from 'src/types/errors/types';
import { Output as LicensesOutput } from 'src/types/entities/services/Licenses';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { Status } from 'src/types/apiResponses';
import { Repository } from 'typeorm';

export async function getLicensesResult(
    analysis_id: string,
    resultRepository: Repository<Result>
): Promise<LicensesOutput> {
    const result = await resultRepository.findOne({
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
    if (licenses.analysis_info.status == Status.Failure) {
        throw new PluginFailed();
    }
    return licenses;
}
