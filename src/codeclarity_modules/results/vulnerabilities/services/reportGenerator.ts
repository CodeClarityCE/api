// import { getVersionsSatisfyingConstraint } from 'src/codeclarity_modules/results/utils/utils';
import { CVSS2, CVSS3, CVSS31 } from 'src/codeclarity_modules/knowledge/cvss.types';
import { CWERepository } from 'src/codeclarity_modules/knowledge/cwe/cwe.repository';
import { FriendsOfPhp } from 'src/codeclarity_modules/knowledge/friendsofphp/friendsofphp.entity';
import { NVD } from 'src/codeclarity_modules/knowledge/nvd/nvd.entity';
import { NVDRepository } from 'src/codeclarity_modules/knowledge/nvd/nvd.repository';
import { OSV } from 'src/codeclarity_modules/knowledge/osv/osv.entity';
import { OSVRepository } from 'src/codeclarity_modules/knowledge/osv/osv.repository';
import { OWASPRepository } from 'src/codeclarity_modules/knowledge/owasp/owasp.repository';
import { OwaspTop10Info } from 'src/codeclarity_modules/knowledge/owasp/owasp.types';
import { Version } from 'src/codeclarity_modules/knowledge/package/package.entity';
import { PackageRepository } from 'src/codeclarity_modules/knowledge/package/package.repository';
import { VersionsRepository } from 'src/codeclarity_modules/knowledge/package/packageVersions.repository';
import { PatchInfo } from 'src/codeclarity_modules/results/patching/patching.types';
import { Dependency } from 'src/codeclarity_modules/results/sbom/sbom.types';
import {
    Vulnerability,
    AffectedInfo
} from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities.types';
import {
    VulnerabilityDetails,
    VulnerabilityInfo,
    VulnerableVersionInfo,
    DependencyInfo,
    CommonConsequencesInfo,
    WeaknessInfo,
    ReferenceInfo,
    SeverityInfo,
    OtherInfo
} from 'src/codeclarity_modules/results/vulnerabilities/vulnerabilities2.types';

import { Injectable } from '@nestjs/common';
import { satisfies } from 'semver';

abstract class BaseReportGenerator {
    patchesData!: PatchInfo;
    vulnsData!: Vulnerability;
    dependencyData?: Dependency;
    versions!: Version[];
    packageManager!: string;
    osvItem?: OSV;
    nvdItem?: NVD;

    readonly versionsRepository: VersionsRepository;
    readonly osvRepository: OSVRepository;
    readonly nvdRepository: NVDRepository;
    readonly cweRepository: CWERepository;
    readonly packageRepository: PackageRepository;
    readonly owaspRepository: OWASPRepository;

    constructor(
        versionsRepository: VersionsRepository,
        osvRepository: OSVRepository,
        nvdRepository: NVDRepository,
        cweRepository: CWERepository,
        packageRepository: PackageRepository,
        owaspRepository: OWASPRepository
    ) {
        this.versionsRepository = versionsRepository;
        this.osvRepository = osvRepository;
        this.nvdRepository = nvdRepository;
        this.cweRepository = cweRepository;
        this.packageRepository = packageRepository;
        this.owaspRepository = owaspRepository;
    }

    // async getPatchedVersionsString(source: string): Promise<string> {
    //     // const affectedData: AffectedInfo = this.vulnsData.Affected[source];
    //     const affectedData: AffectedInfo = { Ranges: [], Exact: [], Universal: false };
    //     const patchedStringParts: string[] = [];
    //     const versions = await this.#getVersions();
    //     const versionsStrings = versions.map((a) => a.version);

    //     if (affectedData.Ranges.length > 0) {
    //         for (let i = 0; i < affectedData.Ranges.length; i++) {
    //             let patchedStringPart = '';
    //             const currentPart = affectedData.Ranges[i];
    //             let previousPart = null;
    //             let nextPart = null;

    //             if (i - 1 >= 0) {
    //                 previousPart = affectedData.Ranges[i - 1];
    //             }

    //             if (i + 1 < affectedData.Ranges.length - 1) {
    //                 nextPart = affectedData.Ranges[i + 1];
    //             }

    //             if (previousPart) {
    //                 if (previousPart.FixedString === null) {
    //                     continue;
    //                 } else {
    //                     const versionsBetween = getVersionsSatisfyingConstraint(
    //                         versionsStrings,
    //                         `>= ${previousPart.FixedString} < ${currentPart.IntroducedString}`
    //                     );
    //                     if (versionsBetween.length > 1) {
    //                         patchedStringPart += `>= ${previousPart.FixedString} < ${currentPart.IntroducedString}`;
    //                     } else {
    //                         patchedStringPart += `${previousPart.FixedString}`;
    //                     }
    //                 }
    //             } else {
    //                 if (currentPart.FixedString && nextPart === null) {
    //                     const versionsBetween = getVersionsSatisfyingConstraint(
    //                         versionsStrings,
    //                         `>= ${currentPart.FixedString}`
    //                     );
    //                     if (versionsBetween.length > 1) {
    //                         patchedStringPart += `>= ${currentPart.FixedString}`;
    //                     } else {
    //                         if (versionsBetween.length > 0) {
    //                             patchedStringPart += versionsBetween[0];
    //                         }
    //                     }
    //                 } else if (currentPart.FixedString && nextPart !== null) {
    //                     const versionsBetween = getVersionsSatisfyingConstraint(
    //                         versionsStrings,
    //                         `>= ${currentPart.FixedString} < ${nextPart.IntroducedString}`
    //                     );
    //                     if (versionsBetween.length > 1) {
    //                         patchedStringPart += `>= ${currentPart.FixedString}`;
    //                     } else {
    //                         if (versionsBetween.length > 0) {
    //                             patchedStringPart += versionsBetween[0];
    //                         }
    //                     }
    //                 }
    //             }

