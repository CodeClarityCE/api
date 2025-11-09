import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Result } from 'src/codeclarity_modules/results/result.entity';
import { Dependency } from 'src/codeclarity_modules/results/sbom/sbom.types';
import {
    Output as VulnsOutput,
    Vulnerability,
    Status
} from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types';
import { PluginFailed, PluginResultNotAvailable, UnknownWorkspace } from 'src/types/error.types';
import { Repository } from 'typeorm';

@Injectable()
export class VulnerabilitiesUtilsService {
    constructor(
        @InjectRepository(Result, 'codeclarity')
        private resultRepository: Repository<Result>
    ) {}

    async getVulnsResult(analysis_id: string): Promise<VulnsOutput> {
        // Try to get results from the multi-language vuln-finder plugin first
        let result = await this.resultRepository.findOne({
            relations: { analysis: true },
            where: {
                analysis: {
                    id: analysis_id
                },
                plugin: 'vuln-finder'
            },
            order: {
                analysis: {
                    created_on: 'DESC'
                }
            },
            cache: true
        });

        // Fall back to js-vuln-finder for backward compatibility
        result ??= await this.resultRepository.findOne({
                relations: { analysis: true },
                where: {
                    analysis: {
                        id: analysis_id
                    },
                    plugin: 'js-vuln-finder'
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

        const vulns: VulnsOutput = result.result as unknown as VulnsOutput;
        if (vulns.analysis_info.status === Status.Failure) {
            throw new PluginFailed();
        }
        return vulns;
    }

    async getFindingsData(
        analysis_id: string,
        workspace: string,
        ecosystem_filter?: string
    ): Promise<Vulnerability[]> {
        const findings: VulnsOutput = await this.getVulnsResult(analysis_id);

        // Validate that the workspace exists
        if (!(workspace in findings.workspaces)) {
            throw new UnknownWorkspace();
        }

        let vulnerabilities = findings.workspaces[workspace]!.Vulnerabilities ?? [];

        // Apply ecosystem filter if specified
        if (ecosystem_filter) {
            vulnerabilities = this.filterVulnerabilitiesByEcosystem(
                vulnerabilities,
                ecosystem_filter
            );
        }

        // // Attach sbom info
        // try {
        //     const sbomInfo: SbomOutput = await getSbomResult(analysis_id);
        //     // Validate that the workspace exists
        //     if (workspace in sbomInfo.workspaces) {
        //         for (const vuln of vulnerabilities) {
        //             if (vuln.AffectedDependency in sbomInfo.workspaces[workspace].dependencies)
        //                 vuln.AffectedDependencyObject =
        //                     sbomInfo.workspaces[workspace].dependencies[vuln.AffectedDependency];
        //         }
        //     }
        // } catch (err) {
        //     // Nothing to throw here
        // }

        // // Attach patches info if the service has finished
        // try {
        //     const patches: PatchesOutput = await getPatchingResult(analysis_id);

        //     // Validate that the workspace exists
        //     if (workspace in patches.workspaces) {
        //         const workspaceData = patches.workspaces[workspace];
        //         for (const vuln of vulnerabilities) {
        //             vuln.PatchType =
        //                 workspaceData.VulnerabilityPatchInfo[vuln.Vulnerability].patch_type;
        //         }
        //     }
        // } catch (err) {
        //     // Nothing to throw here
        // }

        return vulnerabilities;
    }

    async getImportPaths(
        dependenciesMap: Record<string, Dependency>,
        dependency: string,
        currentPath: string,
        paths: string[] = new Array<string>(),
        parentsSet = new Set<string>()
    ): Promise<string[]> {
        const currentDependency = dependenciesMap[dependency];
        console.log(currentDependency);

        // If the dependency is already in the path, we stop the recursion
        if (parentsSet.has(dependency) || currentPath.includes(dependency)) {
            parentsSet.clear();
            return paths;
        }

        // currentPath = `${currentDependency.key} -> ${currentPath}`;

        // if (currentDependency.parents.length === 0) {
        //     if (currentPath.endsWith(' -> ')) currentPath = currentPath.slice(0, -4);
        //     paths.push(currentPath);
        //     parentsSet.clear();
        //     return paths;
        // } else if (currentDependency.is_direct_count > 0) {
        //     // If the dependency is direct, we add it to the path too
        //     if (currentPath.endsWith(' -> ')) currentPath = currentPath.slice(0, -4);
        //     paths.push(currentPath);
        // }

        // for (const dep of currentDependency.parents) {
        //     parentsSet.add(dependency);
        //     await getImportPaths(dependenciesMap, dep, currentPath, paths, parentsSet);
        // }

        return paths;
    }

    /**
     * Filters vulnerabilities by ecosystem (e.g., 'npm', 'packagist')
     * Uses package naming patterns to determine ecosystem
     */
    private filterVulnerabilitiesByEcosystem(
        vulnerabilities: Vulnerability[],
        ecosystem: string
    ): Vulnerability[] {
        return vulnerabilities.filter((vuln) => {
            const packageName = vuln.AffectedDependency;
            const detectedEcosystem = this.detectPackageEcosystem(packageName);
            return detectedEcosystem === ecosystem;
        });
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
