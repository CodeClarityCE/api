-- The codeclarity schema of a fresh v0.0.57-alpha install, which the beta baseline builds on an empty database.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;

CREATE TYPE "public"."analysis_schedule_type_enum" AS ENUM ('once', 'daily', 'weekly');

CREATE TYPE "public"."dataset_status_enum" AS ENUM ('BUILDING', 'READY', 'FAILED');

CREATE TYPE "public"."experiment_grid_interval_enum" AS ENUM ('day', 'week', 'month');

CREATE TYPE "public"."experiment_run_status_enum" AS ENUM ('pending', 'done', 'failed', 'skipped');

CREATE TYPE "public"."experiment_status_enum" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'CANCELLED', 'FAILED');

CREATE TYPE "public"."ticket_event_event_type_enum" AS ENUM ('CREATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'UNASSIGNED', 'SYNCED_EXTERNAL', 'UNLINKED_EXTERNAL', 'OCCURRENCE_ADDED', 'OCCURRENCE_RESOLVED', 'RESOLVED', 'REOPENED', 'COMMENT_ADDED', 'DUE_DATE_CHANGED');

CREATE TYPE "public"."ticket_external_link_provider_enum" AS ENUM ('CLICKUP', 'JIRA', 'LINEAR');

CREATE TYPE "public"."ticket_integration_config_provider_enum" AS ENUM ('CLICKUP', 'JIRA', 'LINEAR');

CREATE TYPE "public"."ticket_priority_enum" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

CREATE TYPE "public"."ticket_status_enum" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'WONT_FIX');

CREATE TYPE "public"."ticket_type_enum" AS ENUM ('VULNERABILITY', 'LICENSE', 'UPGRADE');

CREATE TABLE "analysis" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "analysis_id_not_null" NOT NULL,
  "created_on" timestamp with time zone CONSTRAINT "analysis_created_on_not_null" NOT NULL,
  "config" jsonb CONSTRAINT "analysis_config_not_null" NOT NULL,
  "stage" integer,
  "status" character varying CONSTRAINT "analysis_status_not_null" NOT NULL,
  "steps" jsonb CONSTRAINT "analysis_steps_not_null" NOT NULL,
  "started_on" timestamp with time zone,
  "ended_on" timestamp with time zone,
  "branch" character varying(25) CONSTRAINT "analysis_branch_not_null" NOT NULL,
  "tag" character varying(25),
  "commit_hash" character varying(64),
  "projectId" uuid,
  "analyzerId" uuid,
  "organizationId" uuid,
  "integrationId" uuid,
  "createdById" uuid,
  "schedule_type" analysis_schedule_type_enum DEFAULT 'once'::analysis_schedule_type_enum,
  "next_scheduled_run" timestamp with time zone,
  "is_active" boolean DEFAULT true CONSTRAINT "analysis_is_active_not_null" NOT NULL,
  "last_scheduled_run" timestamp with time zone,
  "failure_reason" character varying(500),
  "vulnerability_instances_stored_on" timestamp with time zone,
  "vulnerability_instances_have_results" boolean DEFAULT false CONSTRAINT "analysis_vulnerability_instances_have_results_not_null" NOT NULL
);

CREATE TABLE "analyzer" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "analyzer_id_not_null" NOT NULL,
  "name" character varying(25) CONSTRAINT "analyzer_name_not_null" NOT NULL,
  "description" text CONSTRAINT "analyzer_description_not_null" NOT NULL,
  "created_on" timestamp with time zone CONSTRAINT "analyzer_created_on_not_null" NOT NULL,
  "steps" jsonb CONSTRAINT "analyzer_steps_not_null" NOT NULL,
  "organizationId" uuid,
  "createdById" uuid,
  "global" boolean CONSTRAINT "analyzer_global_not_null" NOT NULL,
  "supported_languages" character varying[] DEFAULT '{javascript}'::character varying[] CONSTRAINT "analyzer_supported_languages_not_null" NOT NULL,
  "language_config" jsonb,
  "logo" character varying(50) DEFAULT 'js'::character varying CONSTRAINT "analyzer_logo_not_null" NOT NULL
);

CREATE TABLE "dataset" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "dataset_id_not_null" NOT NULL,
  "name" character varying(100) CONSTRAINT "dataset_name_not_null" NOT NULL,
  "status" dataset_status_enum DEFAULT 'BUILDING'::dataset_status_enum CONSTRAINT "dataset_status_not_null" NOT NULL,
  "params" jsonb CONSTRAINT "dataset_params_not_null" NOT NULL,
  "stats" jsonb,
  "error" character varying(1000),
  "lease_owner" character varying(200),
  "lease_until" timestamp with time zone,
  "created_on" timestamp with time zone CONSTRAINT "dataset_created_on_not_null" NOT NULL,
  "built_on" timestamp with time zone,
  "organizationId" uuid,
  "createdById" uuid,
  "integrationId" uuid
);

CREATE TABLE "dataset_entry" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "dataset_entry_id_not_null" NOT NULL,
  "rank" integer CONSTRAINT "dataset_entry_rank_not_null" NOT NULL,
  "full_name" character varying(200) CONSTRAINT "dataset_entry_full_name_not_null" NOT NULL,
  "owner" character varying(100) CONSTRAINT "dataset_entry_owner_not_null" NOT NULL,
  "repo" character varying(100) CONSTRAINT "dataset_entry_repo_not_null" NOT NULL,
  "git_url" character varying(300) CONSTRAINT "dataset_entry_git_url_not_null" NOT NULL,
  "default_branch" character varying(255) CONSTRAINT "dataset_entry_default_branch_not_null" NOT NULL,
  "stars" integer CONSTRAINT "dataset_entry_stars_not_null" NOT NULL,
  "language" character varying(50),
  "github_id" bigint,
  "lockfiles" jsonb CONSTRAINT "dataset_entry_lockfiles_not_null" NOT NULL,
  "datasetId" uuid
);

CREATE TABLE "email" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "email_id_not_null" NOT NULL,
  "token_digest" character varying(250) CONSTRAINT "email_token_digest_not_null" NOT NULL,
  "email_type" character varying CONSTRAINT "email_email_type_not_null" NOT NULL,
  "user_id_digest" character varying(250) CONSTRAINT "email_user_id_digest_not_null" NOT NULL,
  "ttl" timestamp with time zone,
  "userId" uuid
);

CREATE TABLE "experiment" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "experiment_id_not_null" NOT NULL,
  "name" character varying(100) CONSTRAINT "experiment_name_not_null" NOT NULL,
  "status" experiment_status_enum DEFAULT 'PENDING'::experiment_status_enum CONSTRAINT "experiment_status_not_null" NOT NULL,
  "retries" integer DEFAULT 2 CONSTRAINT "experiment_retries_not_null" NOT NULL,
  "error" character varying(1000),
  "analyzer_steps" jsonb,
  "provenance" jsonb,
  "lease_owner" character varying(200),
  "lease_until" timestamp with time zone,
  "created_on" timestamp with time zone CONSTRAINT "experiment_created_on_not_null" NOT NULL,
  "started_on" timestamp with time zone,
  "ended_on" timestamp with time zone,
  "organizationId" uuid,
  "createdById" uuid,
  "datasetId" uuid CONSTRAINT "experiment_datasetId_not_null" NOT NULL,
  "analyzerId" uuid,
  "grid_interval" experiment_grid_interval_enum DEFAULT 'month'::experiment_grid_interval_enum CONSTRAINT "experiment_grid_interval_not_null" NOT NULL,
  "grid_count" integer DEFAULT 0 CONSTRAINT "experiment_grid_count_not_null" NOT NULL,
  "analysis_budget" integer
);

CREATE TABLE "experiment_figure" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "experiment_figure_id_not_null" NOT NULL,
  "name" character varying(100) CONSTRAINT "experiment_figure_name_not_null" NOT NULL,
  "definition" jsonb CONSTRAINT "experiment_figure_definition_not_null" NOT NULL,
  "created_on" timestamp with time zone CONSTRAINT "experiment_figure_created_on_not_null" NOT NULL,
  "experimentId" uuid CONSTRAINT "experiment_figure_experimentId_not_null" NOT NULL,
  "publishedResultsId" uuid
);