    //             if (!patchedStringParts.includes(patchedStringPart))
    //                 patchedStringParts.push(patchedStringPart);

    //             if (i === affectedData.Ranges.length - 1) {
    //                 if (currentPart.FixedString) {
    //                     if (!patchedStringParts.includes(`>= ${currentPart.FixedString}`))
    //                         patchedStringParts.push(`>= ${currentPart.FixedString}`);
    //                 }
    //             }
    //         }
    //     } else if (affectedData.Exact.length > 0) {
    //         // get all version other than those listed in exact
    //         for (const version of versions) {
    //             if (!affectedData.Exact.includes(version.version)) {
    //                 patchedStringParts.push(version.version);
    //             }
    //         }
    //     } else if (affectedData.Universal) {
    //         // no pached version exists
    //     }

    //     return patchedStringParts.join(' || ');
    // }

    async getVulnerableVersionsString(source: string): Promise<string> {
        let affectedData: AffectedInfo = { Ranges: [], Exact: [], Universal: false };

        // Debug logging to understand data structure
        console.log('🔍 getVulnerableVersionsString debug:', {
            source,
            vulnId: this.vulnsData.VulnerabilityId,
            affectedDep: this.vulnsData.AffectedDependency,
            affectedVer: this.vulnsData.AffectedVersion,
            hasOSVMatch: !!this.vulnsData.OSVMatch,
            hasNVDMatch: !!this.vulnsData.NVDMatch,
            osvAffectedInfo: this.vulnsData.OSVMatch?.AffectedInfo?.length || 0,
            nvdAffectedInfo: this.vulnsData.NVDMatch?.AffectedInfo?.length || 0
        });

        // Check if this is a framework vulnerability (starts with 'framework-')
        const isFramework = this.vulnsData.AffectedDependency?.startsWith('framework-');

        // Handle null safety for framework vulnerabilities
        if (source === 'NVD') {
            if (
                this.vulnsData.NVDMatch &&
                this.vulnsData.NVDMatch.AffectedInfo &&
                this.vulnsData.NVDMatch.AffectedInfo.length > 0
            ) {
                affectedData = this.vulnsData.NVDMatch.AffectedInfo[0]!;
            }
        } else {
            if (
                this.vulnsData.OSVMatch &&
                this.vulnsData.OSVMatch.AffectedInfo &&
                this.vulnsData.OSVMatch.AffectedInfo.length > 0
            ) {
                affectedData = this.vulnsData.OSVMatch.AffectedInfo[0]!;
            }
        }

        const affectedStringParts: string[] = [];

        // First try to get affected versions from the actual vulnerability data
        // This ensures we show the real CVE data regardless of whether it's a false positive
        if (source === 'NVD' && this.nvdItem) {
            const nvdAffectedVersions = await this.extractNVDAffectedVersions();
            if (nvdAffectedVersions.length > 0) {
                return nvdAffectedVersions.join(', ');
            }
        } else if (source === 'OSV' && this.osvItem) {
            const osvAffectedVersions = await this.extractOSVAffectedVersions();
            if (osvAffectedVersions.length > 0) {
                return osvAffectedVersions.join(', ');
            }
        }

        // Fallback to using AffectedInfo from vulnerability analysis results
        if (affectedData.Ranges && affectedData.Ranges.length > 0) {
            for (const range of affectedData.Ranges) {
                let affectedStringPart = '';
                affectedStringPart += `>= ${range.IntroducedSemver.Major}.${range.IntroducedSemver.Minor}.${range.IntroducedSemver.Patch}`;
                if (range.IntroducedSemver.PreReleaseTag !== '')
                    affectedStringPart += `-${range.IntroducedSemver.PreReleaseTag}`;

                affectedStringPart += ` < ${range.FixedSemver.Major}.${range.FixedSemver.Minor}.${range.FixedSemver.Patch}`;
                if (range.FixedSemver.PreReleaseTag !== '')
                    affectedStringPart += `-${range.FixedSemver.PreReleaseTag}`;
                affectedStringParts.push(affectedStringPart);
            }
        } else if (affectedData.Exact && affectedData.Exact.length > 0) {
            for (const exact of affectedData.Exact) {
                affectedStringParts.push(exact.VersionString);
            }
        } else if (affectedData.Universal) {
            affectedStringParts.push('*');
        }

        // Final fallback for framework vulnerabilities without proper AffectedInfo
        if (affectedStringParts.length === 0 && isFramework && this.vulnsData.AffectedVersion) {
            return `${this.vulnsData.AffectedVersion  } (check advisory for details)`;
        }

        return affectedStringParts.join(' || ');
    }

