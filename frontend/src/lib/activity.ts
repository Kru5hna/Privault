import { apiLogActivity, apiGetActivityLogs, apiClearActivityLogs } from "./api";

export type ActivityAction = "Upload" | "Download" | "Preview" | "Share created" | "Share revoked" | "Restore" | "Delete";

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  action: ActivityAction;
  details: string;
}

export async function logActivity(
  sessionToken: string,
  action: ActivityAction,
  details: string
): Promise<void> {
  if (!sessionToken) return;
  try {
    await apiLogActivity(sessionToken, action, details);
  } catch (err) {
    console.error("Failed to log activity:", err);
  }
}

export async function getActivityLogs(
  sessionToken: string
): Promise<ActivityLogEntry[]> {
  if (!sessionToken) return [];
  try {
    const response = await apiGetActivityLogs(sessionToken);
    return response.logs.map((log) => ({
      id: log.id,
      timestamp: log.created_at,
      action: log.action as ActivityAction,
      details: log.details,
    }));
  } catch (err) {
    console.error("Failed to read activity log:", err);
    return [];
  }
}

export async function clearActivityLogs(
  sessionToken: string
): Promise<void> {
  if (!sessionToken) return;
  try {
    await apiClearActivityLogs(sessionToken);
  } catch (err) {
    console.error("Failed to clear activity log:", err);
  }
}
