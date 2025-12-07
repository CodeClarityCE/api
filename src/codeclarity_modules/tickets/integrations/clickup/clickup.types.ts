/**
 * ClickUp API v2 Types
 * Documentation: https://clickup.com/api
 */

// ============================================
// Authentication
// ============================================

export interface ClickUpOAuthTokenResponse {
    access_token: string;
    token_type: string;
}

// ============================================
// User & Team
// ============================================

export interface ClickUpUser {
    id: number;
    username: string;
    email: string;
    color: string;
    profilePicture: string | null;
    initials: string;
    week_start_day: number;
    global_font_support: boolean;
    timezone: string;
}

export interface ClickUpTeam {
    id: string;
    name: string;
    color: string;
    avatar: string | null;
    members: ClickUpMember[];
}

export interface ClickUpMember {
    user: ClickUpUser;
}

export interface ClickUpAuthorizedUserResponse {
    user: ClickUpUser;
}

export interface ClickUpTeamsResponse {
    teams: ClickUpTeam[];
}

// ============================================
// Space
// ============================================

export interface ClickUpSpace {
    id: string;
    name: string;
    private: boolean;
    statuses: ClickUpStatus[];
    multiple_assignees: boolean;
    features: {
        due_dates: { enabled: boolean };
        sprints: { enabled: boolean };
        time_tracking: { enabled: boolean };
        points: { enabled: boolean };
        custom_items: { enabled: boolean };
        priorities: { enabled: boolean };
        tags: { enabled: boolean };
        time_estimates: { enabled: boolean };
        check_unresolved: { enabled: boolean };
        zoom: { enabled: boolean };
        milestones: { enabled: boolean };
        custom_fields: { enabled: boolean };
        remap_dependencies: { enabled: boolean };
        dependency_warning: { enabled: boolean };
        multiple_assignees: { enabled: boolean };
        portfolios: { enabled: boolean };
        emails: { enabled: boolean };
    };
    archived: boolean;
}

export interface ClickUpSpacesResponse {
    spaces: ClickUpSpace[];
}

// ============================================
// Folder
// ============================================

export interface ClickUpFolder {
    id: string;
    name: string;
    orderindex: number;
    override_statuses: boolean;
    hidden: boolean;
    space: {
        id: string;
        name: string;
    };
    task_count: string;
    archived: boolean;
    statuses: ClickUpStatus[];
    lists: ClickUpListSummary[];
    permission_level: string;
}

export interface ClickUpFoldersResponse {
    folders: ClickUpFolder[];
}

// ============================================
// List
// ============================================

export interface ClickUpListSummary {
    id: string;
    name: string;
    orderindex: number;
    status: {
        status: string;
        color: string;
        hide_label: boolean;
    } | null;
    priority: {
        priority: string;
        color: string;
    } | null;
    assignee: ClickUpUser | null;
    task_count: number;
    due_date: string | null;
    start_date: string | null;
    archived: boolean;
    override_statuses: boolean;
    statuses: ClickUpStatus[];
    permission_level: string;
}

export interface ClickUpList {
    id: string;
    name: string;
    orderindex: number;
    content: string;
    status: {
        status: string;
        color: string;
        hide_label: boolean;
    } | null;
    priority: {
        priority: string;
        color: string;
    } | null;
    assignee: ClickUpUser | null;
    task_count: number | null;
    due_date: string | null;
    due_date_time: boolean;
    start_date: string | null;
    start_date_time: boolean | null;
    folder: {
        id: string;
        name: string;
        hidden: boolean;
        access: boolean;
    };
    space: {
        id: string;
        name: string;
        access: boolean;
    };
    archived: boolean;
    override_statuses: boolean;
    statuses: ClickUpStatus[];
    permission_level: string;
}

export interface ClickUpListsResponse {
    lists: ClickUpList[];
}

// ============================================
// Task
// ============================================

export interface ClickUpStatus {
    id?: string;
    status: string;
    type: string;
    orderindex: number;
    color: string;
}

export interface ClickUpPriority {
    id: string;
    priority: string;
    color: string;
    orderindex: string;
}

export interface ClickUpTag {
    name: string;
    tag_fg: string;
    tag_bg: string;
}

