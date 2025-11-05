export interface Output {
    license_infos: LicenseInfo[];
    dependency_infos: Record<string, DepShortInfo>;
}

export interface DepShortInfo {
    name: string;
    version: string;
    description?: string;
    package_manager_link?: string;
    package_manager: string;
}

export interface LicenseInfo {
    id: string;
    name: string;
    unable_to_infer: boolean;
    license_compliance_violation: boolean;
    description?: string;
    references?: string[];
    deps_using_license: string[];
    license_category?: string;
    license_properties?: LicenseProperties;
}

export interface LicenseProperties {
    permissions: string[];
    conditions: string[];
    limitations: string[];
}