    // Get affected versions from both sources for comparison - focus on why current version is flagged
    async getAffectedVersionsBySources(): Promise<{
        nvd: string;
        osv: string;
        agree: boolean;
        nvdReason: string;
        osvReason: string;
        nvdAllVersions: string;
        osvAllVersions: string;
    }> {
        let nvdString = '';
        let osvString = '';
        let nvdReason = '';
        let osvReason = '';
        let nvdAllVersions = '';
        let osvAllVersions = '';

        const currentVersion = this.vulnsData.AffectedVersion || '';

        // Get NVD reasoning and full details
        if (this.nvdItem) {
            const nvdVersions = await this.extractNVDAffectedVersions();
            nvdAllVersions = nvdVersions.join(', ');
            nvdReason = await this.explainWhyVersionIsVulnerable('NVD', currentVersion);
            nvdString = nvdReason;
        }

        // Get OSV reasoning and full details
        if (this.osvItem) {
            const osvVersions = await this.extractOSVAffectedVersions();
            osvAllVersions = osvVersions.join(', ');
            osvReason = await this.explainWhyVersionIsVulnerable('OSV', currentVersion);
            osvString = osvReason;
        }

        // Debug logging
        console.log('🔍 Source comparison debug (reasoning):', {
            vulnId: this.vulnsData.VulnerabilityId,
            currentVersion,
            nvdReason,
            osvReason,
            nvdAllVersions,
            osvAllVersions
        });

        // Sources disagree if they both have data but different reasoning
        const agree = nvdReason === osvReason || (!nvdReason && !osvReason);

        return {
            nvd: nvdString,
            osv: osvString,
            agree,
            nvdReason,
            osvReason,
            nvdAllVersions,
            osvAllVersions
        };
    }

    // Explain why a specific version is considered vulnerable by a source
    async explainWhyVersionIsVulnerable(source: string, version: string): Promise<string> {
        const cleanVersion = version.startsWith('v') ? version.slice(1) : version;

        if (source === 'NVD' && this.nvdItem?.affected) {
            for (const affectedEntry of this.nvdItem.affected) {
                if (affectedEntry.sources) {
                    for (const src of affectedEntry.sources) {
                        // Check if version falls in any range
                        if (
                            src.versionEndExcluding &&
                            !src.versionStartIncluding &&
                            !src.versionStartExcluding
                        ) {
                            // All versions before X
                            return `All versions before ${src.versionEndExcluding} are affected (your v${cleanVersion} < ${src.versionEndExcluding})`;
                        } else if (src.versionStartIncluding && src.versionEndExcluding) {
                            // Range from X to Y
                            return `Versions ${src.versionStartIncluding} to ${src.versionEndExcluding} are affected`;
                        } else if (src.criteriaDict?.version === '*') {
                            return 'All versions are affected';
                        }
                    }
                }
            }
        }

        if (source === 'OSV' && this.osvItem?.affected) {
            const specificVersions: string[] = [];

            for (const affectedEntry of this.osvItem.affected) {
                if (affectedEntry.versions && Array.isArray(affectedEntry.versions)) {
                    for (const v of affectedEntry.versions) {
                        const cleanV = v.startsWith('v') ? v.slice(1) : v;
                        // Remove duplicates
                        if (!specificVersions.includes(cleanV)) {
                            specificVersions.push(cleanV);
                        }
                    }
                }
            }

            if (specificVersions.length > 0) {
                // Sort versions for consistent display
                specificVersions.sort();

                if (specificVersions.includes(cleanVersion)) {
                    return `Your version ${cleanVersion} is in the list of affected versions: ${specificVersions.join(', ')}`;
                } else {
                    return `Only specific versions are affected: ${specificVersions.join(', ')} (your v${cleanVersion} is NOT in this list)`;
                }
            }
        }

        return 'Unable to determine vulnerability reason';
    }

    async getVersionsStatusArray(
        affectedVersionsString: string,
        _affectedDependencyName: string
    ): Promise<VulnerableVersionInfo[]> {
        // const versions = await this.#getVersions();
        const versions: Version[] = [];
        const versionsStatusArray: VulnerableVersionInfo[] = [];
        for (const version of versions) {
            if (satisfies(version.version, affectedVersionsString)) {
                versionsStatusArray.push({
                    version: version.version,
                    status: 'affected'
                });
            } else {
                versionsStatusArray.push({
                    version: version.version,
                    status: 'not_affected'
                });
            }
        }
        return versionsStatusArray;
    }

    getPatchesData(): PatchInfo {
        // if (this.patchesData.affected_deps && this.patchesData.affected_deps.length > 0) {
        //     this.patchesData.affected_dep_name = this.patchesData.affected_deps[0].slice(
        //         0,
        //         this.patchesData.affected_deps[0].lastIndexOf('@')
        //     );
        // }
        return this.patchesData;
    }

    async getWeaknessData(): Promise<
        [WeaknessInfo[], Record<string, CommonConsequencesInfo[]>]
    > {
        const common_consequences: Record<string, CommonConsequencesInfo[]> = {};
        const weakenessses: WeaknessInfo[] = [];

        if (this.vulnsData.Weaknesses === null || this.vulnsData.Weaknesses === undefined) return [weakenessses, common_consequences];

        for (const _weakeness of this.vulnsData.Weaknesses) {
            try {
                // const cweInfo = await this.cweRepository.getCWE(
                //     _weakeness.WeaknessId.replace('CWE-', '')
                // );
                throw new Error('Method not implemented.');
                // weakenessses.push({
                //     id: weakeness.WeaknessId,
                //     name: cweInfo.Name,
                //     description: cweInfo.Description.replace(/[^\x20-\x7E]+/g, '')
                //         .replace(/\s+/g, ' ')
                //         .trim()
                // });
                // if (cweInfo.Common_Consequences) {
                //     const common_cons_array = [];
                //     for (const commonConsequence of cweInfo.Common_Consequences) {
                //         common_cons_array.push({
                //             scope: commonConsequence.Scope,
                //             impact: commonConsequence.Impact,
                //             description: commonConsequence.Note.replace(/[^\x20-\x7E]+/g, '')
                //                 .replace(/\s+/g, ' ')
                //                 .trim()
                //         });
                //     }
                //     common_consequences[weakeness.WeaknessId] = common_cons_array;
                // }
            } catch (error) {
                console.error(error);
            }
        }

        return [weakenessses, common_consequences];
    }