CREATE TABLE "experiment_probe" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "experiment_probe_id_not_null" NOT NULL,
  "commit_hash" character varying(64) CONSTRAINT "experiment_probe_commit_hash_not_null" NOT NULL,
  "committed_at" timestamp with time zone,
  "status" character varying(16) DEFAULT 'pending'::character varying CONSTRAINT "experiment_probe_status_not_null" NOT NULL,
  "error" character varying(1000),
  "submitted_on" timestamp with time zone,
  "ended_on" timestamp with time zone,
  "experimentId" uuid CONSTRAINT "experiment_probe_experimentId_not_null" NOT NULL,
  "datasetEntryId" uuid CONSTRAINT "experiment_probe_datasetEntryId_not_null" NOT NULL,
  "analysisId" uuid
);

CREATE TABLE "experiment_probe_interval" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "experiment_probe_interval_id_not_null" NOT NULL,
  "from_commit" character varying(64) CONSTRAINT "experiment_probe_interval_from_commit_not_null" NOT NULL,
  "to_commit" character varying(64) CONSTRAINT "experiment_probe_interval_to_commit_not_null" NOT NULL,
  "lockfile_path" text,
  "candidates" jsonb CONSTRAINT "experiment_probe_interval_candidates_not_null" NOT NULL,
  "error" character varying(1000),
  "experimentId" uuid CONSTRAINT "experiment_probe_interval_experimentId_not_null" NOT NULL,
  "datasetEntryId" uuid CONSTRAINT "experiment_probe_interval_datasetEntryId_not_null" NOT NULL
);

CREATE TABLE "experiment_probe_outcome" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "experiment_probe_outcome_id_not_null" NOT NULL,
  "commit_hash" character varying(64) CONSTRAINT "experiment_probe_outcome_commit_hash_not_null" NOT NULL,
  "committed_at" timestamp with time zone,
  "packages" jsonb CONSTRAINT "experiment_probe_outcome_packages_not_null" NOT NULL,
  "experimentId" uuid CONSTRAINT "experiment_probe_outcome_experimentId_not_null" NOT NULL,
  "datasetEntryId" uuid CONSTRAINT "experiment_probe_outcome_datasetEntryId_not_null" NOT NULL
);

CREATE TABLE "experiment_published_figure_data" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "experiment_published_figure_data_id_not_null" NOT NULL,
  "definition_key" text CONSTRAINT "experiment_published_figure_data_definition_key_not_null" NOT NULL,
  "data" jsonb CONSTRAINT "experiment_published_figure_data_data_not_null" NOT NULL,
  "publishedResultsId" uuid CONSTRAINT "experiment_published_figure_data_publishedResultsId_not_null" NOT NULL
);

CREATE TABLE "experiment_published_results" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "experiment_published_results_id_not_null" NOT NULL,
  "metric_version" integer CONSTRAINT "experiment_published_results_metric_version_not_null" NOT NULL,
  "results" jsonb CONSTRAINT "experiment_published_results_results_not_null" NOT NULL,
  "package_checksum" character varying(64),
  "published_on" timestamp with time zone CONSTRAINT "experiment_published_results_published_on_not_null" NOT NULL,
  "experimentId" uuid CONSTRAINT "experiment_published_results_experimentId_not_null" NOT NULL,
  "publishedById" uuid,
  "package_archive" bytea
);

CREATE TABLE "experiment_run" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "experiment_run_id_not_null" NOT NULL,
  "status" experiment_run_status_enum DEFAULT 'pending'::experiment_run_status_enum CONSTRAINT "experiment_run_status_not_null" NOT NULL,
  "error" character varying(1000),
  "attempts" integer DEFAULT 0 CONSTRAINT "experiment_run_attempts_not_null" NOT NULL,
  "branch" character varying(255),
  "commit_hash" character varying(64),
  "committed_at" timestamp with time zone,
  "submitted_on" timestamp with time zone,
  "first_submitted_on" timestamp with time zone,
  "ended_on" timestamp with time zone,
  "experimentId" uuid,
  "datasetEntryId" uuid CONSTRAINT "experiment_run_datasetEntryId_not_null" NOT NULL,
  "analysisId" uuid,
  "grid_index" integer DEFAULT 0 CONSTRAINT "experiment_run_grid_index_not_null" NOT NULL,
  "grid_date" timestamp with time zone,
  "sharedFromId" uuid,
  "knowledge" jsonb
);

CREATE TABLE "experiment_run_summary_row" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "experiment_run_summary_row_id_not_null" NOT NULL,
  "total_dependencies" integer CONSTRAINT "experiment_run_summary_row_total_dependencies_not_null" NOT NULL,
  "direct_dependencies" integer CONSTRAINT "experiment_run_summary_row_direct_dependencies_not_null" NOT NULL,
  "transitive_dependencies" integer CONSTRAINT "experiment_run_summary_row_transitive_dependencies_not_null" NOT NULL,
  "dev_dependencies" integer CONSTRAINT "experiment_run_summary_row_dev_dependencies_not_null" NOT NULL,
  "prod_dependencies" integer CONSTRAINT "experiment_run_summary_row_prod_dependencies_not_null" NOT NULL,
  "package_manager" character varying(32),
  "total_vulnerabilities" integer CONSTRAINT "experiment_run_summary_row_total_vulnerabilities_not_null" NOT NULL,
  "vulnerable_dependencies" integer CONSTRAINT "experiment_run_summary_row_vulnerable_dependencies_not_null" NOT NULL,
  "direct_vulnerabilities" integer CONSTRAINT "experiment_run_summary_row_direct_vulnerabilities_not_null" NOT NULL,
  "transitive_vulnerabilities" integer CONSTRAINT "experiment_run_summary_row_transitive_vulnerabilities_not_null" NOT NULL,
  "n_critical" integer CONSTRAINT "experiment_run_summary_row_n_critical_not_null" NOT NULL,
  "n_high" integer CONSTRAINT "experiment_run_summary_row_n_high_not_null" NOT NULL,
  "n_medium" integer CONSTRAINT "experiment_run_summary_row_n_medium_not_null" NOT NULL,
  "n_low" integer CONSTRAINT "experiment_run_summary_row_n_low_not_null" NOT NULL,
  "n_none" integer CONSTRAINT "experiment_run_summary_row_n_none_not_null" NOT NULL,
  "experimentId" uuid CONSTRAINT "experiment_run_summary_row_experimentId_not_null" NOT NULL,
  "runId" uuid CONSTRAINT "experiment_run_summary_row_runId_not_null" NOT NULL
);

CREATE TABLE "experiment_vulnerability_instance" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "experiment_vulnerability_instance_id_not_null" NOT NULL,
  "workspace" character varying CONSTRAINT "experiment_vulnerability_instance_workspace_not_null" NOT NULL,
  "vulnerability_id" character varying,
  "affected_dependency" character varying,
  "affected_version" character varying,
  "severity_class" character varying,
  "severity_score" double precision,
  "severity_vector" character varying,
  "impact" double precision,
  "exploitability" double precision,
  "epss_score" double precision,
  "epss_percentile" double precision,
  "conflict_flag" character varying,
  "winning_source" character varying,
  "direct_dependency" boolean CONSTRAINT "experiment_vulnerability_instance_direct_dependency_not_null" NOT NULL,
  "published_date" character varying,
  "modified_date" character varying,
  "withdrawn_date" character varying,
  "experimentId" uuid CONSTRAINT "experiment_vulnerability_instance_experimentId_not_null" NOT NULL,
  "runId" uuid CONSTRAINT "experiment_vulnerability_instance_runId_not_null" NOT NULL,
  "vulnerable_versions" jsonb,
  "osv_verdict" character varying,
  "nvd_verdict" character varying,
  "gcve_verdict" character varying,
  "instance_status" character varying,
  "uncorroborated" boolean,
  "disputed" boolean
);

CREATE TABLE "file" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "file_id_not_null" NOT NULL,
  "added_on" timestamp with time zone CONSTRAINT "file_added_on_not_null" NOT NULL,
  "type" character varying CONSTRAINT "file_type_not_null" NOT NULL,
  "name" character varying CONSTRAINT "file_name_not_null" NOT NULL,
  "projectId" uuid,
  "addedById" uuid
);

