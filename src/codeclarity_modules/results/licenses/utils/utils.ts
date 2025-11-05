import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
    Output as LicensesOutput,
    WorkSpaceLicenseInfo
} from 'src/codeclarity_modules/results/licenses/licenses.types';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { Status } from 'src/types/apiResponses.types';
import { PluginFailed, PluginResultNotAvailable } from 'src/types/error.types';
import { Repository } from 'typeorm';

@Injectable()
export class LicensesUtilsService {
    constructor(
        @InjectRepository(Result, 'codeclarity')
        private resultRepository: Repository<Result>
    ) {}

    async getLicensesResult(analysis_id: string): Promise<LicensesOutput> {
        // Try to get results from the multi-language license-finder plugin first
        let result = await this.resultRepository.findOne({
            relations: { analysis: true },
            where: {
                analysis: {
                    id: analysis_id
                },
                plugin: 'license-finder'
            },
            order: {
                analysis: {
                    created_on: 'DESC'
                }
            },
            cache: true
        });

        // Fall back to js-license for backward compatibility
        if (!result) {
            result = await this.resultRepository.findOne({
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
        }

        if (!result) {
            throw new PluginResultNotAvailable();
        }

        const licenses: LicensesOutput = result.result as unknown as LicensesOutput;
        if (licenses.analysis_info.status === Status.Failure) {
            throw new PluginFailed();
        }
        return licenses;
    }

    /**
     * Filters license dependencies by ecosystem (e.g., 'npm', 'packagist')
     * Uses package naming patterns to determine ecosystem
     */
    filterLicensesByEcosystem(
        licensesOutput: LicensesOutput,
        ecosystem: string,
        workspace: string
    ): LicensesOutput {
        const workspaceData = licensesOutput.workspaces[workspace]!;
        const filteredWorkspace: WorkSpaceLicenseInfo = {
            LicensesDepMap: {},
            NonSpdxLicensesDepMap: {},
            LicenseComplianceViolations: workspaceData.LicenseComplianceViolations,
            DependencyInfo: workspaceData.DependencyInfo
        };

        const filtered: LicensesOutput = {
            ...licensesOutput,
            workspaces: {
                ...licensesOutput.workspaces,
                [workspace]: filteredWorkspace
            }
        };

        // Filter LicensesDepMap
        for (const [licenseId, dependencies] of Object.entries(workspaceData.LicensesDepMap)) {
            const filteredDeps = dependencies.filter(
                (dep) => this.detectPackageEcosystem(dep) === ecosystem
            );
            if (filteredDeps.length > 0) {
                filtered.workspaces[workspace]!.LicensesDepMap[licenseId] = filteredDeps;
            }
        }

        // Filter NonSpdxLicensesDepMap
        for (const [licenseId, dependencies] of Object.entries(
            workspaceData.NonSpdxLicensesDepMap
        )) {
            const filteredDeps = dependencies.filter(
                (dep) => this.detectPackageEcosystem(dep) === ecosystem
            );
            if (filteredDeps.length > 0) {
                filtered.workspaces[workspace]!.NonSpdxLicensesDepMap[licenseId] = filteredDeps;
            }
        }

        return filtered;
    }

    /**
     * Detects the ecosystem of a package based on naming patterns
     */
    private detectPackageEcosystem(packageName: string): string {
        // PHP packages often have vendor/package format
        if (packageName.includes('/') && !packageName.startsWith('@')) {
            return 'packagist';
        }

        // Scoped npm packages start with @
        if (packageName.startsWith('@')) {
            return 'npm';
        }

        // Most other single-name packages are likely npm
        // This is a heuristic that may need refinement
        return 'npm';
    }
}