    async getDependencyData(): Promise<DependencyInfo> {
        const dependencyInfo: DependencyInfo = {
            name: '',
            published: '',
            description: '',
            keywords: [],
            version: '',
            package_manager_links: []
        };

        // If no dependency data is available, return empty info
        if (!this.dependencyData) {
            console.warn('No dependency data available for vulnerability report');
            return dependencyInfo;
        }

        try {
            // const _packageInfo = await this.packageRepository.getPackageInfo('');
            // const _versionInfo = await this.versionsRepository.getVersion(
            //     'this.dependencyData.name',
            //     'this.dependencyData.version'
            // );

            // dependencyInfo.description = packageInfo.Description;
            // if (packageInfo.Keywords) dependencyInfo.keywords = packageInfo.Keywords;
            // dependencyInfo.published = versionInfo.Time;

            // if (packageInfo.Homepage && packageInfo.Homepage !== '') {
            //     dependencyInfo.homepage = packageInfo.Homepage;
            // }

            // if (this.dependencyData.git_url !== null) {
            //     if (this.dependencyData.git_url.host_type === 'GITHUB') {
            //         dependencyInfo.github_link = this.dependencyData.git_url;
            //         dependencyInfo.issues_link =
            //             this.dependencyData.git_url.repo_full_path + '/issues';
            //     }
            // }

            // if (this.packageManager === 'NPM' || this.packageManager === 'YARN') {
            //     dependencyInfo.package_manager_links.push({
            //         package_manager: 'NPM',
            //         url: `https://www.npmjs.com/package/${this.dependencyData.name}`
            //     });
            //     dependencyInfo.package_manager_links.push({
            //         package_manager: 'YARN',
            //         url: `https://yarn.pm/${this.dependencyData.name}`
            //     });
            // }

            return dependencyInfo;
        } catch (error) {
            console.error(error);
            return dependencyInfo;
        }
    }

    getOwaspTop10Info(): OwaspTop10Info | null {
        if (this.vulnsData.Weaknesses === null || this.vulnsData.Weaknesses === undefined) return null;

        for (const weakeness of this.vulnsData.Weaknesses) {
            if (weakeness.OWASPTop10Id !== '') {
                try {
                    return this.owaspRepository.getOwaspTop10CategoryInfo(weakeness.OWASPTop10Id);
                } catch (err) {
                    console.error(err);
                    return null;
                }
            }
        }
        return null;
    }

    // Extract affected versions directly from NVD vulnerability data in human-readable format
    async extractNVDAffectedVersions(): Promise<string[]> {
        const ranges: string[] = [];

        if (!this.nvdItem?.affected) {
            return ranges;
        }

        // Parse the NVD affected field which contains CPE criteria
        for (const affectedEntry of this.nvdItem.affected) {
            if (affectedEntry.sources) {
                for (const source of affectedEntry.sources) {
                    let rangeDescription = '';

                    // Handle version ranges in a user-friendly way
                    const hasStart = source.versionStartIncluding || source.versionStartExcluding;
                    const hasEnd = source.versionEndIncluding || source.versionEndExcluding;

                    if (hasStart && hasEnd) {
                        // Range: e.g., "5.4.0 to 5.4.3"
                        const startVer =
                            source.versionStartIncluding || source.versionStartExcluding;
                        const endVer = source.versionEndIncluding || source.versionEndExcluding;
                        const startSymbol = source.versionStartIncluding ? '' : ' (exclusive)';
                        const endSymbol = source.versionEndIncluding ? ' (inclusive)' : '';
                        rangeDescription = `${startVer}${startSymbol} to ${endVer}${endSymbol}`;
                    } else if (hasEnd && !hasStart) {
                        // Upper bound only: e.g., "before 5.3.15"
                        const endVer = source.versionEndIncluding || source.versionEndExcluding;
                        rangeDescription = source.versionEndExcluding
                            ? `before ${endVer}`
                            : `up to ${endVer} (inclusive)`;
                    } else if (hasStart && !hasEnd) {
                        // Lower bound only: e.g., "5.4.0 and later"
                        const startVer =
                            source.versionStartIncluding || source.versionStartExcluding;
                        rangeDescription = source.versionStartIncluding
                            ? `${startVer} and later`
                            : `after ${startVer}`;
                    } else if (
                        source.criteriaDict?.version &&
                        source.criteriaDict.version !== '*' &&
                        source.criteriaDict.version !== ''
                    ) {
                        // Specific version
                        rangeDescription = `exactly ${source.criteriaDict.version}`;
                    } else if (source.criteriaDict?.version === '*') {
                        // All versions
                        rangeDescription = 'all versions';
                    }

                    if (rangeDescription && !ranges.includes(rangeDescription)) {
                        ranges.push(rangeDescription);
                    }
                }
            }
        }

        return ranges;
    }

