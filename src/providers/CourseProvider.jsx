import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "@/providers/AuthProvider";
import { useUser } from "@/providers/UserProvider";
import { useSSEContext } from "@/providers/SSEProvider";
import axiosClient from "@/api/AxiosClient";
import { uploadCourseMaterials as apiUploadCourseMaterials } from "@/api/CourseService";

const CourseContext = createContext({
  courses: [],
  loading: false,
  error: null,
  reload: async () => {},
  getById: () => null,
  uploadMaterialSet: async () => {},
});

function upsertById(list, next, opts = {}) {
  const replace = Boolean(opts.replace);
  if (!next?.id) return list;

  const idx = list.findIndex((c) => c?.id === next.id);
  if (idx === -1) return [next, ...list];

  const out = list.slice();
  out[idx] = replace ? next : { ...out[idx], ...next };
  return out;
}

function attachJobFields(course, { job, stage, progress, message, status } = {}) {
  if (!course) return course;

  const jobId = job?.id ?? course.jobId;
  const jobType = job?.job_type ?? job?.jobType ?? course.jobType;

  const jobStatus = status ?? job?.status ?? course.jobStatus;
  const jobStage = stage ?? job?.stage ?? course.jobStage;

  const jobProgress =
    typeof progress === "number"
      ? progress
      : typeof job?.progress === "number"
        ? job.progress
        : course.jobProgress ?? 0;

  const jobMessage = message ?? course.jobMessage ?? "";

  return {
    ...course,
    jobId,
    jobType,
    jobStatus,
    jobStage,
    jobProgress,
    jobMessage,
  };
}

function stripJobFields(course) {
  if (!course) return course;
  // eslint-disable-next-line no-unused-vars
  const { jobId, jobType, jobStatus, jobStage, jobProgress, jobMessage, ...rest } =
    course;
  return rest;
}

// --- READY detection (works whether metadata is object or stringified) ---
function getMetaStatus(course) {
  const m = course?.metadata;
  if (!m) return "";
  if (typeof m === "object") return String(m.status || "").toLowerCase();
  if (typeof m === "string") {
    try {
      const parsed = JSON.parse(m);
      return String(parsed?.status || "").toLowerCase();
    } catch {
      return "";
    }
  }
  return "";
}

function isReady(course) {
  return getMetaStatus(course) === "ready";
}

// --- finalize locally on JobDone (NO refetch) ---
function markCourseReadyLocally(course) {
  if (!course) return course;

  const meta =
    course.metadata && typeof course.metadata === "object"
      ? { ...course.metadata }
      : {};

  meta.status = "ready";

  return {
    ...course,
    metadata: meta,
    updated_at: course.updated_at ?? new Date().toISOString(),
  };
}