CREATE TABLE "integration" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "integration_id_not_null" NOT NULL,
  "integration_type" character varying(25) CONSTRAINT "integration_integration_type_not_null" NOT NULL,
  "integration_provider" character varying(25) CONSTRAINT "integration_integration_provider_not_null" NOT NULL,
  "access_token" character varying(100) CONSTRAINT "integration_access_token_not_null" NOT NULL,
  "token_type" character varying(100),
  "refresh_token" character varying(100),
  "expiry_date" timestamp with time zone,
  "invalid" boolean CONSTRAINT "integration_invalid_not_null" NOT NULL,
  "service_domain" character varying(255) CONSTRAINT "integration_service_domain_not_null" NOT NULL,
  "added_on" timestamp with time zone CONSTRAINT "integration_added_on_not_null" NOT NULL,
  "last_repository_sync" timestamp with time zone,
  "repositoryCacheId" uuid,
  "ownerId" uuid
);

CREATE TABLE "invitation" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "invitation_id_not_null" NOT NULL,
  "created_on" timestamp with time zone,
  "role" integer CONSTRAINT "invitation_role_not_null" NOT NULL,
  "token_digest" character varying(250) CONSTRAINT "invitation_token_digest_not_null" NOT NULL,
  "user_email_digest" character varying(250) CONSTRAINT "invitation_user_email_digest_not_null" NOT NULL,
  "ttl" timestamp with time zone,
  "organizationId" uuid,
  "userId" uuid
);

CREATE TABLE "js_version" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "js_version_id_not_null" NOT NULL,
  "version" character varying(255) CONSTRAINT "js_version_version_not_null" NOT NULL,
  "dependencies" jsonb,
  "dev_dependencies" jsonb,
  "extra" jsonb,
  "packageId" uuid
);

CREATE TABLE "log" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "log_id_not_null" NOT NULL,
  "action_severity" integer CONSTRAINT "log_action_severity_not_null" NOT NULL,
  "action_class" character varying(25) CONSTRAINT "log_action_class_not_null" NOT NULL,
  "action" character varying(50) CONSTRAINT "log_action_not_null" NOT NULL,
  "description" text CONSTRAINT "log_description_not_null" NOT NULL,
  "blame_on_email" character varying(100) CONSTRAINT "log_blame_on_email_not_null" NOT NULL,
  "created_on" timestamp with time zone CONSTRAINT "log_created_on_not_null" NOT NULL,
  "organization_id" character varying CONSTRAINT "log_organization_id_not_null" NOT NULL,
  "blame_on" character varying,
  "organizationId" uuid
);

CREATE TABLE "notification" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "notification_id_not_null" NOT NULL,
  "title" character varying(100) CONSTRAINT "notification_title_not_null" NOT NULL,
  "description" text CONSTRAINT "notification_description_not_null" NOT NULL,
  "content" jsonb CONSTRAINT "notification_content_not_null" NOT NULL,
  "type" character varying CONSTRAINT "notification_type_not_null" NOT NULL,
  "content_type" character varying CONSTRAINT "notification_content_type_not_null" NOT NULL
);

CREATE TABLE "notification_users_user" (
  "notificationId" uuid CONSTRAINT "notification_users_user_notificationId_not_null" NOT NULL,
  "userId" uuid CONSTRAINT "notification_users_user_userId_not_null" NOT NULL
);

CREATE TABLE "organization" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "organization_id_not_null" NOT NULL,
  "name" character varying(100) CONSTRAINT "organization_name_not_null" NOT NULL,
  "description" text CONSTRAINT "organization_description_not_null" NOT NULL,
  "color_scheme" character varying(5) CONSTRAINT "organization_color_scheme_not_null" NOT NULL,
  "created_on" timestamp with time zone CONSTRAINT "organization_created_on_not_null" NOT NULL,
  "personal" boolean CONSTRAINT "organization_personal_not_null" NOT NULL,
  "createdById" uuid,
  "auto_resolve_tickets" boolean DEFAULT false CONSTRAINT "organization_auto_resolve_tickets_not_null" NOT NULL,
  "freshness_threshold_days" integer DEFAULT 14 CONSTRAINT "organization_freshness_threshold_days_not_null" NOT NULL,
  "service_level_targets_enabled" boolean DEFAULT false CONSTRAINT "organization_service_level_targets_enabled_not_null" NOT NULL,
  "service_level_targets" jsonb DEFAULT '{"low": null, "high": 30, "medium": 90, "critical": 7}'::jsonb CONSTRAINT "organization_service_level_targets_not_null" NOT NULL
);

CREATE TABLE "organization_integrations_integration" (
  "organizationId" uuid CONSTRAINT "organization_integrations_integration_organizationId_not_null" NOT NULL,
  "integrationId" uuid CONSTRAINT "organization_integrations_integration_integrationId_not_null" NOT NULL
);

CREATE TABLE "organization_invited_user" (
  "organizationId" uuid CONSTRAINT "organization_invited_user_organizationId_not_null" NOT NULL,
  "userId" uuid CONSTRAINT "organization_invited_user_userId_not_null" NOT NULL
);

CREATE TABLE "organization_memberships" (
  "organizationMembershipId" uuid DEFAULT uuid_generate_v4() CONSTRAINT "organization_memberships_organizationMembershipId_not_null" NOT NULL,
  "organizationId" uuid,
  "userId" uuid,
  "role" integer CONSTRAINT "organization_memberships_role_not_null" NOT NULL,
  "joined_on" timestamp with time zone CONSTRAINT "organization_memberships_joined_on_not_null" NOT NULL
);

CREATE TABLE "organization_notifications_notification" (
  "organizationId" uuid CONSTRAINT "organization_notifications_notification_organizationId_not_null" NOT NULL,
  "notificationId" uuid CONSTRAINT "organization_notifications_notification_notificationId_not_null" NOT NULL
);

CREATE TABLE "organization_owners_user" (
  "organizationId" uuid CONSTRAINT "organization_owners_user_organizationId_not_null" NOT NULL,
  "userId" uuid CONSTRAINT "organization_owners_user_userId_not_null" NOT NULL
);

CREATE TABLE "organization_policies_policy" (
  "organizationId" uuid CONSTRAINT "organization_policies_policy_organizationId_not_null" NOT NULL,
  "policyId" uuid CONSTRAINT "organization_policies_policy_policyId_not_null" NOT NULL
);

CREATE TABLE "organization_projects_project" (
  "organizationId" uuid CONSTRAINT "organization_projects_project_organizationId_not_null" NOT NULL,
  "projectId" uuid CONSTRAINT "organization_projects_project_projectId_not_null" NOT NULL
);

CREATE TABLE "policy" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "policy_id_not_null" NOT NULL,
  "name" character varying CONSTRAINT "policy_name_not_null" NOT NULL,
  "description" character varying CONSTRAINT "policy_description_not_null" NOT NULL,
  "content" jsonb CONSTRAINT "policy_content_not_null" NOT NULL,
  "policy_type" character varying CONSTRAINT "policy_policy_type_not_null" NOT NULL,
  "default" boolean CONSTRAINT "policy_default_not_null" NOT NULL,
  "created_on" timestamp with time zone CONSTRAINT "policy_created_on_not_null" NOT NULL,
  "createdById" uuid
);

CREATE TABLE "policy_analyses_analysis" (
  "policyId" uuid CONSTRAINT "policy_analyses_analysis_policyId_not_null" NOT NULL,
  "analysisId" uuid CONSTRAINT "policy_analyses_analysis_analysisId_not_null" NOT NULL
);

CREATE TABLE "project" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "project_id_not_null" NOT NULL,
  "added_on" timestamp with time zone CONSTRAINT "project_added_on_not_null" NOT NULL,
  "service_domain" character varying(255),
  "integration_type" character varying CONSTRAINT "project_integration_type_not_null" NOT NULL,
  "integration_provider" character varying CONSTRAINT "project_integration_provider_not_null" NOT NULL,
  "invalid" boolean CONSTRAINT "project_invalid_not_null" NOT NULL,
  "expiry_date" timestamp with time zone,
  "downloaded" boolean CONSTRAINT "project_downloaded_not_null" NOT NULL,
  "default_branch" character varying CONSTRAINT "project_default_branch_not_null" NOT NULL,
  "url" character varying CONSTRAINT "project_url_not_null" NOT NULL,
  "name" character varying CONSTRAINT "project_name_not_null" NOT NULL,
  "description" character varying CONSTRAINT "project_description_not_null" NOT NULL,
  "type" character varying CONSTRAINT "project_type_not_null" NOT NULL,
  "integrationId" uuid,
  "addedById" uuid
);

