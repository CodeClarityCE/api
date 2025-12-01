/**
 * GitHub's repository type
 * API Version: 2022-11-28
 */
export interface GithubRepositorySchema {
    /**
     * Whether to allow Auto-merge to be used on pull requests.
     */
    allow_auto_merge?: boolean;
    /**
     * Whether to allow forking this repo
     */
    allow_forking?: boolean;
    /**
     * Whether to allow merge commits for pull requests.
     */
    allow_merge_commit?: boolean;
    /**
     * Whether to allow rebase merges for pull requests.
     */
    allow_rebase_merge?: boolean;
    /**
     * Whether to allow squash merges for pull requests.
     */
    allow_squash_merge?: boolean;
    /**
     * Whether or not a pull request head branch that is behind its base branch can always be
     * updated even if it is not required to be up to date before merging.
     */
    allow_update_branch?: boolean;
    /**
     * Whether anonymous git access is enabled for this repository
     */
    anonymous_access_enabled?: boolean;
    archive_url: string;
    /**
     * Whether the repository is archived.
     */
    archived: boolean;
    assignees_url: string;
    blobs_url: string;
    branches_url: string;
    clone_url: string;
    collaborators_url: string;
    comments_url: string;
    commits_url: string;
    compare_url: string;
    contents_url: string;
    contributors_url: string;
    created_at: Date | null;
    /**
     * The default branch of the repository.
     */
    default_branch: string;
    /**
     * Whether to delete head branches when pull requests are merged
     */
    delete_branch_on_merge?: boolean;
    deployments_url: string;
    description: null | string;
    /**
     * Returns whether or not this repository disabled.
     */
    disabled: boolean;
    downloads_url: string;
    events_url: string;
    fork: boolean;
    forks: number;
    forks_count: number;
    forks_url: string;
    full_name: string;
    git_commits_url: string;
    git_refs_url: string;
    git_tags_url: string;
    git_url: string;
    /**
     * Whether discussions are enabled.
     */
    has_discussions?: boolean;
    /**
     * Whether downloads are enabled.
     */
    has_downloads: boolean;
    /**
     * Whether issues are enabled.
     */
    has_issues: boolean;
    has_pages: boolean;
    /**
     * Whether projects are enabled.
     */
    has_projects: boolean;
    /**
     * Whether the wiki is enabled.
     */
    has_wiki: boolean;
    homepage: null | string;
    hooks_url: string;
    html_url: string;
    /**
     * Unique identifier of the repository
     */
    id: number;
    /**
     * Whether this repository acts as a template that can be used to generate new repositories.
     */
    is_template?: boolean;
    issue_comment_url: string;
    issue_events_url: string;
    issues_url: string;
    keys_url: string;
    labels_url: string;
    language: null | string;
    languages_url: string;
    license: null | LicenseSimple;
    master_branch?: string;
    /**
     * The default value for a merge commit message.
     *
     * - `PR_TITLE` - default to the pull request's title.
     * - `PR_BODY` - default to the pull request's body.
     * - `BLANK` - default to a blank commit message.
     */
    merge_commit_message?: MergeCommitMessage;
    /**
     * The default value for a merge commit title.
     *
     * - `PR_TITLE` - default to the pull request's title.
     * - `MERGE_MESSAGE` - default to the classic title for a merge message (e.g., Merge pull
     * request #123 from branch-name).
     */
    merge_commit_title?: MergeCommitTitle;
    merges_url: string;
    milestones_url: string;
    mirror_url: null | string;
    /**
     * The name of the repository.
     */
    name: string;
    network_count?: number;
    node_id: string;
    notifications_url: string;
    open_issues: number;
    open_issues_count: number;
    organization?: null | SimpleUser;
    /**
     * A GitHub user.
     */
    owner: OwnerObject;
    permissions?: CoordinatePermissions;
    /**
     * Whether the repository is private or public.
     */
    private: boolean;
    pulls_url: string;
    pushed_at: Date | null;
    releases_url: string;
    /**
     * The size of the repository. Size is calculated hourly. When a repository is initially
     * created, the size is 0.
     */
    size: number;
    /**
     * The default value for a squash merge commit message:
     *
     * - `PR_BODY` - default to the pull request's body.
     * - `COMMIT_MESSAGES` - default to the branch's commit messages.
     * - `BLANK` - default to a blank commit message.
     */
    squash_merge_commit_message?: SquashMergeCommitMessage;
    /**
     * The default value for a squash merge commit title:
     *
     * - `PR_TITLE` - default to the pull request's title.
     * - `COMMIT_OR_PR_TITLE` - default to the commit's title (if only one commit) or the pull
     * request's title (when more than one commit).
     */
    squash_merge_commit_title?: SquashMergeCommitTitle;
    ssh_url: string;
    stargazers_count: number;
    stargazers_url: string;
    starred_at?: string;
    statuses_url: string;
    subscribers_count?: number;
    subscribers_url: string;
    subscription_url: string;
    svn_url: string;
    tags_url: string;
    teams_url: string;
    temp_clone_token?: string;
    template_repository?: null | TemplateRepository;
    topics?: string[];
    trees_url: string;
    updated_at: Date | null;
    url: string;
    /**
     * Whether a squash merge commit can use the pull request title as default. **This property
     * has been deprecated. Please use `squash_merge_commit_title` instead.
     */
    use_squash_pr_title_as_default?: boolean;
    /**
     * The repository visibility: public, private, or internal.
     */
    visibility?: string;
    watchers: number;
    watchers_count: number;
    /**
     * Whether to require contributors to sign off on web-based commits
     */
    web_commit_signoff_required?: boolean;
    [property: string]: unknown;
}