export function CourseProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const { user } = useUser();
  const { lastMessage } = useSSEContext();

  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadCourses = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      setLoading(true);
      setError(null);

      const resp = await axiosClient.get("/courses");
      const data = resp?.data ?? resp; // handles interceptors returning data directly
      const raws = data?.courses ?? [];

      setCourses(Array.isArray(raws) ? raws : []);
    } catch (err) {
      console.error("[CourseProvider] Failed to load courses:", err);
      setError(err);
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setCourses([]);
      setLoading(false);
      setError(null);
      return;
    }
    loadCourses();
  }, [isAuthenticated, loadCourses]);

  useEffect(() => {
    if (!lastMessage) return;
    if (!user?.id) return;

    if (lastMessage.channel !== user.id) return;

    const event = String(lastMessage.event || "").toLowerCase();
    const data = lastMessage.data || {};

    setCourses((prev) => {
      // --- UserCourseCreated ---
      if (event === "usercoursecreated") {
        const incomingCourse = data.course;
        if (!incomingCourse?.id) return prev;

        const next = data.job
          ? attachJobFields(incomingCourse, {
              job: data.job,
              status: data.job?.status,
              stage: data.job?.stage,
              progress: data.job?.progress,
              message: "Starting generation…",
            })
          : incomingCourse;

        // If snapshot already says ready, end overlay immediately
        if (isReady(next)) {
          return upsertById(prev, stripJobFields(next), { replace: true });
        }
        return upsertById(prev, next);
      }

      // --- CourseGenerationProgress ---
      if (event === "coursegenerationprogress") {
        const courseId = data.course_id ?? data.course?.id;
        if (!courseId) return prev;

        const existing = prev.find((c) => c?.id === courseId);
        const base = data.course ?? existing ?? { id: courseId };

        const next = attachJobFields(base, {
          job: data.job,
          status: data.job?.status ?? "running",
          stage: data.stage,
          progress: typeof data.progress === "number" ? data.progress : undefined,
          message: data.message,
        });

        // If backend includes ready snapshot (sometimes happens), end overlay
        if (isReady(next)) {
          return upsertById(prev, stripJobFields(next), { replace: true });
        }
        return upsertById(prev, next);
      }

      // --- CourseGenerationFailed ---
      if (event === "coursegenerationfailed") {
        const courseId = data.course_id ?? data.course?.id;
        if (!courseId) return prev;

        const existing = prev.find((c) => c?.id === courseId);
        const base = data.course ?? existing ?? { id: courseId };

        const next = attachJobFields(base, {
          job: data.job,
          status: "failed",
          stage: data.stage,
          progress: typeof data.progress === "number" ? data.progress : undefined,
          message: data.error || "Generation failed",
        });

        return upsertById(prev, next);
      }

      // --- CourseGenerationDone ---
      if (event === "coursegenerationdone") {
        const courseId = data.course_id ?? data.course?.id;
        if (!courseId) return prev;

        const existing = prev.find((c) => c?.id === courseId);
        const base = data.course ?? existing ?? { id: courseId };

        // Strip transient job fields on done
        const next = stripJobFields(base);
        return upsertById(prev, stripJobFields(next), { replace: true });
      }

      // --- JobDone fallback (NO refetch) ---
      if (event === "jobdone") {
        const job = data.job;
        const jobType = String(job?.job_type ?? job?.jobType ?? "").toLowerCase();
        if (jobType !== "course_build") return prev;

        // resolve courseId from entity_id OR payload.course_id
        let courseId = job?.entity_id ?? job?.entityId ?? null;
        if (!courseId) {
          const payload = job?.payload;
          if (payload && typeof payload === "object") {
            courseId = payload.course_id ?? payload.courseId ?? null;
          } else if (typeof payload === "string") {
            try {
              const parsed = JSON.parse(payload);
              courseId = parsed?.course_id ?? parsed?.courseId ?? null;
            } catch {
              // ignore malformed JSON
            }
          }
        }
        if (!courseId) return prev;

        const existing = prev.find((c) => c?.id === courseId);
        if (!existing) return prev;

        // finalize locally: mark ready + strip overlay fields
        const finalized = stripJobFields(markCourseReadyLocally(existing));
        return upsertById(prev, finalized, { replace: true });
      }

      return prev;
    });
  }, [lastMessage, user?.id]);

  const getById = useCallback(
    (id) => courses.find((c) => c?.id === id) ?? null,
    [courses]
  );

  const uploadMaterialSet = useCallback(
    async (files) => {
      if (!files || files.length === 0) {
        throw new Error("uploadMaterialSet: no files provided");
      }

      const res = await apiUploadCourseMaterials(files);

      const courseId = res?.course_id ?? res?.courseId ?? null;
      const jobId = res?.job_id ?? res?.jobId ?? null;
      const materialSetId = res?.material_set_id ?? res?.materialSetId ?? null;

      if (courseId) {
        setCourses((prev) => {
          const existing = prev.find((c) => c?.id === courseId);

          const placeholder = {
            id: courseId,
            user_id: user?.id ?? null,
            material_set_id: materialSetId,
            title: "Generating course…",
            description: "We’re analyzing your files and building your course.",
            level: null,
            subject: null,
            progress: 0,
            metadata: { status: "generating" },
            created_at: existing?.created_at ?? null,
            updated_at: existing?.updated_at ?? null,

            // transient job fields (card overlay)
            jobId: jobId ?? existing?.jobId,
            jobType: existing?.jobType ?? "course_build",
            jobStatus: "queued",
            jobStage: "ingest",
            jobProgress: 0,
            jobMessage: "Uploading materials…",
          };

          if (!existing) return [placeholder, ...prev];

          const merged = {
            ...existing,
            ...placeholder,
            title:
              existing.title &&
              !String(existing.title).toLowerCase().includes("generating")
                ? existing.title
                : placeholder.title,
            description: existing.description || placeholder.description,
            metadata: existing.metadata || placeholder.metadata,
          };

          const out = prev.slice();
          const idx = out.findIndex((c) => c?.id === courseId);
          out[idx] = merged;
          return out;
        });
      }

      return res;
    },
    [user?.id]
  );

  const value = useMemo(
    () => ({
      courses,
      loading,
      error,
      reload: loadCourses,
      getById,
      uploadMaterialSet,
    }),
    [courses, loading, error, loadCourses, getById, uploadMaterialSet]
  );

  return (
    <CourseContext.Provider value={value}>{children}</CourseContext.Provider>
  );
}

export function useCourses() {
  return useContext(CourseContext);
}