CREATE TABLE "repository_cache" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "repository_cache_id_not_null" NOT NULL,
  "repository_type" character varying CONSTRAINT "repository_cache_repository_type_not_null" NOT NULL,
  "url" character varying CONSTRAINT "repository_cache_url_not_null" NOT NULL,
  "default_branch" character varying CONSTRAINT "repository_cache_default_branch_not_null" NOT NULL,
  "visibility" character varying CONSTRAINT "repository_cache_visibility_not_null" NOT NULL,
  "fully_qualified_name" character varying CONSTRAINT "repository_cache_fully_qualified_name_not_null" NOT NULL,
  "service_domain" character varying,
  "description" character varying CONSTRAINT "repository_cache_description_not_null" NOT NULL,
  "created_at" timestamp with time zone CONSTRAINT "repository_cache_created_at_not_null" NOT NULL,
  "integrationId" uuid
);

CREATE TABLE "result" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "result_id_not_null" NOT NULL,
  "result" jsonb CONSTRAINT "result_result_not_null" NOT NULL,
  "plugin" character varying CONSTRAINT "result_plugin_not_null" NOT NULL,
  "analysisId" uuid,
  "created_on" timestamp without time zone DEFAULT now() CONSTRAINT "result_created_on_not_null" NOT NULL
);

CREATE TABLE "ticket" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "ticket_id_not_null" NOT NULL,
  "title" character varying(200) CONSTRAINT "ticket_title_not_null" NOT NULL,
  "description" text CONSTRAINT "ticket_description_not_null" NOT NULL,
  "status" ticket_status_enum DEFAULT 'OPEN'::ticket_status_enum CONSTRAINT "ticket_status_not_null" NOT NULL,
  "priority" ticket_priority_enum CONSTRAINT "ticket_priority_not_null" NOT NULL,
  "type" ticket_type_enum CONSTRAINT "ticket_type_not_null" NOT NULL,
  "vulnerability_id" character varying(100),
  "affected_package" character varying(200),
  "affected_version" character varying(50),
  "severity_score" double precision,
  "severity_class" character varying(20),
  "recommended_version" character varying(50),
  "remediation_notes" text,
  "created_on" timestamp with time zone CONSTRAINT "ticket_created_on_not_null" NOT NULL,
  "updated_on" timestamp with time zone,
  "resolved_on" timestamp with time zone,
  "due_date" timestamp with time zone,
  "projectId" uuid,
  "organizationId" uuid,
  "createdById" uuid,
  "assignedToId" uuid,
  "sourceAnalysisId" uuid,
  "external_status" character varying(100),
  "remediation_kind" character varying(30),
  "remediation_workspace" character varying(200),
  "remediation_package" character varying(200),
  "potentially_breaking" boolean,
  "package_manager" character varying(20),
  "remediation_command" text,
  "remediation_manifest_edit" jsonb
);

CREATE TABLE "ticket_event" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "ticket_event_id_not_null" NOT NULL,
  "event_type" ticket_event_event_type_enum CONSTRAINT "ticket_event_event_type_not_null" NOT NULL,
  "event_data" jsonb CONSTRAINT "ticket_event_event_data_not_null" NOT NULL,
  "created_on" timestamp with time zone CONSTRAINT "ticket_event_created_on_not_null" NOT NULL,
  "ticketId" uuid,
  "performedById" uuid
);

CREATE TABLE "ticket_external_link" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "ticket_external_link_id_not_null" NOT NULL,
  "provider" ticket_external_link_provider_enum CONSTRAINT "ticket_external_link_provider_not_null" NOT NULL,
  "external_id" character varying(100) CONSTRAINT "ticket_external_link_external_id_not_null" NOT NULL,
  "external_url" character varying(500) CONSTRAINT "ticket_external_link_external_url_not_null" NOT NULL,
  "synced_on" timestamp with time zone CONSTRAINT "ticket_external_link_synced_on_not_null" NOT NULL,
  "sync_enabled" boolean DEFAULT true CONSTRAINT "ticket_external_link_sync_enabled_not_null" NOT NULL,
  "ticketId" uuid
);

CREATE TABLE "ticket_integration_config" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "ticket_integration_config_id_not_null" NOT NULL,
  "provider" ticket_integration_config_provider_enum CONSTRAINT "ticket_integration_config_provider_not_null" NOT NULL,
  "enabled" boolean DEFAULT true CONSTRAINT "ticket_integration_config_enabled_not_null" NOT NULL,
  "config" jsonb CONSTRAINT "ticket_integration_config_config_not_null" NOT NULL,
  "created_on" timestamp with time zone CONSTRAINT "ticket_integration_config_created_on_not_null" NOT NULL,
  "updated_on" timestamp with time zone,
  "organizationId" uuid
);

CREATE TABLE "ticket_vulnerability_occurrence" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "ticket_vulnerability_occurrence_id_not_null" NOT NULL,
  "workspace" character varying(200) CONSTRAINT "ticket_vulnerability_occurrence_workspace_not_null" NOT NULL,
  "detected_on" timestamp with time zone CONSTRAINT "ticket_vulnerability_occurrence_detected_on_not_null" NOT NULL,
  "is_active" boolean DEFAULT true CONSTRAINT "ticket_vulnerability_occurrence_is_active_not_null" NOT NULL,
  "resolved_on" timestamp with time zone,
  "ticketId" uuid,
  "analysisId" uuid,
  "vulnerability_id" character varying(100) CONSTRAINT "ticket_vulnerability_occurrence_vulnerability_id_not_null" NOT NULL,
  "analysis_vulnerability_id" character varying(100) CONSTRAINT "ticket_vulnerability_occurre_analysis_vulnerability_id_not_null" NOT NULL,
  "package" character varying(200) CONSTRAINT "ticket_vulnerability_occurrence_package_not_null" NOT NULL,
  "ecosystem" character varying(50),
  "installed_version" character varying(100) CONSTRAINT "ticket_vulnerability_occurrence_installed_version_not_null" NOT NULL,
  "prod" boolean CONSTRAINT "ticket_vulnerability_occurrence_prod_not_null" NOT NULL,
  "severity_class" character varying(20) CONSTRAINT "ticket_vulnerability_occurrence_severity_class_not_null" NOT NULL,
  "severity_score" double precision,
  "fixed_version" character varying(100),
  "top_level_dependencies" jsonb DEFAULT '[]'::jsonb CONSTRAINT "ticket_vulnerability_occurrence_top_level_dependencies_not_null" NOT NULL
);

CREATE TABLE "user" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "user_id_not_null" NOT NULL,
  "first_name" character varying(100) CONSTRAINT "user_first_name_not_null" NOT NULL,
  "last_name" character varying(100) CONSTRAINT "user_last_name_not_null" NOT NULL,
  "handle" character varying(100) CONSTRAINT "user_handle_not_null" NOT NULL,
  "email" character varying(100) CONSTRAINT "user_email_not_null" NOT NULL,
  "social" boolean CONSTRAINT "user_social_not_null" NOT NULL,
  "social_register_type" character varying,
  "setup_done" boolean CONSTRAINT "user_setup_done_not_null" NOT NULL,
  "activated" boolean CONSTRAINT "user_activated_not_null" NOT NULL,
  "avatar_url" character varying(100),
  "created_on" timestamp with time zone CONSTRAINT "user_created_on_not_null" NOT NULL,
  "registration_verified" boolean CONSTRAINT "user_registration_verified_not_null" NOT NULL,
  "password" character varying(100) CONSTRAINT "user_password_not_null" NOT NULL,
  "setup_temporary_conf" character varying,
  "oauth_integration" character varying,
  "social_id" character varying,
  "default_org" uuid
);

CREATE TABLE "user_integrations_integration" (
  "userId" uuid CONSTRAINT "user_integrations_integration_userId_not_null" NOT NULL,
  "integrationId" uuid CONSTRAINT "user_integrations_integration_integrationId_not_null" NOT NULL
);