/**
 * License Simple
 */
export interface LicenseSimple {
    html_url?: string;
    key: string;
    name: string;
    node_id: string;
    spdx_id: null | string;
    url: null | string;
    [property: string]: unknown;
}

/**
 * The default value for a merge commit message.
 *
 * - `PR_TITLE` - default to the pull request's title.
 * - `PR_BODY` - default to the pull request's body.
 * - `BLANK` - default to a blank commit message.
 */
export enum MergeCommitMessage {
    Blank = 'BLANK',
    PRBody = 'PR_BODY',
    PRTitle = 'PR_TITLE'
}

/**
 * The default value for a merge commit title.
 *
 * - `PR_TITLE` - default to the pull request's title.
 * - `MERGE_MESSAGE` - default to the classic title for a merge message (e.g., Merge pull
 * request #123 from branch-name).
 */
export enum MergeCommitTitle {
    MergeMessage = 'MERGE_MESSAGE',
    PRTitle = 'PR_TITLE'
}

/**
 * A GitHub user.
 */
export interface SimpleUser {
    avatar_url: string;
    email?: null | string;
    events_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    gravatar_id: null | string;
    html_url: string;
    id: number;
    login: string;
    name?: null | string;
    node_id: string;
    organizations_url: string;
    received_events_url: string;
    repos_url: string;
    site_admin: boolean;
    starred_at?: string;
    starred_url: string;
    subscriptions_url: string;
    type: string;
    url: string;
    [property: string]: unknown;
}

/**
 * A GitHub user.
 */
export interface OwnerObject {
    avatar_url: string;
    email?: null | string;
    events_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    gravatar_id: null | string;
    html_url: string;
    id: number;
    login: string;
    name?: null | string;
    node_id: string;
    organizations_url: string;
    received_events_url: string;
    repos_url: string;
    site_admin: boolean;
    starred_at?: string;
    starred_url: string;
    subscriptions_url: string;
    type: string;
    url: string;
    [property: string]: unknown;
}

export interface CoordinatePermissions {
    admin: boolean;
    maintain?: boolean;
    pull: boolean;
    push: boolean;
    triage?: boolean;
    [property: string]: unknown;
}

/**
 * The default value for a squash merge commit message:
 *
 * - `PR_BODY` - default to the pull request's body.
 * - `COMMIT_MESSAGES` - default to the branch's commit messages.
 * - `BLANK` - default to a blank commit message.
 */
export enum SquashMergeCommitMessage {
    Blank = 'BLANK',
    CommitMessages = 'COMMIT_MESSAGES',
    PRBody = 'PR_BODY'
}

/**
 * The default value for a squash merge commit title:
 *
 * - `PR_TITLE` - default to the pull request's title.
 * - `COMMIT_OR_PR_TITLE` - default to the commit's title (if only one commit) or the pull
 * request's title (when more than one commit).
 */
export enum SquashMergeCommitTitle {
    CommitOrPRTitle = 'COMMIT_OR_PR_TITLE',
    PRTitle = 'PR_TITLE'
}