    // Extract affected versions directly from OSV vulnerability data in human-readable format
    async extractOSVAffectedVersions(): Promise<string[]> {
        const descriptions: string[] = [];
        const allSpecificVersions: string[] = [];
        const allRanges: string[] = [];

        if (!this.osvItem?.affected) {
            return descriptions;
        }

        // Parse OSV affected field - collect all data first to avoid duplicates
        for (const affectedEntry of this.osvItem.affected) {
            // Collect specific versions
            if (affectedEntry.versions && Array.isArray(affectedEntry.versions)) {
                for (const version of affectedEntry.versions) {
                    const cleanVersion = version.startsWith('v') ? version.slice(1) : version;
                    if (!allSpecificVersions.includes(cleanVersion)) {
                        allSpecificVersions.push(cleanVersion);
                    }
                }
            }

            // Collect ranges and convert to readable format
            if (affectedEntry.ranges && Array.isArray(affectedEntry.ranges)) {
                for (const range of affectedEntry.ranges) {
                    if (range.events && Array.isArray(range.events)) {
                        let introduced = '';
                        let fixed = '';
                        let lastAffected = '';

                        // Extract event details
                        for (const event of range.events) {
                            if (event.introduced && event.introduced !== '0') {
                                introduced = event.introduced;
                            }
                            if (event.fixed) {
                                fixed = event.fixed;
                            }
                            if (event.last_affected) {
                                lastAffected = event.last_affected;
                            }
                        }

                        // Create readable range description with clear exclusion/inclusion
                        if (introduced && fixed) {
                            const rangeDesc = `${introduced} up to (but not including) ${fixed}`;
                            if (!allRanges.includes(rangeDesc)) {
                                allRanges.push(rangeDesc);
                            }
                        } else if (introduced && lastAffected) {
                            const rangeDesc = `${introduced} to ${lastAffected} (inclusive)`;
                            if (!allRanges.includes(rangeDesc)) {
                                allRanges.push(rangeDesc);
                            }
                        } else if (introduced) {
                            const rangeDesc = `${introduced} and later`;
                            if (!allRanges.includes(rangeDesc)) {
                                allRanges.push(rangeDesc);
                            }
                        } else if (fixed) {
                            const rangeDesc = `before ${fixed} (excluding ${fixed})`;
                            if (!allRanges.includes(rangeDesc)) {
                                allRanges.push(rangeDesc);
                            }
                        }
                    }
                }
            }
        }

        // Combine all unique versions and ranges, removing duplicates
        const uniqueDescriptions: string[] = [];

        if (allSpecificVersions.length > 0) {
            if (allSpecificVersions.length === 1) {
                uniqueDescriptions.push(`exactly ${allSpecificVersions[0]}`);
            } else {
                uniqueDescriptions.push(`specific versions: ${allSpecificVersions.join(', ')}`);
            }
        }

        // Add unique ranges
        for (const range of allRanges) {
            if (!uniqueDescriptions.includes(range)) {
                uniqueDescriptions.push(range);
            }
        }

        return uniqueDescriptions;
    }

    async parseCVSS31Vector(vector: string): Promise<CVSS3> {
        const { createCVSS31Parser, createCVSS31Calculator } = await import('cvss-parser');
        const cvss31Parser = createCVSS31Parser();
        const parsedVector = cvss31Parser.parse(vector);
        const cvss31Calculator = createCVSS31Calculator();
        cvss31Calculator.computeBaseScore(parsedVector);

        const baseScore = cvss31Calculator.getBaseScore(true);
        const exploitabilitySubscore = cvss31Calculator.getExploitabilitySubScore(true);
        const impactSubscore = cvss31Calculator.getImpactSubScore(true);

        const cvss31Data: CVSS31 = {
            base_score: baseScore,
            exploitability_score: exploitabilitySubscore,
            impact_score: impactSubscore,
            attack_vector: parsedVector.AttackVector,
            attack_complexity: parsedVector.AttackComplexity,
            confidentiality_impact: parsedVector.ConfidentialityImpact,
            availability_impact: parsedVector.AvailabilityImpact,
            integrity_impact: parsedVector.IntegrityImpact,
            user_interaction: parsedVector.UserInteraction,
            scope: parsedVector.Scope,
            privileges_required: parsedVector.PrivilegesRequired
        };
        return cvss31Data;
    }

    async parseCVSS3Vector(vector: string): Promise<CVSS3> {
        const { createCVSS3Parser, createCVSS3Calculator } = await import('cvss-parser');
        const cvss3Parser = createCVSS3Parser();
        const parsedVector = cvss3Parser.parse(vector);
        const cvss3Calculator = createCVSS3Calculator();
        cvss3Calculator.computeBaseScore(parsedVector);

        const baseScore = cvss3Calculator.getBaseScore(true);
        const exploitabilitySubscore = cvss3Calculator.getExploitabilitySubScore(true);
        const impactSubscore = cvss3Calculator.getImpactSubScore(true);

        const cvss3Data: CVSS3 = {
            base_score: baseScore,
            exploitability_score: exploitabilitySubscore,
            impact_score: impactSubscore,
            attack_vector: parsedVector.AttackVector,
            attack_complexity: parsedVector.AttackComplexity,
            confidentiality_impact: parsedVector.ConfidentialityImpact,
            availability_impact: parsedVector.AvailabilityImpact,
            integrity_impact: parsedVector.IntegrityImpact,
            user_interaction: parsedVector.UserInteraction,
            scope: parsedVector.Scope,
            privileges_required: parsedVector.PrivilegesRequired
        };
        return cvss3Data;
    }

    async parseCVSS2Vector(vector: string): Promise<CVSS2> {
        const { createCVSS2Parser, createCVSS2Calculator } = await import('cvss-parser');
        const cvss2Parser = createCVSS2Parser();
        const parsedVector = cvss2Parser.parse(vector);
        const cvss2Calculator = createCVSS2Calculator();
        cvss2Calculator.computeBaseScore(parsedVector);

        const baseScore = cvss2Calculator.getBaseScore(true);
        const exploitabilitySubscore = cvss2Calculator.getExploitabilitySubScore(true);
        const impactSubscore = cvss2Calculator.getImpactSubScore(true);

        const cvss2Data: CVSS2 = {
            base_score: baseScore,
            exploitability_score: exploitabilitySubscore,
            impact_score: impactSubscore,
            access_vector: parsedVector.AccessVector,
            access_complexity: parsedVector.AccessComplexity,
            confidentiality_impact: parsedVector.ConfidentialityImpact,
            availability_impact: parsedVector.AvailabilityImpact,
            integrity_impact: parsedVector.IntegrityImpact,
            authentication: parsedVector.Authentication
        };
        return cvss2Data;
    }

