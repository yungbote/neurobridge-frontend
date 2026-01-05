import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/app/providers/AuthProvider";
import { getPathNodeContent } from "@/shared/api/PathNodeService";
import { getSessionState, patchSessionState } from "@/shared/api/SessionService";
import type { PathNode } from "@/shared/types/models";

interface LessonContextValue {
  activeLessonId: string | null;
  activeLesson: PathNode | null;
  setActiveLessonId: (id: string | null) => void;
  setActiveLesson: (lesson: PathNode | null) => void;
  clearActiveLesson: () => void;
  activateLesson: (id: string | null) => Promise<PathNode | null>;
}

const LessonContext = createContext<LessonContextValue>({
  activeLessonId: null,
  activeLesson: null,
  setActiveLessonId: () => {},
  setActiveLesson: () => {},
  clearActiveLesson: () => {},
  activateLesson: async () => null,
});

interface LessonProviderProps {
  children: React.ReactNode;
}

export function LessonProvider({ children }: LessonProviderProps) {
  const { isAuthenticated } = useAuth();
  const [activeLessonId, setActiveLessonIdState] = useState<string | null>(null);
  const [activeLessonOverride, setActiveLessonOverride] = useState<PathNode | null>(null);
  const activateSeq = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveLessonIdState(null);
      setActiveLessonOverride(null);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const state = await getSessionState();
        if (!mounted) return;
        const lessonId = state?.activePathNodeId ? String(state.activePathNodeId) : null;
        if (!lessonId) return;
        setActiveLessonIdState(lessonId);
        const node = await getPathNodeContent(lessonId);
        if (!mounted) return;
        if (node?.id) setActiveLessonOverride(node);
      } catch {
        // ignore restore errors
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isAuthenticated]);

  const setActiveLessonId = useCallback(
    (id: string | null) => {
      const next = id ? String(id) : null;
      setActiveLessonIdState(next);
      if (!next || String(activeLessonOverride?.id || "") !== next) {
        setActiveLessonOverride(null);
      }
      if (isAuthenticated) {
        void patchSessionState({ active_path_node_id: next }).catch((err) => {
          console.warn("[LessonProvider] Failed to patch session state:", err);
        });
      }
    },
    [activeLessonOverride, isAuthenticated]
  );

  const setActiveLesson = useCallback(
    (lesson: PathNode | null) => {
      if (!lesson) {
        setActiveLessonIdState(null);
        setActiveLessonOverride(null);
        if (isAuthenticated) {
          void patchSessionState({ active_path_node_id: null }).catch((err) => {
            console.warn("[LessonProvider] Failed to patch session state:", err);
          });
        }
        return;
      }
      const nextId = lesson?.id ? String(lesson.id) : null;
      if (!nextId) return;
      setActiveLessonIdState(nextId);
      setActiveLessonOverride(lesson);
      if (isAuthenticated) {
        void patchSessionState({ active_path_node_id: nextId }).catch((err) => {
          console.warn("[LessonProvider] Failed to patch session state:", err);
        });
      }
    },
    [isAuthenticated]
  );

  const clearActiveLesson = useCallback(() => {
    setActiveLessonIdState(null);
    setActiveLessonOverride(null);
    if (isAuthenticated) {
      void patchSessionState({ active_path_node_id: null }).catch((err) => {
        console.warn("[LessonProvider] Failed to patch session state:", err);
      });
    }
  }, [isAuthenticated]);

  const activateLesson = useCallback(
    async (id: string | null): Promise<PathNode | null> => {
      const seq = ++activateSeq.current;
      const nextId = id ? String(id) : null;

      setActiveLessonIdState(nextId);
      if (!nextId) {
        setActiveLessonOverride(null);
        if (isAuthenticated) {
          void patchSessionState({ active_path_node_id: null }).catch((err) => {
            console.warn("[LessonProvider] Failed to patch session state:", err);
          });
        }
        return null;
      }

      if (isAuthenticated) {
        void patchSessionState({ active_path_node_id: nextId }).catch((err) => {
          console.warn("[LessonProvider] Failed to patch session state:", err);
        });
      }

      const node = await getPathNodeContent(nextId);
      if (activateSeq.current !== seq) return node;

      if (node?.id) {
        setActiveLessonOverride(node);
      }
      return node;
    },
    [isAuthenticated]
  );

  const activeLesson = useMemo(() => {
    if (!activeLessonId) return null;
    if (activeLessonOverride?.id && String(activeLessonOverride.id) === String(activeLessonId)) {
      return activeLessonOverride;
    }
    return activeLessonOverride || null;
  }, [activeLessonId, activeLessonOverride]);

  const value = useMemo(
    () => ({
      activeLessonId,
      activeLesson,
      setActiveLessonId,
      setActiveLesson,
      clearActiveLesson,
      activateLesson,
    }),
    [activeLessonId, activeLesson, setActiveLessonId, setActiveLesson, clearActiveLesson, activateLesson]
  );

  return <LessonContext.Provider value={value}>{children}</LessonContext.Provider>;
}

export function useLessons() {
  return useContext(LessonContext);
}
