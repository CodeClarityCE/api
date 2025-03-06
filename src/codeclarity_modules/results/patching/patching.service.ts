import { Injectable } from '@nestjs/common';
import { AnalysisResultsService } from '../results.service';
import { AuthenticatedUser } from 'src/base_modules/auth/auth.types';
import { Output as PatchesOutput, Workspace } from 'src/codeclarity_modules/results/patching/patching.types';
import { Output as VulnsOuptut } from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types';
import { Output as SbomOutput } from 'src/codeclarity_modules/results/sbom/sbom.types';
import { UnknownWorkspace } from 'src/types/errors/types';
import { getPatchingResult } from './utils/utils';
import { getSbomResult } from '../sbom/utils/utils';
import { getVulnsResult } from '../vulnerabilities/utils/utils';
import { AnalysisStats, newAnalysisStats } from 'src/codeclarity_modules/results/patching/patching2.types';
import { StatusResponse } from 'src/codeclarity_modules/results/status.types';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Result } from 'src/codeclarity_modules/results/result.entity';

@Injectable()
export class PatchingService {

    constructor(
        private readonly analysisResultsService: AnalysisResultsService,
        @InjectRepository(Result, 'codeclarity')
        private resultRepository: Repository<Result>
    ) {}

    async getPatches(
        orgId: string,
        projectId: string,
        analysisId: string,
        user: AuthenticatedUser,
        workspace: string,
        page: number | undefined,
        entries_per_page: number | undefined,
        sort_by: string | undefined,
        sort_direction: string | undefined,
        active_filters_string: string | undefined,
        search_key: string | undefined
    ): Promise<Workspace> {
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        let active_filters: string[] = [];
        if (active_filters_string != null)
            active_filters = active_filters_string.replace('[', '').replace(']', '').split(',');

        const patchesOutput: PatchesOutput = await getPatchingResult(
            analysisId,
            this.resultRepository
        );
        // const sbomOutput: SbomOutput = await getSbomResult(analysisId);
        const vulnOutput: VulnsOuptut = await getVulnsResult(analysisId, this.resultRepository);

        if (!(workspace in patchesOutput.workspaces)) {
            throw new UnknownWorkspace();
        }

        return patchesOutput.workspaces[workspace];
    }

    async getPatchedManifest(
        orgId: string,
        projectId: string,
        analysisId: string,
        user: AuthenticatedUser,
        workspace: string
    ): Promise<any> {
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        const patchesOutput: PatchesOutput = await getPatchingResult(
            analysisId,
            this.resultRepository
        );
        const sbomOutput: SbomOutput = await getSbomResult(analysisId, this.resultRepository);

        if (!(workspace in patchesOutput.workspaces)) {
            throw new UnknownWorkspace();
        }

        if (
            sbomOutput.analysis_info.package_manager == 'NPM' ||
            sbomOutput.analysis_info.package_manager == 'YARN' ||
            sbomOutput.analysis_info.package_manager == 'PNPM'
        ) {
            return sbomOutput.analysis_info;
        }

        // Add other languages / package managers here

        return {};
    }

    async getStats(
        orgId: string,
        projectId: string,
        analysisId: string,
        user: AuthenticatedUser,
        workspace: string
    ): Promise<AnalysisStats> {
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        function getContinuousFromDiscreteCIA(metric: string): number {
            if (metric == 'COMPLETE') return 1.0; // CVSS 2
            if (metric == 'PARTIAL') return 0.5; // CVSS 2
            if (metric == 'HIGH') return 1.0; // CVSS 3
            if (metric == 'LOW') return 0.5; // CVSS 3
            return 0.0;
        }

        const patchesOutput: PatchesOutput = await getPatchingResult(
            analysisId,
            this.resultRepository
        );
        // const sbomOutput: SbomOutput = await getSbomResult(analysisId);
        const vulnsOutput: VulnsOuptut = await getVulnsResult(analysisId, this.resultRepository);

        if (!(workspace in patchesOutput.workspaces)) {
            throw new UnknownWorkspace();
        }

        const stats: AnalysisStats = newAnalysisStats();

        return stats;
    }