    async getCVSSNVDInfo(nvdItem: NVD): Promise<SeverityInfo> {
        const severityInfo: SeverityInfo = {};

        if (nvdItem.metrics) {
            if (nvdItem.metrics.cvssMetricV2) {
                if (nvdItem.metrics.cvssMetricV2.length > 1) {
                    for (const cvss2 of nvdItem.metrics.cvssMetricV2) {
                        if (cvss2.source === 'nvd@nist.gov') {
                            severityInfo.cvss_2 = await this.parseCVSS2Vector(
                                cvss2.cvssData.vectorString
                            );
                            break;
                        }
                    }
                } else if (nvdItem.metrics.cvssMetricV2.length === 1) {
                    const cvss2 = nvdItem.metrics.cvssMetricV2[0];
                    severityInfo.cvss_2 = await this.parseCVSS2Vector(cvss2.cvssData.vectorString);
                }
            }

            if (nvdItem.metrics.cvssMetricV30) {
                if (nvdItem.metrics.cvssMetricV30.length > 1) {
                    for (const cvss3 of nvdItem.metrics.cvssMetricV30) {
                        if (cvss3.source === 'nvd@nist.gov') {
                            severityInfo.cvss_3 = await this.parseCVSS3Vector(
                                cvss3.cvssData.vectorString
                            );
                            break;
                        }
                    }
                } else if (nvdItem.metrics.cvssMetricV30.length === 1) {
                    const cvss3 = nvdItem.metrics.cvssMetricV30[0];
                    severityInfo.cvss_3 = await this.parseCVSS3Vector(cvss3.cvssData.vectorString);
                }
            }

            if (nvdItem.metrics.cvssMetricV31) {
                if (nvdItem.metrics.cvssMetricV31.length > 1) {
                    for (const cvss31 of nvdItem.metrics.cvssMetricV31) {
                        if (cvss31.source === 'nvd@nist.gov') {
                            severityInfo.cvss_3 = await this.parseCVSS3Vector(
                                cvss31.cvssData.vectorString
                            );
                            break;
                        }
                    }
                } else if (nvdItem.metrics.cvssMetricV31.length === 1) {
                    const cvss31 = nvdItem.metrics.cvssMetricV31[0];
                    severityInfo.cvss_31 = await this.parseCVSS31Vector(
                        cvss31.cvssData.vectorString
                    );
                }
            }
        }

        if (severityInfo.cvss_2 !== undefined) {
            severityInfo.cvss_2.user_interaction_required =
                nvdItem.metrics.cvssMetricV2[0].userInteractionRequired;
        }

        return severityInfo;
    }

    async getCVSSOSVInfo(osvItem: OSV): Promise<SeverityInfo> {
        const severityInfo: SeverityInfo = {};

        if (osvItem.severity && osvItem.severity.length > 0) {
            for (const severity of osvItem.severity) {
                if (severity.type === 'CVSS_V3') {
                    severityInfo.cvss_3 = await this.parseCVSS3Vector(severity.score);
                } else if (severity.type === 'CVSS_V2') {
                    severityInfo.cvss_2 = await this.parseCVSS2Vector(severity.score);
                }
            }
        }

        return severityInfo;
    }

    getOtherInfo(): OtherInfo {
        return { package_manager: this.packageManager };
    }
}

@Injectable()
export class OSVReportGenerator extends BaseReportGenerator {
    constructor(
        readonly versionsRepository: VersionsRepository,
        readonly osvRepository: OSVRepository,
        readonly nvdRepository: NVDRepository,
        readonly cweRepository: CWERepository,
        readonly packageRepository: PackageRepository,
        readonly owaspRepository: OWASPRepository
    ) {
        super(
            versionsRepository,
            osvRepository,
            nvdRepository,
            cweRepository,
            packageRepository,
            owaspRepository
        );
    }

