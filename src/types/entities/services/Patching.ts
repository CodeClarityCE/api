import { Status } from 'src/types/apiResponses';
import { Vulnerability } from './Vulnerabilities';

export interface Output {
    workspaces: { [key: string]: Workspace };
    analysis_info: AnalysisInfo;
}

export interface Workspace {
    patches: { [key: string]: PatchInfo };
    dev_patches: { [key: string]: PatchInfo };
}

export interface PatchInfo {
    TopLevelVulnerable: boolean;
    IsPatchable: string;
    Unpatchable: ToPatch[];
    Patchable: ToPatch[];
    Introduced: ToPatch[];
    Patches: { [key: string]: SemVer };
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
