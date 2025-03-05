import { Package, Source, LicenseNpm, Version } from 'src/codeclarity_modules/knowledge/package/package.entity';

export interface SeverityDist {
    critical: number;
    high: number;
    medium: number;
    low: number;
    none: number;
}

export enum LinkType {
    GITHUB = 'GITHUB',
    GITLAB = 'GITLAB',
    UNKOWN_GIT_SERVER = 'UNKOWN_GIT_SERVER',
    REMOTE_TARBALL = 'REMOTE_TARBALL',
    LOCAL_FILE = 'LOCAL_FILE',
    PACKAGE_MANAGED = 'PACKAGE_MANAGED',
    UNKNOWN_LINK_TYPE = 'UNKNOWN_LINK_TYPE',
    SELF_MANAGED = 'SELF_MANAGED'
}

export enum Status {
    Success = 'success',
    Failure = 'failure'
}

export interface Dependency {
    Key: string;
    Requires: { [key: string]: string };
    Dependencies: { [key: string]: string };
    Optional: boolean;
    Bundled: boolean;
    Dev: boolean;
    Transitive: boolean;
    Licenses: string[];
}

export class SbomDependency {
    name: string;
    version: string;
    newest_release: string;
}

export interface DependencyDetails {
    name: string;
    version: string;
    newest_release: string;
    dependencies: { [key: string]: string };
    dev_dependencies: { [key: string]: string };
    transitive: boolean;
    source?: Source;
    package_manager: string;
    license: string;
    engines: { [key: string]: string };
    // parents!: string[];
    // dependencies!: string[];
    // optional_dependencies!: string[];
    // peer_dependencies!: string[];
    // bundled_dependencies!: string[];
    // optional!: boolean;
    // bundled!: boolean;
    // peer!: boolean;
    // scoped!: boolean;
    // dev: boolean;
    // link_type!: LinkType;
    // version_type!: Enumerator;
    // purl!: string;
    // purl_no_version!: string;
    // linked_git_url?: ParsedGitUrl;
    // git_url?: ParsedGitUrl;
    // file_path!: string;
    // is_package_managed!: boolean;
    // is_self_managed!: boolean;
    // is_direct!: boolean;
    // is_transitive!: boolean;
    // is_direct_count!: number;
    // is_transitive_count!: number;
    // is_prod_count!: number;
    // is_dev_count!: number;
    // licenses!: string[];
    // non_spdx_licenses!: string[];
    // package_manager!: string;
    // vulnerable!: boolean;
    // vulnerabilities!: string[];
    // severity_dist!: SeverityDist;
    // mean_severity!: number;
    // combined_severity!: number;
    // patchable_paths!: string[];
    // patch_type!: string;
    // deprecated!: boolean;
    // outdated!: boolean;
    // unlicensed!: boolean;
    // deprecated_message!: string;
    // outdated_message!: string;
    // release!: Date;
    // version_age!: number;
    // newest_release!: string;
    // last_published!: Date;
    // engines!: Map<string, string>;
}

interface WorkSpaceDependency {
    name: string;
    version: string;
    constraint: string;
}

export interface WorkSpaceData {
    dependencies: { [key: string]: { [key: string]: Dependency } };
    start: {
        dependencies?: WorkSpaceDependency[];
        dev_dependencies?: WorkSpaceDependency[];
    };
}

export interface Output {
    workspaces: { [key: string]: WorkSpaceData };
    analysis_info: AnalysisInfo;
}

export interface AnalysisInfo {
    status: Status;
    private_errors: StatusError[];
    public_errors: StatusError[];
    project_name: string;
    working_directory: string;
    package_manager: string;
    lock_file_version: number;
    lock_file_path: string;
    package_file_path: string;
    relative_lock_file_path: string;
    relative_package_file_path: string;
    analysis_start_time: string;
    analysis_end_time: string;
    analysis_delta_time: number;
    version_seperator: string;
    import_path_seperator: string;
    default_workspace_name: string;
    self_managed_workspace_name: string;
    work_spaces_used: boolean;
    work_space_package_file_paths: { [key: string]: string };
    stats: { [key: string]: any };
}

export interface LicenseDist {
    [licenseId: string]: number;
}

export interface Stats {
    license_dist: LicenseDist;
    number_of_spdx_licenses: number;
    number_of_non_spdx_licenses: number;
    number_of_copy_left_licenses: number;
    number_of_permissive_licenses: number;
}

export interface StatusError {
    type: string;
    description: string;
}

export interface ParsedGitUrl {
    protocol: string;
    host: string;
    repo: string;
    user: string;
    project: string;
    repo_full_path: string;
    version: string;
    host_type: string;
}

export interface GraphOutput {
    graph: WorkSpaceData;
    project_name: string;
}

export interface WorkspacesOutput {
    workspaces_map: { [key: string]: string };
    package_manager: string;
}
