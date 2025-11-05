import type { Dependency } from '../sbom/sbom.types';

export interface License {
    reference: string;
    isDeprecatedLicenseId: boolean;
    detailsUrl: string;
    details: Details;
    referenceNumber: number;
    name: string;
    licenseId: string;
    seeAlso: string[];
    isOsiApproved: boolean;
}

export interface CrossRef {
    isLive: boolean;
    isValid: boolean;
    isWayBackLink: boolean;
    match: string;
    order: number;
    timestamp: string;
    url: string;
}

export interface Details {
    classification?: string;
    licenseProperties?: LicenseProperties;
    description?: string;
    crossRef: CrossRef[];
    isDeprecatedLicenseId: boolean;
    isOsiApproved: boolean;
    licenseId: string;
    licenseText: string;
    licenseTextHtml: string;
    licenseTextNormalized: string;
    licenseTextNormalizedDigest: string;
    name: string;
    seeAlso: string[];
    standardLicenseTemplate: string;
}

export interface LicenseProperties {
    permissions: string[];
    conditions: string[];
    limitations: string[];
}

export interface WorkSpaceLicenseInfo {
    LicensesDepMap: Record<string, string[]>;
    NonSpdxLicensesDepMap: Record<string, string[]>;
    LicenseComplianceViolations: string[];
    DependencyInfo: Record<string, DependencyInfo | undefined>;
}

export interface DependencyInfo {
    Licenses: string[];
    NonSpdxLicenses: string[];
}

export interface WorkSpaceLicenseInfoInternal {
    LicensesDepMap: Record<string, (Dependency | undefined)[]>;
    NonSpdxLicensesDepMap: Record<string, (Dependency | undefined)[]>;
    LicenseComplianceViolations: Record<string, (Dependency | undefined)[]>;
    DependencyInfo: Record<string, DependencyInfo | undefined>;
}

export interface AnalysisStats {
    number_of_spdx_licenses: number;
    number_of_non_spdx_licenses: number;
    number_of_copy_left_licenses: number;
    number_of_permissive_licenses: number;
    license_dist: Record<string, number>;
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
    stats: AnalysisStats;
}

export interface Output {
    workspaces: Record<string, WorkSpaceLicenseInfo>;
    analysis_info: AnalysisInfo;
}
