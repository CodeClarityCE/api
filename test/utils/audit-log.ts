import { testHelper, type TestUser } from "./integration-test-helper";

/** One audit log entry as the API returns it. */
export interface AuditEntry {
  action: string;
  action_class: string;
  action_severity: number;
  description: string;
  blame_on_email: string;
  created_on: string;
}

/** Reads the organization's audit log through the API, newest first. */
export async function readAuditLog(
  user: TestUser,
  organizationId: string = user.organization.id,
): Promise<AuditEntry[]> {
  const response = await testHelper.makeAuthenticatedRequest(
    "GET",
    `/org/${organizationId}/audit_logs?entries_per_page=100`,
    user.accessToken,
  );
  if (response.statusCode !== 200) {
    throw new Error(`GET audit_logs failed: ${response.body}`);
  }
  return response.json().data;
}

/** Audit log entries with the given action. */
export async function auditEntries(
  user: TestUser,
  action: string,
): Promise<AuditEntry[]> {
  return (await readAuditLog(user)).filter((e) => e.action === action);
}