CREATE TABLE "vulnerability_instance" (
  "id" uuid DEFAULT uuid_generate_v4() CONSTRAINT "vulnerability_instance_id_not_null" NOT NULL,
  "ref" character varying CONSTRAINT "vulnerability_instance_ref_not_null" NOT NULL,
  "vulnerability_id" character varying CONSTRAINT "vulnerability_instance_vulnerability_id_not_null" NOT NULL,
  "analysis_vulnerability_id" character varying CONSTRAINT "vulnerability_instance_analysis_vulnerability_id_not_null" NOT NULL,
  "package" character varying CONSTRAINT "vulnerability_instance_package_not_null" NOT NULL,
  "ecosystem" character varying,
  "installed_version" character varying CONSTRAINT "vulnerability_instance_installed_version_not_null" NOT NULL,
  "workspace" character varying CONSTRAINT "vulnerability_instance_workspace_not_null" NOT NULL,
  "prod" boolean CONSTRAINT "vulnerability_instance_prod_not_null" NOT NULL,
  "severity_class" character varying CONSTRAINT "vulnerability_instance_severity_class_not_null" NOT NULL,
  "severity_score" double precision,
  "hidden" character varying,
  "excluded_by_policy" boolean CONSTRAINT "vulnerability_instance_excluded_by_policy_not_null" NOT NULL,
  "organizationId" uuid CONSTRAINT "vulnerability_instance_organizationId_not_null" NOT NULL,
  "projectId" uuid CONSTRAINT "vulnerability_instance_projectId_not_null" NOT NULL,
  "analysisId" uuid CONSTRAINT "vulnerability_instance_analysisId_not_null" NOT NULL,
  "uncorroborated" boolean DEFAULT false CONSTRAINT "vulnerability_instance_uncorroborated_not_null" NOT NULL,
  "top_level_dependencies" jsonb DEFAULT '[]'::jsonb CONSTRAINT "vulnerability_instance_top_level_dependencies_not_null" NOT NULL,
  "fixed_version" character varying,
  "aliases" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "vulnerability_instance_aliases_not_null" NOT NULL,
  "known_exploited" boolean DEFAULT false CONSTRAINT "vulnerability_instance_known_exploited_not_null" NOT NULL,
  "package_manager" character varying,
  "smallest_fix" character varying,
  "has_fix" boolean DEFAULT false CONSTRAINT "vulnerability_instance_has_fix_not_null" NOT NULL
);

ALTER TABLE "analysis" ADD CONSTRAINT "PK_300795d51c57ef52911ed65851f" PRIMARY KEY (id);

ALTER TABLE "analyzer" ADD CONSTRAINT "PK_c437f66533df1b36637f8dd499b" PRIMARY KEY (id);

ALTER TABLE "dataset" ADD CONSTRAINT "PK_36c1c67adb3d1dd69ae57f18913" PRIMARY KEY (id);

ALTER TABLE "dataset" ADD CONSTRAINT "UQ_41b08d9cb8d1dd59bf34bbdbd42" UNIQUE ("organizationId", name);

ALTER TABLE "dataset_entry" ADD CONSTRAINT "PK_2e05127b0519fbbf13ff8282221" PRIMARY KEY (id);

ALTER TABLE "dataset_entry" ADD CONSTRAINT "UQ_82ca9da0dd431a332f29be50eb0" UNIQUE ("datasetId", rank);

ALTER TABLE "email" ADD CONSTRAINT "PK_1e7ed8734ee054ef18002e29b1c" PRIMARY KEY (id);

ALTER TABLE "experiment" ADD CONSTRAINT "PK_4f6eec215c62eec1e0fde987caf" PRIMARY KEY (id);

ALTER TABLE "experiment" ADD CONSTRAINT "UQ_73bc7d7132b2fa253279e093f92" UNIQUE ("organizationId", name);

ALTER TABLE "experiment_figure" ADD CONSTRAINT "PK_f3256abd369e118180caf65aabd" PRIMARY KEY (id);

ALTER TABLE "experiment_probe" ADD CONSTRAINT "PK_bd76902864739951b4c7bc01c8a" PRIMARY KEY (id);

ALTER TABLE "experiment_probe" ADD CONSTRAINT "UQ_38b5e1ac63628126a60cdb2358f" UNIQUE ("experimentId", "datasetEntryId", commit_hash);

ALTER TABLE "experiment_probe_interval" ADD CONSTRAINT "PK_49f80dd931f59f29823bad3598a" PRIMARY KEY (id);

ALTER TABLE "experiment_probe_interval" ADD CONSTRAINT "UQ_12809f51d1e3e8aa83b9eb2dfda" UNIQUE ("experimentId", "datasetEntryId", from_commit, to_commit);

ALTER TABLE "experiment_probe_outcome" ADD CONSTRAINT "PK_32b962ef3820d2ef760457280e8" PRIMARY KEY (id);

ALTER TABLE "experiment_probe_outcome" ADD CONSTRAINT "UQ_d408691b22bc59012cbdb6754c6" UNIQUE ("experimentId", "datasetEntryId", commit_hash);

ALTER TABLE "experiment_published_figure_data" ADD CONSTRAINT "PK_90ffc3cf8836b429b7dd6f005d0" PRIMARY KEY (id);

ALTER TABLE "experiment_published_figure_data" ADD CONSTRAINT "UQ_a6afa754fd4717be9fb59d2b64d" UNIQUE ("publishedResultsId", definition_key);

ALTER TABLE "experiment_published_results" ADD CONSTRAINT "PK_424cebfad68dc318d0869ba3ee0" PRIMARY KEY (id);

ALTER TABLE "experiment_published_results" ADD CONSTRAINT "UQ_ae784ab09a7110ff7e4e564ade6" UNIQUE ("experimentId", metric_version);

ALTER TABLE "experiment_run" ADD CONSTRAINT "PK_fd542e718dcf0f9e916708f05d1" PRIMARY KEY (id);

ALTER TABLE "experiment_run" ADD CONSTRAINT "UQ_fac8ee0521a2242f6c2e9b988e2" UNIQUE ("experimentId", "datasetEntryId", grid_index);

ALTER TABLE "experiment_run_summary_row" ADD CONSTRAINT "PK_abb2c33281b852a1c153acbfd34" PRIMARY KEY (id);

ALTER TABLE "experiment_run_summary_row" ADD CONSTRAINT "REL_cedf382889a40c11e4665b70a3" UNIQUE ("runId");

ALTER TABLE "experiment_vulnerability_instance" ADD CONSTRAINT "PK_ec11d08b9423e5f0e6e4d5f84b2" PRIMARY KEY (id);

ALTER TABLE "file" ADD CONSTRAINT "PK_36b46d232307066b3a2c9ea3a1d" PRIMARY KEY (id);

ALTER TABLE "integration" ADD CONSTRAINT "PK_f348d4694945d9dc4c7049a178a" PRIMARY KEY (id);

ALTER TABLE "invitation" ADD CONSTRAINT "PK_beb994737756c0f18a1c1f8669c" PRIMARY KEY (id);

ALTER TABLE "js_version" ADD CONSTRAINT "PK_48f51bbe5c448d86db28db71f12" PRIMARY KEY (id);

ALTER TABLE "log" ADD CONSTRAINT "PK_350604cbdf991d5930d9e618fbd" PRIMARY KEY (id);

ALTER TABLE "notification" ADD CONSTRAINT "PK_705b6c7cdf9b2c2ff7ac7872cb7" PRIMARY KEY (id);

ALTER TABLE "notification_users_user" ADD CONSTRAINT "PK_7606b7d7b70299cea4521b61989" PRIMARY KEY ("notificationId", "userId");

ALTER TABLE "organization" ADD CONSTRAINT "PK_472c1f99a32def1b0abb219cd67" PRIMARY KEY (id);

ALTER TABLE "organization_integrations_integration" ADD CONSTRAINT "PK_5797616a24551c910e8e615d889" PRIMARY KEY ("organizationId", "integrationId");

ALTER TABLE "organization_invited_user" ADD CONSTRAINT "PK_ab8f3c4b9554b5731541ffa07fa" PRIMARY KEY ("organizationId", "userId");

ALTER TABLE "organization_memberships" ADD CONSTRAINT "PK_044bd8dbbac52c55847750366d2" PRIMARY KEY ("organizationMembershipId");

ALTER TABLE "organization_notifications_notification" ADD CONSTRAINT "PK_fef6ed90cf95e30a6ef6dbc710e" PRIMARY KEY ("organizationId", "notificationId");

