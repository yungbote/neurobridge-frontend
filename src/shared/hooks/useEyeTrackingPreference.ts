import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPersonalizationPrefs } from "@/shared/api/UserService";
import { queryKeys } from "@/shared/query/queryKeys";
import { useUser } from "@/app/providers/UserProvider";

const STORAGE_KEY = "pref:eye_tracking_enabled";

function readStored(): boolean | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw == null) return null;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

function writeStored(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function useEyeTrackingPreference() {
  const { user } = useUser();
  const stored = readStored();

  const prefsQuery = useQuery({
    queryKey: queryKeys.personalizationPrefs(user?.id ?? "anonymous"),
    enabled: Boolean(user?.id),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { prefs } = await getPersonalizationPrefs();
      return prefs;
    },
  });

  const enabled = useMemo(() => {
    const prefs = asRecord(prefsQuery.data);
    const value = prefs ? prefs.allowEyeTracking : undefined;
    if (typeof value === "boolean") {
      if (stored === null || stored !== value) writeStored(value);
      return value;
    }
    if (stored != null) return stored;
    return false;
  }, [prefsQuery.data, stored]);

  return { enabled, status: prefsQuery.status };
}

export function persistEyeTrackingPreference(value: boolean) {
  writeStored(value);
}