    async genReport(
        // patchesData: PatchInfo,
        vulnsData: Vulnerability,
        packageManager: string,
        dependencyData?: Dependency,
        osvItem?: OSV,
        nvdItem?: NVD,
        friendsOfPhpItem?: FriendsOfPhp
    ): Promise<VulnerabilityDetails> {
        // this.patchesData = patchesData;
        this.vulnsData = vulnsData;
        this.packageManager = packageManager;
        if (dependencyData !== undefined) {
            this.dependencyData = dependencyData;
        }
        if (osvItem !== undefined) {
            this.osvItem = osvItem;
        }
        if (nvdItem !== undefined) {
            this.nvdItem = nvdItem;
        }

        if (!this.osvItem) {
            throw new Error('Failed to generate report from undefined nvd entry');
        }

        /** Vulnerability Info */
        const vulnInfo: VulnerabilityInfo = {
            vulnerability_id: this.osvItem.cve === null ? this.osvItem.osv_id : this.osvItem.cve,
            description: this.#cleanOsvDescription(this.osvItem.details),
            version_info: {
                affected_versions_string: '',
                patched_versions_string: '',
                versions: []
            },
            published: this.osvItem.published,
            last_modified: this.osvItem.modified,
            sources: [
                {
                    name: 'OSV',
                    vuln_url: `https://osv.dev/vulnerability/${this.osvItem.osv_id}`
                }
            ],
            aliases: [this.osvItem.osv_id]
        };

        if (this.osvItem.cve) {
            vulnInfo.aliases.push(this.osvItem.cve);
        }

        if (this.nvdItem) {
            vulnInfo.sources.push({
                name: 'NVD',
                vuln_url: `https://nvd.nist.gov/vuln/detail/${this.nvdItem.nvd_id}`
            });
        }

        if (friendsOfPhpItem) {
            vulnInfo.sources.push({
                name: 'FriendsOfPHP',
                vuln_url: friendsOfPhpItem.link
            });
        }

        // const patchedVersionsString = await this.getPatchedVersionsString('OSV');
        const affectedVersionsString = await this.getVulnerableVersionsString('OSV');
        const versionsStatusArray = await this.getVersionsStatusArray(
            affectedVersionsString,
            vulnsData.AffectedDependency
        );

        // Get source comparison for disagreements
        const sourceComparison = await this.getAffectedVersionsBySources();

        vulnInfo.version_info.affected_versions_string = affectedVersionsString;
        // vulnInfo.version_info.patched_versions_string = patchedVersionsString;
        vulnInfo.version_info.versions = versionsStatusArray;
        vulnInfo.version_info.source_comparison = sourceComparison;

        /** Dependency Info */
        let dependencyInfo: DependencyInfo | undefined;
        try {
            dependencyInfo = await this.getDependencyData();

            // For framework vulnerabilities, try to extract the actual package name from OSV data
            let displayName = vulnsData.AffectedDependency || '';
            if (displayName.startsWith('framework-') && this.osvItem?.affected) {
                for (const affected of this.osvItem.affected) {
                    if (affected.package?.name) {
                        displayName = affected.package.name;
                        break;
                    }
                }
            }

            dependencyInfo.name = displayName;
            dependencyInfo.version = vulnsData.AffectedVersion || '';

            // Warn if dependency info is missing
            if (!vulnsData.AffectedDependency || !vulnsData.AffectedVersion) {
                console.warn('Missing dependency info in OSV vulnerability data:', {
                    vulnId: vulnsData.VulnerabilityId,
                    affectedDep: vulnsData.AffectedDependency,
                    affectedVersion: vulnsData.AffectedVersion
                });
            }
        } catch (error) {
            console.error('Error getting dependency data (OSV):', error);
        }

        /** Common consequences and waeknesses */
        const [weakenessses, common_consequences] = await this.getWeaknessData();

        /** Patch Info */
        const patchInfo: PatchInfo = this.getPatchesData();

        /** Severities */
        let severityInfo: SeverityInfo = await this.getCVSSOSVInfo(this.osvItem);

        if (
            severityInfo.cvss_2 === null &&
            severityInfo.cvss_31 === null &&
            severityInfo.cvss_3 === null
        ) {
            if (this.nvdItem) {
                severityInfo = await this.getCVSSNVDInfo(this.nvdItem);
            }
        }

        /** References */
        const references: ReferenceInfo[] = [];

        if (this.osvItem.references) {
            for (const ref of this.osvItem.references) {
                references.push({ url: ref.url, tags: [ref.type] });
            }
        }

        /** Owasp top 10 */
        const owaspTop10Info = this.getOwaspTop10Info();

        /** Vulnerability Details */
        const vulnDetails: VulnerabilityDetails = {
            vulnerability_info: vulnInfo,
            weaknesses: weakenessses,
            severities: severityInfo,
            common_consequences: common_consequences,
            patch: patchInfo,
            references: references,
            owasp_top_10: owaspTop10Info,
            location: [],
            other: this.getOtherInfo()
        };
        if (dependencyInfo) {
            vulnDetails.dependency_info = dependencyInfo;
        }

        return vulnDetails;
    }

    #cleanOsvDescription(description: string): string {
        const sections = [];
        let parsingHeader = false;
        let text = '';

        for (const char of description) {
            if (char === '#' && parsingHeader === false) {
                if (text !== '') sections.push(text);
                parsingHeader = true;
                text = '';
                continue;
            }

            if (char !== '#') parsingHeader = false;

            if (char !== '#') text += char;
        }

        if (text !== '') {
            sections.push(text);
        }

        const selectedSections = [];

        let index = -1;
        for (const section of sections) {
            index += 1;
            if (index === 0) {
                selectedSections.push(section);
                continue;
            }
            if (section.includes('```')) {
                selectedSections.push(section);
                continue;
            }
        }

        if (selectedSections.length > 0) {
            let newSection = '';
            const section = selectedSections[selectedSections.length - 1]!;
            let trimEndNewLines = true;
            for (let i = section.length - 1; i >= 0; i--) {
                if (section[i] !== '\n') {
                    trimEndNewLines = false;
                }
                if (!trimEndNewLines) {
                    newSection += section[i]!;
                }
            }
            selectedSections[selectedSections.length - 1] = newSection.split('').reverse().join('');
        }

        return selectedSections.join('\n');
    }
}

@Injectable()
export class NVDReportGenerator extends BaseReportGenerator {
    constructor(
        readonly versionsRepository: VersionsRepository,
        readonly osvRepository: OSVRepository,
        readonly nvdRepository: NVDRepository,
        readonly cweRepository: CWERepository,
        readonly packageRepository: PackageRepository,
        readonly owaspRepository: OWASPRepository
    ) {
        super(
            versionsRepository,
            osvRepository,
            nvdRepository,
            cweRepository,
            packageRepository,
            owaspRepository
        );
    }

