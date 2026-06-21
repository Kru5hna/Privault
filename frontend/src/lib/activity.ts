export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  action: "Upload" | "Download" | "Preview" | "Share created" | "Share revoked" | "Restore" | "Delete";
  details: string;
}

const STORAGE_KEY_PREFIX = "privault_activity_log_";

export function logActivity(
  userId: string,
  action: ActivityLogEntry["action"],
  details: string
): void {
  if (!userId) return;
  try {
    const key = `${STORAGE_KEY_PREFIX}${userId}`;
    const stored = localStorage.getItem(key);
    const logs: ActivityLogEntry[] = stored ? JSON.parse(stored) : [];

    const newEntry: ActivityLogEntry = {
      id: `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      action,
      details,
    };

    logs.unshift(newEntry); // Newest first

    // Limit to 500 logs to prevent storage filling up
    if (logs.length > 500) {
      logs.pop();
    }

    localStorage.setItem(key, JSON.stringify(logs));
  } catch (err) {
    console.error("Failed to write activity log:", err);
  }
}

export function getActivityLogs(userId: string): ActivityLogEntry[] {
  if (!userId) return [];
  try {
    const key = `${STORAGE_KEY_PREFIX}${userId}`;
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    console.error("Failed to read activity log:", err);
    return [];
  }
}

export function clearActivityLogs(userId: string): void {
  if (!userId) return;
  try {
    const key = `${STORAGE_KEY_PREFIX}${userId}`;
    localStorage.removeItem(key);
  } catch (err) {
    console.error("Failed to clear activity log:", err);
  }
}