ALTER TABLE "organization_owners_user" ADD CONSTRAINT "PK_bf5c380b80d790b683043c9053a" PRIMARY KEY ("organizationId", "userId");

ALTER TABLE "organization_policies_policy" ADD CONSTRAINT "PK_88524c8990982c8fff0540171b1" PRIMARY KEY ("organizationId", "policyId");

ALTER TABLE "organization_projects_project" ADD CONSTRAINT "PK_cd80712b94074424b05997a82a9" PRIMARY KEY ("organizationId", "projectId");

ALTER TABLE "policy" ADD CONSTRAINT "PK_9917b0c5e4286703cc656b1d39f" PRIMARY KEY (id);

ALTER TABLE "policy_analyses_analysis" ADD CONSTRAINT "PK_d2a3d10e3ce2fcdf9fd37845304" PRIMARY KEY ("policyId", "analysisId");

ALTER TABLE "project" ADD CONSTRAINT "PK_4d68b1358bb5b766d3e78f32f57" PRIMARY KEY (id);

ALTER TABLE "repository_cache" ADD CONSTRAINT "PK_5398a9847f1cf1467094fb6b6b6" PRIMARY KEY (id);

ALTER TABLE "result" ADD CONSTRAINT "PK_c93b145f3c2e95f6d9e21d188e2" PRIMARY KEY (id);

ALTER TABLE "ticket" ADD CONSTRAINT "PK_d9a0835407701eb86f874474b7c" PRIMARY KEY (id);

ALTER TABLE "ticket_event" ADD CONSTRAINT "PK_902a22d2110174b48925314c875" PRIMARY KEY (id);

ALTER TABLE "ticket_external_link" ADD CONSTRAINT "PK_0907b6813f98f33e9b0fd60bfc1" PRIMARY KEY (id);

ALTER TABLE "ticket_integration_config" ADD CONSTRAINT "PK_df1e1cb02821da14c1b4a90fce7" PRIMARY KEY (id);

ALTER TABLE "ticket_integration_config" ADD CONSTRAINT "UQ_03b5d4b76f46aa80ee3fa9c15bf" UNIQUE ("organizationId", provider);

ALTER TABLE "ticket_vulnerability_occurrence" ADD CONSTRAINT "PK_89a8b3745c959994a85078903af" PRIMARY KEY (id);

ALTER TABLE "user" ADD CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY (id);

ALTER TABLE "user_integrations_integration" ADD CONSTRAINT "PK_adb1ecc45c62ecd7ef088fa28e3" PRIMARY KEY ("userId", "integrationId");

ALTER TABLE "vulnerability_instance" ADD CONSTRAINT "PK_1a6574fb79f9b2c58488ac5a560" PRIMARY KEY (id);

ALTER TABLE "vulnerability_instance" ADD CONSTRAINT "UQ_vulnerability_instance_identity" UNIQUE ("analysisId", workspace, vulnerability_id, package, installed_version);

ALTER TABLE "analysis" ADD CONSTRAINT "FK_09f02cb54cca89e00638a376935" FOREIGN KEY ("createdById") REFERENCES "user"(id);

ALTER TABLE "analysis" ADD CONSTRAINT "FK_0c55929c37d981ded07299eacbb" FOREIGN KEY ("projectId") REFERENCES project(id);

ALTER TABLE "analysis" ADD CONSTRAINT "FK_68d210afa0728c14a981c7856d0" FOREIGN KEY ("integrationId") REFERENCES integration(id);

ALTER TABLE "analysis" ADD CONSTRAINT "FK_76314241964b011dfcbdf224cc9" FOREIGN KEY ("organizationId") REFERENCES organization(id);

ALTER TABLE "analysis" ADD CONSTRAINT "FK_a4a8de4720688b3b6acaac1b71b" FOREIGN KEY ("analyzerId") REFERENCES analyzer(id);

ALTER TABLE "analyzer" ADD CONSTRAINT "FK_494071d44abce6125c0c476c32d" FOREIGN KEY ("createdById") REFERENCES "user"(id);

ALTER TABLE "analyzer" ADD CONSTRAINT "FK_539f3b47367c4e5a5ab0d41f949" FOREIGN KEY ("organizationId") REFERENCES organization(id);

ALTER TABLE "dataset" ADD CONSTRAINT "FK_bab3ebec28870fa289d09ab511a" FOREIGN KEY ("integrationId") REFERENCES integration(id) ON DELETE SET NULL;

ALTER TABLE "dataset" ADD CONSTRAINT "FK_d86a15d9822f2835a58eb1d6cd3" FOREIGN KEY ("organizationId") REFERENCES organization(id) ON DELETE CASCADE;

ALTER TABLE "dataset" ADD CONSTRAINT "FK_ff6c53fcff0cf4d696555f39ee0" FOREIGN KEY ("createdById") REFERENCES "user"(id) ON DELETE SET NULL;

ALTER TABLE "dataset_entry" ADD CONSTRAINT "FK_9274d0e0cdbae3a3a7d7479fa9a" FOREIGN KEY ("datasetId") REFERENCES dataset(id) ON DELETE CASCADE;

ALTER TABLE "email" ADD CONSTRAINT "FK_13e97b4a1d6074fd75ea1bb844e" FOREIGN KEY ("userId") REFERENCES "user"(id);

ALTER TABLE "experiment" ADD CONSTRAINT "FK_0426779bd58d26cbe832c9af800" FOREIGN KEY ("organizationId") REFERENCES organization(id) ON DELETE CASCADE;

ALTER TABLE "experiment" ADD CONSTRAINT "FK_79369e914f482704157d86966f2" FOREIGN KEY ("analyzerId") REFERENCES analyzer(id) ON DELETE SET NULL;

ALTER TABLE "experiment" ADD CONSTRAINT "FK_b72e3a4d9515e85b78a09f3b988" FOREIGN KEY ("createdById") REFERENCES "user"(id) ON DELETE SET NULL;

ALTER TABLE "experiment" ADD CONSTRAINT "FK_fb7ad1deb5cd1d961aa48926def" FOREIGN KEY ("datasetId") REFERENCES dataset(id) ON DELETE RESTRICT;

ALTER TABLE "experiment_figure" ADD CONSTRAINT "FK_4af2a6e15ca021419d6efedba25" FOREIGN KEY ("experimentId") REFERENCES experiment(id) ON DELETE CASCADE;

ALTER TABLE "experiment_figure" ADD CONSTRAINT "FK_b41d8b7bb2f10588e171e56caba" FOREIGN KEY ("publishedResultsId") REFERENCES experiment_published_results(id) ON DELETE SET NULL;

ALTER TABLE "experiment_probe" ADD CONSTRAINT "FK_146341d79551533eb39f99b6bb2" FOREIGN KEY ("experimentId") REFERENCES experiment(id) ON DELETE CASCADE;

ALTER TABLE "experiment_probe" ADD CONSTRAINT "FK_36b5a180e9d6f6948a5af77fa50" FOREIGN KEY ("datasetEntryId") REFERENCES dataset_entry(id) ON DELETE CASCADE;

ALTER TABLE "experiment_probe" ADD CONSTRAINT "FK_db739707d3bcb018df2eb819072" FOREIGN KEY ("analysisId") REFERENCES analysis(id) ON DELETE SET NULL;

ALTER TABLE "experiment_probe_interval" ADD CONSTRAINT "FK_96f78ddec0eb78003fb1fc57d19" FOREIGN KEY ("experimentId") REFERENCES experiment(id) ON DELETE CASCADE;

ALTER TABLE "experiment_probe_interval" ADD CONSTRAINT "FK_e3b2b0f4daac018cc1220348b5a" FOREIGN KEY ("datasetEntryId") REFERENCES dataset_entry(id) ON DELETE CASCADE;

ALTER TABLE "experiment_probe_outcome" ADD CONSTRAINT "FK_02c5903d96db84c98250172d7b1" FOREIGN KEY ("datasetEntryId") REFERENCES dataset_entry(id) ON DELETE CASCADE;

ALTER TABLE "experiment_probe_outcome" ADD CONSTRAINT "FK_d361b913f3634aaa62690a593ca" FOREIGN KEY ("experimentId") REFERENCES experiment(id) ON DELETE CASCADE;

