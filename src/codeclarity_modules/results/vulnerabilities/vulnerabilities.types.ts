import { CVSS2, CVSS3, CVSS31 } from '../../knowledge/cvss.types';
import { PatchInfo } from '../../../types/entities/frontend/Patching';
import { ParsedGitUrl } from '../sbom/sbom.types';

export interface VulnSourceInfo {
    name: string;
    vuln_url: string;
}

export interface VulnerabilityInfo {
    vulnerability_id: string;
    description: string;
    version_info: VersionInfo;
    published: string;
    last_modified: string;
    sources: VulnSourceInfo[];
    aliases: string[];
}

export interface VersionInfo {
    affected_versions_string: string;
    patched_versions_string: string;
    versions: VulnerableVersionInfo[];
}

export interface VulnerableVersionInfo {
    version: string;
    status: string;
    release: string;
}

export interface DependencyInfo {
    name: string;
    published: string;
    description: string;
    keywords: string[];
    version: string;
    package_manager_links: PackageManagerLink[];
    github_link?: ParsedGitUrl;
    issues_link?: string;
    homepage?: string;
}

export interface PackageManagerLink {
    package_manager: string;
    url: string;
}

export interface SeverityInfo {
    cvss_31?: CVSS31;
    cvss_3?: CVSS3;
    cvss_2?: CVSS2;
}

export interface OwaspInfo {
    name: string;
    description: string;
}

export interface WeaknessInfo {
    id: string;
    name: string;
    description: string;
}

export interface CommonConsequencesInfo {
    scope: string[];
    impact: string[];
    description: string;
}

export interface ReferenceInfo {
    url: string;
    tags: string[];
}

export interface OtherInfo {
    package_manager: string;
}

export interface VulnerabilityDetails {
    vulnerability_info: VulnerabilityInfo;
    dependency_info?: DependencyInfo;
    severities: SeverityInfo;
    owasp_top_10: OwaspInfo | null;
    weaknesses: WeaknessInfo[];
    patch: PatchInfo;
    common_consequences: { [key: string]: CommonConsequencesInfo[] };
    references: ReferenceInfo[];
    location: string[];
    other: OtherInfo;
}

export interface Output {
    workspaces: { [key: string]: WorkSpaceData };
    analysis_info: AnalysisInfo;
}

export enum Status {
    Success = 'success',
    Failure = 'failure'
}

export interface AnalysisInfo {
    status: Status;
    private_errors: any[];
    public_errors: any[];
    analysis_start_time: string;
    analysis_end_time: string;
    analysis_delta_time: number;
    version_seperator: string;
    import_path_seperator: string;
    default_workspace_name: string;
    self_managed_workspace_name: string;
}

export interface SeverityDist {
    critical: number;
    high: number;
    medium: number;
    low: number;
    none: number;
}

export interface WorkSpaceData {
    Vulnerabilities: Vulnerability[];
    DependencyInfo: { [key: string]: DependencyInfo };
}

export interface DependencyInfo {
    SeverityDist: SeverityDist | null;
    Vulnerable: boolean;
    Vulnerabilities: DependencyInfoVulnerability[];
}

export interface DependencyInfoVulnerability {
    Vulnerability: string;
    Severity: Severity;
    Weaknesses: WeaknessInfo[];
}

export interface WeaknessInfo {
    WeaknessId: string;
    WeaknessName: string;
    WeaknessDescription: string;
    WeaknessExtendedDescription: string;
    OWASPTop10Id: string;
    OWASPTop10Name: string;
}

export interface Severity {
    Severity: number;
    SeverityType: SeverityType;
    Vector: string;
    Impact: number;
    Exploitability: number;
    ConfidentialityImpact: string;
    IntegrityImpact: string;
    AvailabilityImpact: string;
}

export enum SeverityType {
    CvssV2 = 'CVSS_V2',
    CvssV3 = 'CVSS_V3',
    CvssV31 = 'CVSS_V31'
}

export enum PatchType {
    Full = 'FULL',
    Partial = 'PARTIAL',
    None = 'NONE'
}

export interface Vulnerability {
    Id: string;
    Sources: Source[];
    AffectedDependency: string;
    AffectedVersion: string;
    VulnerabilityId: string;
    Severity: Severity;
    Weaknesses?: WeaknessInfo[];
    OSVMatch: Vuln;
    NVDMatch: Vuln;
}

interface Vuln {
    Vulnerability: any;
    Dependency: any;
    AffectedInfo: any;
    VulnerableEvidenceRange: any;
    VulnerableEvidenceExact: any;
    VulnerableEvidenceUniversal: any;
    VulnerableEvidenceType: any;
    Vulnerable: any;
    ConflictFlag: any;
    Severity: any;
    SeverityType: any;
}

export interface VulnerabilityMerged {
    Id: string;
    Sources: Source[];
    Affected: AffectedVuln[];
    Vulnerability: string;
    Severity: Severity;
    Weaknesses?: WeaknessInfo[];
    Description: string;
    WinningSource: string;
}

export interface AffectedVuln {
    Sources: Source[];
    AffectedDependency: string;
    AffectedVersion: string;
    VulnerabilityId: string;
    Severity: Severity;
    Weaknesses?: WeaknessInfo[];
    OSVMatch: Vuln;
    NVDMatch: Vuln;
}

export declare interface AffectedRange {
    IntroducedString: string;
    FixedString: string;
}

export declare interface AffectedInfo {
    Exact: string[];
    Ranges: AffectedRange[];
    Universal: boolean;
}

export enum Source {
    Nvd = 'NVD',
    Osv = 'OSV'
}
