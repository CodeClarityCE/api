interface LicenseProperties {
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

interface DependencyInfo {
  Licenses: string[];
  NonSpdxLicenses: string[];
}

interface AnalysisStats {
  number_of_spdx_licenses: number;
  number_of_non_spdx_licenses: number;
  number_of_copy_left_licenses: number;
  number_of_permissive_licenses: number;
  license_dist: Record<string, number>;
}

export enum Status {
  Success = "success",
  Failure = "failure",
}

interface AnalysisInfo {
  status: Status;
  private_errors: unknown[];
  public_errors: unknown[];
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