export interface TemplateRepository {
    allow_auto_merge?: boolean;
    allow_merge_commit?: boolean;
    allow_rebase_merge?: boolean;
    allow_squash_merge?: boolean;
    allow_update_branch?: boolean;
    archive_url?: string;
    archived?: boolean;
    assignees_url?: string;
    blobs_url?: string;
    branches_url?: string;
    clone_url?: string;
    collaborators_url?: string;
    comments_url?: string;
    commits_url?: string;
    compare_url?: string;
    contents_url?: string;
    contributors_url?: string;
    created_at?: string;
    default_branch?: string;
    delete_branch_on_merge?: boolean;
    deployments_url?: string;
    description?: string;
    disabled?: boolean;
    downloads_url?: string;
    events_url?: string;
    fork?: boolean;
    forks_count?: number;
    forks_url?: string;
    full_name?: string;
    git_commits_url?: string;
    git_refs_url?: string;
    git_tags_url?: string;
    git_url?: string;
    has_downloads?: boolean;
    has_issues?: boolean;
    has_pages?: boolean;
    has_projects?: boolean;
    has_wiki?: boolean;
    homepage?: string;
    hooks_url?: string;
    html_url?: string;
    id?: number;
    is_template?: boolean;
    issue_comment_url?: string;
    issue_events_url?: string;
    issues_url?: string;
    keys_url?: string;
    labels_url?: string;
    language?: string;
    languages_url?: string;
    /**
     * The default value for a merge commit message.
     *
     * - `PR_TITLE` - default to the pull request's title.
     * - `PR_BODY` - default to the pull request's body.
     * - `BLANK` - default to a blank commit message.
     */
    merge_commit_message?: MergeCommitMessage;
    /**
     * The default value for a merge commit title.
     *
     * - `PR_TITLE` - default to the pull request's title.
     * - `MERGE_MESSAGE` - default to the classic title for a merge message (e.g., Merge pull
     * request #123 from branch-name).
     */
    merge_commit_title?: MergeCommitTitle;
    merges_url?: string;
    milestones_url?: string;
    mirror_url?: string;
    name?: string;
    network_count?: number;
    node_id?: string;
    notifications_url?: string;
    open_issues_count?: number;
    owner?: Owner;
    permissions?: TemplateRepositoryPermissions;
    private?: boolean;
    pulls_url?: string;
    pushed_at?: string;
    releases_url?: string;
    size?: number;
    /**
     * The default value for a squash merge commit message:
     *
     * - `PR_BODY` - default to the pull request's body.
     * - `COMMIT_MESSAGES` - default to the branch's commit messages.
     * - `BLANK` - default to a blank commit message.
     */
    squash_merge_commit_message?: SquashMergeCommitMessage;
    /**
     * The default value for a squash merge commit title:
     *
     * - `PR_TITLE` - default to the pull request's title.
     * - `COMMIT_OR_PR_TITLE` - default to the commit's title (if only one commit) or the pull
     * request's title (when more than one commit).
     */
    squash_merge_commit_title?: SquashMergeCommitTitle;
    ssh_url?: string;
    stargazers_count?: number;
    stargazers_url?: string;
    statuses_url?: string;
    subscribers_count?: number;
    subscribers_url?: string;
    subscription_url?: string;
    svn_url?: string;
    tags_url?: string;
    teams_url?: string;
    temp_clone_token?: string;
    topics?: string[];
    trees_url?: string;
    updated_at?: string;
    url?: string;
    use_squash_pr_title_as_default?: boolean;
    visibility?: string;
    watchers_count?: number;
    [property: string]: unknown;
}

export interface Owner {
    avatar_url?: string;
    events_url?: string;
    followers_url?: string;
    following_url?: string;
    gists_url?: string;
    gravatar_id?: string;
    html_url?: string;
    id?: number;
    login?: string;
    node_id?: string;
    organizations_url?: string;
    received_events_url?: string;
    repos_url?: string;
    site_admin?: boolean;
    starred_url?: string;
    subscriptions_url?: string;
    type?: string;
    url?: string;
    [property: string]: unknown;
}

export interface TemplateRepositoryPermissions {
    admin?: boolean;
    maintain?: boolean;
    pull?: boolean;
    push?: boolean;
    triage?: boolean;
    [property: string]: unknown;
}

export interface GithubOAuthAccessTokenResponse {
    access_token: string;
    token_type: string;
    scope: string;
}

export type GithubUserResponse = PrivateUser | PublicUser;

/**
 * Private User
 */
export interface PrivateUser {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    gravatar_id: string | null;
    url: string;
    html_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    starred_url: string;
    subscriptions_url: string;
    organizations_url: string;
    repos_url: string;
    events_url: string;
    received_events_url: string;
    type: string;
    site_admin: boolean;
    name: string | null;
    company: string | null;
    blog: string | null;
    location: string | null;
    email: string | null;
    hireable: boolean | null;
    bio: string | null;
    twitter_username?: string | null;
    public_repos: number;
    public_gists: number;
    followers: number;
    following: number;
    created_at: string;
    updated_at: string;
    private_gists: number;
    total_private_repos: number;
    owned_private_repos: number;
    disk_usage: number;
    collaborators: number;
    two_factor_authentication: boolean;
    plan?: {
        collaborators: number;
        name: string;
        space: number;
        private_repos: number;
        [k: string]: unknown;
    };
    suspended_at?: string | null;
    business_plus?: boolean;
    ldap_dn?: string;
    [k: string]: unknown;
}
/**
 * Public User
 */
export interface PublicUser {
    login: string;
    id: number;
    node_id: string;
    avatar_url: string;
    gravatar_id: string | null;
    url: string;
    html_url: string;
    followers_url: string;
    following_url: string;
    gists_url: string;
    starred_url: string;
    subscriptions_url: string;
    organizations_url: string;
    repos_url: string;
    events_url: string;
    received_events_url: string;
    type: string;
    site_admin: boolean;
    name: string | null;
    company: string | null;
    blog: string | null;
    location: string | null;
    email: string | null;
    hireable: boolean | null;
    bio: string | null;
    twitter_username?: string | null;
    public_repos: number;
    public_gists: number;
    followers: number;
    following: number;
    created_at: string;
    updated_at: string;
    plan?: {
        collaborators: number;
        name: string;
        space: number;
        private_repos: number;
        [k: string]: unknown;
    };
    suspended_at?: string | null;
    private_gists?: number;
    total_private_repos?: number;
    owned_private_repos?: number;
    disk_usage?: number;
    collaborators?: number;
}

export interface GithubEmail {
    email: string;
    primary: boolean;
    verified: boolean;
    visibility: string | null;
}
