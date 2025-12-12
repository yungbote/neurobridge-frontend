import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/providers/AuthProvider";
import { useUser } from "@/providers/UserProvider";
import { useSSEContext } from "@/providers/SSEProvider";

import {
  listCourses,
  mapCourse,
  getCourseGeneration,
  isCourseGenerating,
} from "@/api/CourseService";
import { uploadMaterialSet as apiUploadMaterialSet } from "@/api/MaterialService";

const CourseContext = createContext({
  courses: [],
  coursesWithGeneration: [], // NEW: merged view for UI
  loading: false,
  error: null,
  reload: async () => {},
  uploadMaterialSet: async () => {},
  generationByCourseId: {}, // { [courseId]: { runId, stage, progress, status, error, message? } }
  generationByRunId: {}, // { [runId]: { courseId, stage, progress, status, error, message? } }
});

function normalizeEventName(e) {
  return String(e || "").trim();
}

export function CourseProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const { user } = useUser();
  const { lastMessage } = useSSEContext();

  const [courses, setCourses] = useState([]);
  const [generationByCourseId, setGenerationByCourseId] = useState({});
  const [generationByRunId, setGenerationByRunId] = useState({});

  // IMPORTANT: ref for generationByRunId to avoid effect dependency loops
  const generationByRunIdRef = useRef({});
  useEffect(() => {
    generationByRunIdRef.current = generationByRunId;
  }, [generationByRunId]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const upsertGeneration = useCallback((patch) => {
    const runId = patch?.runId || null;
    const courseId = patch?.courseId || null;

    if (runId) {
      setGenerationByRunId((prev) => {
        const current = prev[runId] || {};
        const next = { ...current, ...patch };

        if (typeof next.progress === "number") {
          next.progress = Math.max(0, Math.min(100, next.progress));
        }

        const same =
          current.runId === next.runId &&
          current.courseId === next.courseId &&
          current.status === next.status &&
          current.stage === next.stage &&
          current.progress === next.progress &&
          current.error === next.error &&
          current.message === next.message;

        if (same) return prev;
        return { ...prev, [runId]: next };
      });
    }

    if (courseId) {
      setGenerationByCourseId((prev) => {
        const current = prev[courseId] || {};
        const next = { ...current, ...patch };

        if (typeof next.progress === "number") {
          next.progress = Math.max(0, Math.min(100, next.progress));
        }

        const same =
          current.runId === next.runId &&
          current.courseId === next.courseId &&
          current.status === next.status &&
          current.stage === next.stage &&
          current.progress === next.progress &&
          current.error === next.error &&
          current.message === next.message;

        if (same) return prev;
        return { ...prev, [courseId]: next };
      });
    }
  }, []);

  const hydrateGeneration = useCallback(
    async (loadedCourses) => {
      const generating = (loadedCourses || []).filter((c) =>
        isCourseGenerating(c),
      );
      if (generating.length === 0) return;

      const results = await Promise.allSettled(
        generating.map((c) => getCourseGeneration(c.id)),
      );

      results.forEach((res, idx) => {
        if (res.status !== "fulfilled") return;
        const run = res.value;
        const courseId = generating[idx]?.id;

        if (!run || !run.id || !courseId) return;

        upsertGeneration({
          runId: run.id,
          courseId,
          status: run.status || "running",
          stage: run.stage || null,
          progress: typeof run.progress === "number" ? run.progress : 0,
          error: run.error || null,
          message: null,
        });
      });
    },
    [upsertGeneration],
  );

  const loadCourses = useCallback(async () => {
    if (!isAuthenticated) {
      setCourses([]);
      setError(null);
      setLoading(false);
      setGenerationByCourseId({});
      setGenerationByRunId({});
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const loadedCourses = await listCourses();
      setCourses(loadedCourses);

      // Rehydrate generation state so refresh doesn't lose progress
      await hydrateGeneration(loadedCourses);
    } catch (err) {
      console.debug("[CourseProvider] Failed to load courses:", err);
      setError(err);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, hydrateGeneration]);

  useEffect(() => {
    loadCourses();
  }, [isAuthenticated, loadCourses]);

  // SSE merge
  useEffect(() => {
    if (!lastMessage) return;
    if (!user) return;

    const { channel, event, data } = lastMessage;
    if (channel !== user.id) return;

    const ev = normalizeEventName(event);

    // ---- 1) Course created (initial placeholder course) ----
    if (
      ev === "UserCourseCreated" ||
      ev === "USERCOURSECREATED" ||
      ev === "CourseCreated"
    ) {
      const raw = data?.course || data;
      const course = mapCourse(raw);
      if (!course?.id) return;

      setCourses((prev) => {
        const idx = prev.findIndex((c) => c.id === course.id);
        if (idx === -1) return [...prev, course];
        const next = [...prev];
        next[idx] = { ...next[idx], ...course };
        return next;
      });

      const run = data?.run;
      if (run?.id) {
        upsertGeneration({
          runId: run.id,
          courseId: course.id,
          status: run.status || "queued",
          stage: run.stage || "ingest",
          progress: typeof run.progress === "number" ? run.progress : 0,
          error: run.error || null,
        });
      }

      return;
    }

    // ---- 2) Generation progress ----
    if (ev === "CourseGenerationProgress") {
      const runId = data?.run_id || data?.runId || data?.id;
      const stage = data?.stage || null;
      const progress = typeof data?.progress === "number" ? data.progress : null;

      const known = runId ? generationByRunIdRef.current[runId] : null;
      const courseId = data?.course_id || data?.courseId || known?.courseId || null;

      upsertGeneration({
        runId,
        courseId,
        status: "running",
        stage,
        progress,
        message: data?.message || null,
      });

      return;
    }

    // ---- 3) Generation done ----
    if (ev === "CourseGenerationDone") {
      const runId = data?.run_id || data?.runId;
      const known = runId ? generationByRunIdRef.current[runId] : null;
      const courseId = data?.course_id || data?.courseId || known?.courseId || null;

      upsertGeneration({
        runId,
        courseId,
        status: "succeeded",
        stage: "done",
        progress: 100,
        error: null,
      });

      loadCourses();
      return;
    }

    // ---- 4) Generation failed ----
    if (ev === "CourseGenerationFailed") {
      const runId = data?.run_id || data?.runId;
      const known = runId ? generationByRunIdRef.current[runId] : null;
      const courseId = data?.course_id || data?.courseId || known?.courseId || null;

      upsertGeneration({
        runId,
        courseId,
        status: "failed",
        stage: data?.stage || "unknown",
        error: data?.error || "Generation failed",
      });
    }
  }, [lastMessage, user, loadCourses, upsertGeneration]);

  // Upload: optimistically create a “generating” course entry so UI updates immediately
  const uploadMaterialSet = useCallback(
    async (files) => {
      const res = await apiUploadMaterialSet(files);

      const courseId = res?.course_id || res?.courseId || null;
      const runId = res?.generation_run_id || res?.generationRunId || null;

      if (courseId) {
        setCourses((prev) => {
          const exists = prev.some((c) => c.id === courseId);
          if (exists) return prev;
          return [
            ...prev,
            {
              id: courseId,
              userId: user?.id ?? null,
              materialSetId: res?.material_set_id || res?.materialSetId || null,
              title: "Generating course…",
              description: "We’re analyzing your files and building your course.",
              level: null,
              subject: null,
              progress: 0,
              metadata: { status: "generating" },
              createdAt: null,
              updatedAt: null,
            },
          ];
        });
      }

      if (runId || courseId) {
        upsertGeneration({
          runId,
          courseId,
          status: "queued",
          stage: "ingest",
          progress: 0,
          error: null,
        });
      }

      return res;
    },
    [upsertGeneration, user],
  );

  // NEW: derived courses list merged with generation info so UI stays consistent
  const coursesWithGeneration = useMemo(() => {
    return (courses || []).map((c) => {
      const gen = c?.id ? generationByCourseId[c.id] : null;
      if (!gen) return c;

      const derivedProgress =
        typeof gen.progress === "number"
          ? gen.progress
          : typeof c.progress === "number"
            ? c.progress
            : 0;

      return {
        ...c,
        generation: {
          runId: gen.runId || null,
          status: gen.status || null,
          stage: gen.stage || null,
          progress: typeof gen.progress === "number" ? gen.progress : null,
          error: gen.error || null,
          message: gen.message || null,
        },
        // unify: card reads course.progress
        progress: derivedProgress,
      };
    });
  }, [courses, generationByCourseId]);

  const value = useMemo(() => {
    return {
      courses,
      coursesWithGeneration,
      loading,
      error,
      reload: loadCourses,
      uploadMaterialSet,
      generationByCourseId,
      generationByRunId,
    };
  }, [
    courses,
    coursesWithGeneration,
    loading,
    error,
    loadCourses,
    uploadMaterialSet,
    generationByCourseId,
    generationByRunId,
  ]);

  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>;
}

export function useCourses() {
  return useContext(CourseContext);
}