export interface ClickUpTask {
    id: string;
    custom_id: string | null;
    name: string;
    text_content: string;
    description: string;
    status: {
        status: string;
        color: string;
        type: string;
        orderindex: number;
    };
    orderindex: string;
    date_created: string;
    date_updated: string;
    date_closed: string | null;
    archived: boolean;
    creator: {
        id: number;
        username: string;
        color: string;
        email: string;
        profilePicture: string | null;
    };
    assignees: ClickUpUser[];
    watchers: ClickUpUser[];
    checklists: unknown[];
    tags: ClickUpTag[];
    parent: string | null;
    priority: {
        id: string;
        priority: string;
        color: string;
        orderindex: string;
    } | null;
    due_date: string | null;
    start_date: string | null;
    points: number | null;
    time_estimate: number | null;
    time_spent: number | null;
    custom_fields: ClickUpCustomField[];
    dependencies: unknown[];
    linked_tasks: unknown[];
    team_id: string;
    url: string;
    sharing: {
        public: boolean;
        public_share_expires_on: string | null;
        public_fields: string[];
        token: string | null;
        seo_optimized: boolean;
    };
    permission_level: string;
    list: {
        id: string;
        name: string;
        access: boolean;
    };
    project: {
        id: string;
        name: string;
        hidden: boolean;
        access: boolean;
    };
    folder: {
        id: string;
        name: string;
        hidden: boolean;
        access: boolean;
    };
    space: {
        id: string;
    };
}

export interface ClickUpCustomField {
    id: string;
    name: string;
    type: string;
    type_config: unknown;
    date_created: string;
    hide_from_guests: boolean;
    value?: unknown;
    required: boolean;
}

// ============================================
// Task Creation
// ============================================

export interface ClickUpCreateTaskRequest {
    name: string;
    description?: string;
    markdown_description?: string;
    assignees?: number[];
    tags?: string[];
    status?: string;
    priority?: number | null;
    due_date?: number;
    due_date_time?: boolean;
    time_estimate?: number;
    start_date?: number;
    start_date_time?: boolean;
    notify_all?: boolean;
    parent?: string | null;
    links_to?: string | null;
    check_required_custom_fields?: boolean;
    custom_fields?: { id: string; value: unknown }[];
}

export interface ClickUpUpdateTaskRequest {
    name?: string;
    description?: string;
    markdown_description?: string;
    assignees?: {
        add?: number[];
        rem?: number[];
    };
    status?: string;
    priority?: number | null;
    due_date?: number | null;
    due_date_time?: boolean;
    time_estimate?: number;
    start_date?: number | null;
    start_date_time?: boolean;
    archived?: boolean;
}

// ============================================
// Space/Folder/List Creation
// ============================================

export interface ClickUpCreateSpaceRequest {
    name: string;
    multiple_assignees?: boolean;
    features?: {
        due_dates?: { enabled: boolean };
        time_tracking?: { enabled: boolean };
        tags?: { enabled: boolean };
        time_estimates?: { enabled: boolean };
        checklists?: { enabled: boolean };
        custom_fields?: { enabled: boolean };
        remap_dependencies?: { enabled: boolean };
        dependency_warning?: { enabled: boolean };
        portfolios?: { enabled: boolean };
    };
}

export interface ClickUpCreateFolderRequest {
    name: string;
}

export interface ClickUpCreateListRequest {
    name: string;
    content?: string;
    due_date?: number;
    due_date_time?: boolean;
    priority?: number;
    assignee?: number;
    status?: string;
}

// ============================================
// Priority Mappings
// ============================================

/**
 * ClickUp priority values:
 * 1 = Urgent (red)
 * 2 = High (orange)
 * 3 = Normal (yellow)
 * 4 = Low (gray)
 * null = No priority
 */
export enum ClickUpPriorityValue {
    URGENT = 1,
    HIGH = 2,
    NORMAL = 3,
    LOW = 4
}

// ============================================
// Error Response
// ============================================

export interface ClickUpErrorResponse {
    err: string;
    ECODE: string;
}

// ============================================
// API Configuration
// ============================================

export const CLICKUP_API_BASE_URL = 'https://api.clickup.com/api/v2';
export const CLICKUP_OAUTH_URL = 'https://app.clickup.com/api';

export interface ClickUpApiConfig {
    apiKey?: string;
    accessToken?: string;
}