    // async getPatchTree(
    //     orgId: string,
    //     projectId: string,
    //     analysisId: string,
    //     user: AuthenticatedUser,
    //     workspace: string
    // ): Promise<{ [key: string]: PatchOccurenceInfo }> {
    //     await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

    //     const patchesOutput: PatchesOutput = await getPatchingResult(analysisId);
    //     const sbomOutput: SbomOutput = await getSbomResult(analysisId);

    //     if (!(workspace in patchesOutput.workspaces)) {
    //         throw new UnknownWorkspace();
    //     }

    //     if (
    //         sbomOutput.analysis_info.package_manager == 'NPM' ||
    //         sbomOutput.analysis_info.package_manager == 'YARN' ||
    //         sbomOutput.analysis_info.package_manager == 'PNPM'
    //     ) {
    //         return this.getPatchTreeJSEcosystem(patchesOutput, workspace);
    //     }

    //     // Add other languages / package managers here

    //     throw new Unsupported();
    // }

    // private async getPatchTreeJSEcosystem(
    //     patchesOutput: PatchesOutput,
    //     workspace: string
    // ): Promise<{ [key: string]: PatchOccurenceInfo }> {
    //     const overall_paths: { [key: string]: PatchOccurenceInfo } = {};
    //     // for (const [key, patch] of Object.entries(
    //     //     patchesOutput.workspaces[workspace].vulnerability_patch_info
    //     // )) {
    //     //     if (patch && patch.patches) {
    //     //         const paths: string[][] = [];
    //     //         const patched_paths: string[][] = [];
    //     //         const unpatched_paths: string[][] = [];
    //     //         const introduced_paths: string[][] = [];
    //     //         for (const [, directDepPatchInfo] of Object.entries(patch.patches)) {
    //     //             if ('patched_occurences' in directDepPatchInfo) {
    //     //                 paths.push(...directDepPatchInfo['patched_occurences'].Paths);
    //     //                 patched_paths.push(...directDepPatchInfo['patched_occurences'].Paths);
    //     //             }
    //     //             if ('unpatched_occurences' in directDepPatchInfo) {
    //     //                 paths.push(...directDepPatchInfo['unpatched_occurences'].Paths);
    //     //                 unpatched_paths.push(...directDepPatchInfo['unpatched_occurences'].Paths);
    //     //             }
    //     //             if ('introduced_occurences' in directDepPatchInfo) {
    //     //                 paths.push(...directDepPatchInfo['introduced_occurences'].Paths);
    //     //                 introduced_paths.push(...directDepPatchInfo['introduced_occurences'].Paths);
    //     //             }
    //     //         }
    //     //         overall_paths[key] = {
    //     //             affected_deps: patch.affected_deps,
    //     //             vulnerability_id: key,
    //     //             all_occurences: paths,
    //     //             patched_occurences: patched_paths,
    //     //             unpatched_occurences: unpatched_paths,
    //     //             introduced_occurences: introduced_paths
    //     //         };
    //     //     }
    //     // }

    //     return overall_paths;
    // }

    async getStatus(
        orgId: string,
        projectId: string,
        analysisId: string,
        user: AuthenticatedUser
    ): Promise<StatusResponse> {
        await this.analysisResultsService.checkAccess(orgId, projectId, analysisId, user);

        const patchesOutput: PatchesOutput = await getPatchingResult(
            analysisId,
            this.resultRepository
        );

        if (patchesOutput.analysis_info.private_errors.length) {
            return {
                public_errors: patchesOutput.analysis_info.public_errors,
                private_errors: patchesOutput.analysis_info.private_errors,
                stage_start: patchesOutput.analysis_info.analysis_start_time,
                stage_end: patchesOutput.analysis_info.analysis_end_time
            };
        }
        return {
            public_errors: [],
            private_errors: [],
            stage_start: patchesOutput.analysis_info.analysis_start_time,
            stage_end: patchesOutput.analysis_info.analysis_end_time
        };
    }
}