ALTER TABLE "experiment_published_figure_data" ADD CONSTRAINT "FK_2605df273fbcd5e7572b940081f" FOREIGN KEY ("publishedResultsId") REFERENCES experiment_published_results(id) ON DELETE CASCADE;

ALTER TABLE "experiment_published_results" ADD CONSTRAINT "FK_86a74b339afa4f28e511732fd96" FOREIGN KEY ("experimentId") REFERENCES experiment(id) ON DELETE CASCADE;

ALTER TABLE "experiment_published_results" ADD CONSTRAINT "FK_d7dac726885562d0a53674a87d7" FOREIGN KEY ("publishedById") REFERENCES "user"(id) ON DELETE SET NULL;

ALTER TABLE "experiment_run" ADD CONSTRAINT "FK_1fa5e4fbbc359d3b1283d558304" FOREIGN KEY ("sharedFromId") REFERENCES experiment_run(id) ON DELETE SET NULL;

ALTER TABLE "experiment_run" ADD CONSTRAINT "FK_3c0815cf510b863e5ddcdd00dd4" FOREIGN KEY ("analysisId") REFERENCES analysis(id) ON DELETE SET NULL;

ALTER TABLE "experiment_run" ADD CONSTRAINT "FK_50b04432c5809f2f5e93a882418" FOREIGN KEY ("experimentId") REFERENCES experiment(id) ON DELETE CASCADE;

ALTER TABLE "experiment_run" ADD CONSTRAINT "FK_9764120dda53b69e96ad21d44b7" FOREIGN KEY ("datasetEntryId") REFERENCES dataset_entry(id) ON DELETE CASCADE;

ALTER TABLE "experiment_run_summary_row" ADD CONSTRAINT "FK_0c01066e8c4c2ad01bbd8f651ea" FOREIGN KEY ("experimentId") REFERENCES experiment(id) ON DELETE CASCADE;

ALTER TABLE "experiment_run_summary_row" ADD CONSTRAINT "FK_cedf382889a40c11e4665b70a3d" FOREIGN KEY ("runId") REFERENCES experiment_run(id) ON DELETE CASCADE;

ALTER TABLE "experiment_vulnerability_instance" ADD CONSTRAINT "FK_c6751eef99cc4024650c7385b73" FOREIGN KEY ("runId") REFERENCES experiment_run(id) ON DELETE CASCADE;

ALTER TABLE "experiment_vulnerability_instance" ADD CONSTRAINT "FK_e1a40f5e8fe516557f0a12f350a" FOREIGN KEY ("experimentId") REFERENCES experiment(id) ON DELETE CASCADE;

ALTER TABLE "file" ADD CONSTRAINT "FK_29151b59ad12b96cd2d9e3a9cfc" FOREIGN KEY ("projectId") REFERENCES project(id);

ALTER TABLE "file" ADD CONSTRAINT "FK_619041430199c7248662341ec8e" FOREIGN KEY ("addedById") REFERENCES "user"(id);

ALTER TABLE "integration" ADD CONSTRAINT "FK_e9ec70d1a8888315f1315184b75" FOREIGN KEY ("repositoryCacheId") REFERENCES repository_cache(id);

ALTER TABLE "integration" ADD CONSTRAINT "FK_f470dfd06183e7bfa12e4ed7d51" FOREIGN KEY ("ownerId") REFERENCES "user"(id);

ALTER TABLE "invitation" ADD CONSTRAINT "FK_05191060fae5b5485327709be7f" FOREIGN KEY ("userId") REFERENCES "user"(id);

ALTER TABLE "invitation" ADD CONSTRAINT "FK_5c00d7d515395f91bd1fee19f32" FOREIGN KEY ("organizationId") REFERENCES organization(id);

ALTER TABLE "log" ADD CONSTRAINT "FK_0a14b37f3d6f5be425bc0f080d8" FOREIGN KEY ("organizationId") REFERENCES organization(id);

