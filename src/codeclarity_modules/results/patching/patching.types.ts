import type { Status } from 'src/types/apiResponses.types';
import type { Vulnerability } from '../vulnerabilities/vulnerabilities.types';

export interface Output {
    workspaces: Record<string, Workspace>;
    analysis_info: AnalysisInfo;
}

export interface Workspace {
    patches: Record<string, PatchInfo>;
    dev_patches: Record<string, PatchInfo>;
}

export interface PatchInfo {
    TopLevelVulnerable: boolean;
    IsPatchable: string;
    Unpatchable: ToPatch[];
    Patchable: ToPatch[];
    Introduced: ToPatch[];
    Patches: Record<string, SemVer>;
    Update: SemVer;
}

interface SemVer {
    Major: number;
    Minor: number;
    Patch: number;
    PreReleaseTag: string;
    MetaData: string;
}

interface ToPatch {
    DependencyName: string;
    DependencyVersion: string;
    Path: string[];
    Vulnerability: Vulnerability;
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
}