    async genReport(
        // patchesData: PatchInfo,
        vulnsData: Vulnerability,
        packageManager: string,
        dependencyData?: Dependency,
        osvItem?: OSV,
        nvdItem?: NVD,
        friendsOfPhpItem?: FriendsOfPhp
    ): Promise<VulnerabilityDetails> {
        // this.patchesData = patchesData;
        this.vulnsData = vulnsData;
        this.packageManager = packageManager;
        if (dependencyData !== undefined) {
            this.dependencyData = dependencyData;
        }
        if (osvItem !== undefined) {
            this.osvItem = osvItem;
        }
        if (nvdItem !== undefined) {
            this.nvdItem = nvdItem;
        }

        if (!this.nvdItem) {
            throw new Error('Failed to generate report from undefined nvd entry');
        }

        /** Vulnerability Info */
        const vulnInfo: VulnerabilityInfo = {
            vulnerability_id: this.nvdItem.nvd_id,
            description: '',
            version_info: {
                affected_versions_string: '',
                patched_versions_string: '',
                versions: []
            },
            published: this.nvdItem.published,
            last_modified: this.nvdItem.lastModified,
            sources: [
                {
                    name: 'NVD',
                    vuln_url: `https://nvd.nist.gov/vuln/detail/${this.nvdItem.nvd_id}`
                }
            ],
            aliases: []
        };

        if (this.osvItem) {
            vulnInfo.aliases.push(this.osvItem.osv_id);
            vulnInfo.sources.push({
                name: 'OSV',
                vuln_url: `https://osv.dev/vulnerability/${this.osvItem.osv_id}`
            });
        }

        if (friendsOfPhpItem) {
            vulnInfo.sources.push({
                name: 'FriendsOfPHP',
                vuln_url: friendsOfPhpItem.link
            });
        }

        for (const description of this.nvdItem.descriptions) {
            if (description.lang === 'en') {
                vulnInfo.description = description.value;
                break;
            }
        }

        // const patchedVersionsString = await this.getPatchedVersionsString('NVD');
        const affectedVersionsString = await this.getVulnerableVersionsString('NVD');
        const versionsStatusArray = await this.getVersionsStatusArray(
            affectedVersionsString,
            vulnsData.AffectedDependency
        );

        // Get source comparison for disagreements
        const sourceComparison = await this.getAffectedVersionsBySources();

        vulnInfo.version_info.affected_versions_string = affectedVersionsString;
        // vulnInfo.version_info.patched_versions_string = patchedVersionsString;
        vulnInfo.version_info.versions = versionsStatusArray;
        vulnInfo.version_info.source_comparison = sourceComparison;

        /** Dependency Info */
        let dependencyInfo: DependencyInfo | undefined;
        try {
            dependencyInfo = await this.getDependencyData();

            // For framework vulnerabilities, try to extract the actual package name from OSV or NVD data
            let displayName = vulnsData.AffectedDependency || '';
            if (displayName.startsWith('framework-')) {
                // Try OSV data first
                if (this.osvItem?.affected) {
                    for (const affected of this.osvItem.affected) {
                        if (affected.package?.name) {
                            displayName = affected.package.name;
                            break;
                        }
                    }
                }
                // If no OSV data, try to extract from NVD CPE criteria
                else if (this.nvdItem?.affected) {
                    for (const affected of this.nvdItem.affected) {
                        if (affected.sources) {
                            for (const source of affected.sources) {
                                if (source.criteriaDict?.product && source.criteriaDict?.vendor) {
                                    displayName = `${source.criteriaDict.vendor}/${source.criteriaDict.product}`;
                                    break;
                                }
                            }
                        }
                        if (!displayName.startsWith('framework-')) break;
                    }
                }
            }

            dependencyInfo.name = displayName;
            dependencyInfo.version = vulnsData.AffectedVersion || '';

            // Warn if dependency info is missing
            if (!vulnsData.AffectedDependency || !vulnsData.AffectedVersion) {
                console.warn('Missing dependency info in NVD vulnerability data:', {
                    vulnId: vulnsData.VulnerabilityId,
                    affectedDep: vulnsData.AffectedDependency,
                    affectedVersion: vulnsData.AffectedVersion
                });
            }
        } catch (error) {
            console.error('Error getting dependency data (NVD):', error);
        }

        /** Common consequences and waeknesses */
        const [weakenessses, common_consequences] = await this.getWeaknessData();

        /** Patch Info */
        const patchInfo: PatchInfo = this.getPatchesData();

        /** Severities */
        let severityInfo: SeverityInfo = await this.getCVSSNVDInfo(this.nvdItem);

        if (
            severityInfo.cvss_2 === null &&
            severityInfo.cvss_31 === null &&
            severityInfo.cvss_3 === null
        ) {
            if (this.osvItem) {
                severityInfo = await this.getCVSSOSVInfo(this.osvItem);
            }
        }

        /** References */
        const references: ReferenceInfo[] = [];

        for (const ref of this.nvdItem.references) {
            references.push({ url: ref.url, tags: [] });
        }

        /** Owasp top 10 */
        const owaspTop10Info = this.getOwaspTop10Info();

        /** Vulnerability Details */
        const vulnDetails: VulnerabilityDetails = {
            vulnerability_info: vulnInfo,
            weaknesses: weakenessses,
            severities: severityInfo,
            common_consequences: common_consequences,
            patch: patchInfo,
            references: references,
            owasp_top_10: owaspTop10Info,
            location: [],
            other: this.getOtherInfo()
        };
        if (dependencyInfo) {
            vulnDetails.dependency_info = dependencyInfo;
        }

        return vulnDetails;
    }
}