ALTER TABLE "notification_users_user" ADD CONSTRAINT "FK_9c0c1c8c13cf53180e087e7f364" FOREIGN KEY ("userId") REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "notification_users_user" ADD CONSTRAINT "FK_cc471803e22568445b772a45ea0" FOREIGN KEY ("notificationId") REFERENCES notification(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "organization" ADD CONSTRAINT "FK_acdbd1e490930af04b4ff569ca9" FOREIGN KEY ("createdById") REFERENCES "user"(id);

ALTER TABLE "organization_integrations_integration" ADD CONSTRAINT "FK_8031a218fc98f33b1f7e4a5ae27" FOREIGN KEY ("organizationId") REFERENCES organization(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "organization_integrations_integration" ADD CONSTRAINT "FK_fe96bdf9bb90fadbf29b26eaea8" FOREIGN KEY ("integrationId") REFERENCES integration(id);

ALTER TABLE "organization_invited_user" ADD CONSTRAINT "FK_2a0d0829656d6a4ccc9e79c0485" FOREIGN KEY ("userId") REFERENCES "user"(id);

ALTER TABLE "organization_invited_user" ADD CONSTRAINT "FK_e47975a1141febe29f0fcd6ae93" FOREIGN KEY ("organizationId") REFERENCES organization(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "organization_memberships" ADD CONSTRAINT "FK_03b536604ff6c6676b51b74b1c9" FOREIGN KEY ("userId") REFERENCES "user"(id);

ALTER TABLE "organization_memberships" ADD CONSTRAINT "FK_1813e7f46b5a18529482f519640" FOREIGN KEY ("organizationId") REFERENCES organization(id);

ALTER TABLE "organization_notifications_notification" ADD CONSTRAINT "FK_4d950e31d0c273d925f139e44f9" FOREIGN KEY ("notificationId") REFERENCES notification(id);

ALTER TABLE "organization_notifications_notification" ADD CONSTRAINT "FK_9d6c46508f2fe2646c79e260ca8" FOREIGN KEY ("organizationId") REFERENCES organization(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "organization_owners_user" ADD CONSTRAINT "FK_88b667e5dae95396b7204367e80" FOREIGN KEY ("userId") REFERENCES "user"(id);

ALTER TABLE "organization_owners_user" ADD CONSTRAINT "FK_901f7fff05911c8f8a70ad43032" FOREIGN KEY ("organizationId") REFERENCES organization(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "organization_policies_policy" ADD CONSTRAINT "FK_d0233589b7e4fb44d94f913fe29" FOREIGN KEY ("organizationId") REFERENCES organization(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "organization_policies_policy" ADD CONSTRAINT "FK_d498b6d647ffbea1335926fb529" FOREIGN KEY ("policyId") REFERENCES policy(id);

ALTER TABLE "organization_projects_project" ADD CONSTRAINT "FK_17776fcac5925a1b9c2de6659e2" FOREIGN KEY ("projectId") REFERENCES project(id);

ALTER TABLE "organization_projects_project" ADD CONSTRAINT "FK_60c8536082fe2e5f8339cbeb18a" FOREIGN KEY ("organizationId") REFERENCES organization(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "policy" ADD CONSTRAINT "FK_e2a559dc71c48a5f3514b2e91c3" FOREIGN KEY ("createdById") REFERENCES "user"(id);

ALTER TABLE "policy_analyses_analysis" ADD CONSTRAINT "FK_07894cf183f76e751a0d3780f08" FOREIGN KEY ("policyId") REFERENCES policy(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "policy_analyses_analysis" ADD CONSTRAINT "FK_90093d0834ea74459c93278d1be" FOREIGN KEY ("analysisId") REFERENCES analysis(id);

ALTER TABLE "project" ADD CONSTRAINT "FK_05503c29fac80fff9fa5bd7726b" FOREIGN KEY ("addedById") REFERENCES "user"(id);

ALTER TABLE "project" ADD CONSTRAINT "FK_cfed2edf0775ca6190bf1d303f7" FOREIGN KEY ("integrationId") REFERENCES integration(id);

ALTER TABLE "repository_cache" ADD CONSTRAINT "FK_80730191d462c7a9dd72b6b3c4f" FOREIGN KEY ("integrationId") REFERENCES integration(id);

ALTER TABLE "result" ADD CONSTRAINT "FK_702c70a45c5fa40056e49d9392d" FOREIGN KEY ("analysisId") REFERENCES analysis(id);

ALTER TABLE "ticket" ADD CONSTRAINT "FK_b87c4da6a3ca9c54aa3e93a96f6" FOREIGN KEY ("organizationId") REFERENCES organization(id);

ALTER TABLE "ticket" ADD CONSTRAINT "FK_c6f47d3e270123ccd2f16f13d29" FOREIGN KEY ("projectId") REFERENCES project(id) ON DELETE CASCADE;

ALTER TABLE "ticket" ADD CONSTRAINT "FK_c8e3489ee961642f35cdf610564" FOREIGN KEY ("sourceAnalysisId") REFERENCES analysis(id) ON DELETE SET NULL;

ALTER TABLE "ticket" ADD CONSTRAINT "FK_cdd21a6b9c9d8ccb0de1c695e7e" FOREIGN KEY ("createdById") REFERENCES "user"(id);

ALTER TABLE "ticket" ADD CONSTRAINT "FK_fc73d71fe3965e8bf6ff9560c10" FOREIGN KEY ("assignedToId") REFERENCES "user"(id);

ALTER TABLE "ticket_event" ADD CONSTRAINT "FK_52ad15979fca7c3e0e008a51ba2" FOREIGN KEY ("ticketId") REFERENCES ticket(id) ON DELETE CASCADE;

ALTER TABLE "ticket_event" ADD CONSTRAINT "FK_63b99393e8d51af6fc09be4a676" FOREIGN KEY ("performedById") REFERENCES "user"(id);

ALTER TABLE "ticket_external_link" ADD CONSTRAINT "FK_02f4e05e0f1a29069000ec1bd1b" FOREIGN KEY ("ticketId") REFERENCES ticket(id) ON DELETE CASCADE;

ALTER TABLE "ticket_integration_config" ADD CONSTRAINT "FK_37f2e28bc22cfe388adbbda34fa" FOREIGN KEY ("organizationId") REFERENCES organization(id) ON DELETE CASCADE;

ALTER TABLE "ticket_vulnerability_occurrence" ADD CONSTRAINT "FK_288338f97329cc8c2ea388e80e1" FOREIGN KEY ("ticketId") REFERENCES ticket(id) ON DELETE CASCADE;

ALTER TABLE "ticket_vulnerability_occurrence" ADD CONSTRAINT "FK_347267f6bd37be65ee3388a82e4" FOREIGN KEY ("analysisId") REFERENCES analysis(id) ON DELETE CASCADE;

ALTER TABLE "user" ADD CONSTRAINT "FK_a64608a253f14da7ba2a6b96a7c" FOREIGN KEY (default_org) REFERENCES organization(id);

ALTER TABLE "user_integrations_integration" ADD CONSTRAINT "FK_04aa9f6ff0abf3357255a4933d0" FOREIGN KEY ("integrationId") REFERENCES integration(id);

ALTER TABLE "user_integrations_integration" ADD CONSTRAINT "FK_33a3a7d9338aef1a5afc5a14ae4" FOREIGN KEY ("userId") REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "vulnerability_instance" ADD CONSTRAINT "FK_08ce6093b7a04e235c39357cca2" FOREIGN KEY ("analysisId") REFERENCES analysis(id) ON DELETE CASCADE;

ALTER TABLE "vulnerability_instance" ADD CONSTRAINT "FK_4b646e1bc5575ae66fdf11f2664" FOREIGN KEY ("organizationId") REFERENCES organization(id) ON DELETE CASCADE;

ALTER TABLE "vulnerability_instance" ADD CONSTRAINT "FK_ee03745aa654b052abd7b834146" FOREIGN KEY ("projectId") REFERENCES project(id) ON DELETE CASCADE;

CREATE INDEX "IDX_4af2a6e15ca021419d6efedba2" ON public.experiment_figure USING btree ("experimentId");

CREATE INDEX "IDX_146341d79551533eb39f99b6bb" ON public.experiment_probe USING btree ("experimentId");

CREATE INDEX "IDX_96f78ddec0eb78003fb1fc57d1" ON public.experiment_probe_interval USING btree ("experimentId");

CREATE INDEX "IDX_d361b913f3634aaa62690a593c" ON public.experiment_probe_outcome USING btree ("experimentId");

CREATE INDEX "IDX_0c01066e8c4c2ad01bbd8f651e" ON public.experiment_run_summary_row USING btree ("experimentId");

CREATE INDEX "IDX_c6751eef99cc4024650c7385b7" ON public.experiment_vulnerability_instance USING btree ("runId");

CREATE INDEX "IDX_e1a40f5e8fe516557f0a12f350" ON public.experiment_vulnerability_instance USING btree ("experimentId");

CREATE INDEX idx_js_version_version ON public.js_version USING btree (version);

CREATE INDEX "IDX_9c0c1c8c13cf53180e087e7f36" ON public.notification_users_user USING btree ("userId");

CREATE INDEX "IDX_cc471803e22568445b772a45ea" ON public.notification_users_user USING btree ("notificationId");

CREATE INDEX "IDX_8031a218fc98f33b1f7e4a5ae2" ON public.organization_integrations_integration USING btree ("organizationId");

CREATE INDEX "IDX_fe96bdf9bb90fadbf29b26eaea" ON public.organization_integrations_integration USING btree ("integrationId");

CREATE INDEX "IDX_2a0d0829656d6a4ccc9e79c048" ON public.organization_invited_user USING btree ("userId");

CREATE INDEX "IDX_e47975a1141febe29f0fcd6ae9" ON public.organization_invited_user USING btree ("organizationId");

CREATE INDEX "IDX_4d950e31d0c273d925f139e44f" ON public.organization_notifications_notification USING btree ("notificationId");

CREATE INDEX "IDX_9d6c46508f2fe2646c79e260ca" ON public.organization_notifications_notification USING btree ("organizationId");

CREATE INDEX "IDX_88b667e5dae95396b7204367e8" ON public.organization_owners_user USING btree ("userId");

CREATE INDEX "IDX_901f7fff05911c8f8a70ad4303" ON public.organization_owners_user USING btree ("organizationId");

CREATE INDEX "IDX_d0233589b7e4fb44d94f913fe2" ON public.organization_policies_policy USING btree ("organizationId");

CREATE INDEX "IDX_d498b6d647ffbea1335926fb52" ON public.organization_policies_policy USING btree ("policyId");

CREATE INDEX "IDX_17776fcac5925a1b9c2de6659e" ON public.organization_projects_project USING btree ("projectId");

CREATE INDEX "IDX_60c8536082fe2e5f8339cbeb18" ON public.organization_projects_project USING btree ("organizationId");

CREATE INDEX "IDX_07894cf183f76e751a0d3780f0" ON public.policy_analyses_analysis USING btree ("policyId");

CREATE INDEX "IDX_90093d0834ea74459c93278d1b" ON public.policy_analyses_analysis USING btree ("analysisId");

CREATE INDEX idx_result_plugin ON public.result USING btree (plugin);

CREATE INDEX idx_result_workspaces_gin ON public.result USING gin (((result -> 'workspaces'::text)) jsonb_path_ops);

CREATE INDEX "IDX_7598db282de7bcfe43ecb9a430" ON public.ticket USING btree (vulnerability_id);

CREATE INDEX "IDX_dd955f0e52609f6d216c7071cb" ON public.ticket USING btree ("projectId", remediation_kind, remediation_workspace, remediation_package);

CREATE UNIQUE INDEX "IDX_ed2066292bd3c0f5066751c364" ON public.ticket_vulnerability_occurrence USING btree ("ticketId", "analysisId", workspace, vulnerability_id, package, installed_version);

CREATE UNIQUE INDEX "IDX_53197e5dba5dbaf94d29c8edbd" ON public."user" USING btree (handle);

CREATE UNIQUE INDEX "IDX_e12875dfb3b1d92d7d7c5377e2" ON public."user" USING btree (email);

CREATE INDEX "IDX_04aa9f6ff0abf3357255a4933d" ON public.user_integrations_integration USING btree ("integrationId");

CREATE INDEX "IDX_33a3a7d9338aef1a5afc5a14ae" ON public.user_integrations_integration USING btree ("userId");

CREATE INDEX "IDX_ee03745aa654b052abd7b83414" ON public.vulnerability_instance USING btree ("projectId");

CREATE INDEX "IDX_vulnerability_instance_org_vulnerability" ON public.vulnerability_instance USING btree ("organizationId", vulnerability_id);
