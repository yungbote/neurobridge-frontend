import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Info, RotateCcw, Shield, Sparkles } from "lucide-react";
import { useUser } from "@/app/providers/UserProvider";
import { getPersonalizationPrefs, patchPersonalizationPrefs } from "@/shared/api/UserService";
import { queryKeys } from "@/shared/query/queryKeys";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Skeleton } from "@/shared/ui/skeleton";
import { Switch } from "@/shared/ui/switch";
import { Textarea } from "@/shared/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { useToast } from "@/shared/ui/toast";
import { cn } from "@/shared/lib/utils";
import { persistEyeTrackingPreference, requestEyeTrackingPermission } from "@/shared/hooks/useEyeTrackingPreference";
import { useEyeCalibration } from "@/shared/hooks/useEyeCalibration";
import { EyeCalibrationOverlay } from "@/shared/components/EyeCalibrationOverlay";

type LanguagePreference = "auto" | "en" | "es" | "fr" | "de" | "pt";
type UnitSystem = "metric" | "imperial";
type ComfortLevel = "low" | "medium" | "high";
type CodingComfort = "none" | "some" | "high";
type TimezoneMode = "auto" | "manual";

type ResponseDepth = "concise" | "standard" | "thorough";
type TeachingStyle = "balanced" | "direct" | "socratic";
type TonePreference = "neutral" | "encouraging" | "no_fluff";
type PracticePreference = "light" | "balanced" | "more";
type LearningDisability =
  | "adhd"
  | "dyslexia"
  | "dyscalculia"
  | "dysgraphia"
  | "dyspraxia"
  | "auditory_processing"
  | "autism_spectrum"
  | "executive_function"
  | "other"
  | "prefer_not_to_say";

type PersonalizationPrefsV1 = {
  version: 1;

  nickname: string;
  occupation: string;
  about: string;

  language: LanguagePreference;
  timezoneMode: TimezoneMode;
  timezone: string;
  units: UnitSystem;

  mathComfort: ComfortLevel;
  codingComfort: CodingComfort;
  sessionMinutes: 10 | 15 | 20 | 30 | 45 | 60 | 90;
  sessionsPerWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 10 | 14;

  learningDisabilities: LearningDisability[];
  learningDisabilitiesOther: string;

  defaultDepth: ResponseDepth;
  defaultTeachingStyle: TeachingStyle;
  defaultTone: TonePreference;
  defaultPractice: PracticePreference;

  preferShortParagraphs: boolean;
  preferBulletSummaries: boolean;
  askClarifyingQuestions: boolean;

  allowBehaviorPersonalization: boolean;
  allowTelemetry: boolean;
  allowEyeTracking: boolean;
};

function safeParseJSON(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function oneOf<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v === "string")
    .map((v) => String(v).trim())
    .filter(Boolean);
}

function asInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

const LEARNING_DISABILITIES: ReadonlyArray<LearningDisability> = [
  "adhd",
  "dyslexia",
  "dyscalculia",
  "dysgraphia",
  "dyspraxia",
  "auditory_processing",
  "autism_spectrum",
  "executive_function",
  "other",
  "prefer_not_to_say",
] as const;

const LEARNING_DISABILITY_SET = new Set<LearningDisability>(LEARNING_DISABILITIES);

function normalizeLearningDisabilities(
  raw: unknown,
  rawOther: unknown,
  fallback: PersonalizationPrefsV1["learningDisabilities"]
): {
  learningDisabilities: PersonalizationPrefsV1["learningDisabilities"];
  learningDisabilitiesOther: string;
} {
  const picked = strArray(raw)
    .map((v) => v.toLowerCase().trim())
    .filter((v): v is LearningDisability => LEARNING_DISABILITY_SET.has(v as LearningDisability));

  // De-dupe (keep stable order as listed in LEARNING_DISABILITIES).
  const unique = new Set<LearningDisability>(picked);
  let ordered = LEARNING_DISABILITIES.filter((k) => unique.has(k));
  if (ordered.includes("prefer_not_to_say")) ordered = ["prefer_not_to_say"];

  const other = str(rawOther).trim().slice(0, 280);
  if (!ordered.includes("other")) {
    return { learningDisabilities: ordered.length ? ordered : fallback, learningDisabilitiesOther: "" };
  }
  return { learningDisabilities: ordered.length ? ordered : fallback, learningDisabilitiesOther: other };
}

function buildDefaults(opts: {
  nickname?: string;
  detectedTimezone?: string;
}): PersonalizationPrefsV1 {
  return {
    version: 1,

    nickname: opts.nickname ?? "",
    occupation: "",
    about: "",

    language: "auto",
    timezoneMode: "auto",
    timezone: opts.detectedTimezone ?? "UTC",
    units: "metric",

    mathComfort: "medium",
    codingComfort: "some",
    sessionMinutes: 30,
    sessionsPerWeek: 4,

    learningDisabilities: [],
    learningDisabilitiesOther: "",

    defaultDepth: "standard",
    defaultTeachingStyle: "balanced",
    defaultTone: "neutral",
    defaultPractice: "balanced",

    preferShortParagraphs: false,
    preferBulletSummaries: true,
    askClarifyingQuestions: true,

    allowBehaviorPersonalization: true,
    allowTelemetry: true,
    allowEyeTracking: false,
  };
}

function normalizePrefs(raw: unknown, defaults: PersonalizationPrefsV1): PersonalizationPrefsV1 {
  const obj = asRecord(raw);
  if (!obj) return defaults;

  const version = asInt(obj.version);
  if (version !== 1) return defaults;

  const language = oneOf<LanguagePreference>(
    obj.language,
    ["auto", "en", "es", "fr", "de", "pt"] as const,
    defaults.language
  );
  const timezoneMode = oneOf<TimezoneMode>(obj.timezoneMode, ["auto", "manual"] as const, defaults.timezoneMode);
  const units = oneOf<UnitSystem>(obj.units, ["metric", "imperial"] as const, defaults.units);

  const mathComfort = oneOf<ComfortLevel>(obj.mathComfort, ["low", "medium", "high"] as const, defaults.mathComfort);
  const codingComfort = oneOf<CodingComfort>(obj.codingComfort, ["none", "some", "high"] as const, defaults.codingComfort);
  const sessionMinutes = oneOf<PersonalizationPrefsV1["sessionMinutes"]>(
    obj.sessionMinutes,
    [10, 15, 20, 30, 45, 60, 90] as const,
    defaults.sessionMinutes
  );
  const sessionsPerWeek = oneOf<PersonalizationPrefsV1["sessionsPerWeek"]>(
    obj.sessionsPerWeek,
    [1, 2, 3, 4, 5, 6, 7, 10, 14] as const,
    defaults.sessionsPerWeek
  );

  const { learningDisabilities, learningDisabilitiesOther } = normalizeLearningDisabilities(
    obj.learningDisabilities,
    obj.learningDisabilitiesOther,
    defaults.learningDisabilities
  );

  const defaultDepth = oneOf<ResponseDepth>(
    obj.defaultDepth,
    ["concise", "standard", "thorough"] as const,
    defaults.defaultDepth
  );
  const defaultTeachingStyle = oneOf<TeachingStyle>(
    obj.defaultTeachingStyle,
    ["balanced", "direct", "socratic"] as const,
    defaults.defaultTeachingStyle
  );
  const defaultTone = oneOf<TonePreference>(
    obj.defaultTone,
    ["neutral", "encouraging", "no_fluff"] as const,
    defaults.defaultTone
  );
  const defaultPractice = oneOf<PracticePreference>(
    obj.defaultPractice,
    ["light", "balanced", "more"] as const,
    defaults.defaultPractice
  );

  const timezone = str(obj.timezone).trim() || defaults.timezone;

  return {
    version: 1,

    nickname: str(obj.nickname).trim(),
    occupation: str(obj.occupation).trim(),
    about: str(obj.about).trim(),

    language,
    timezoneMode,
    timezone,
    units,

    mathComfort,
    codingComfort,
    sessionMinutes,
    sessionsPerWeek,

    learningDisabilities,
    learningDisabilitiesOther,

    defaultDepth,
    defaultTeachingStyle,
    defaultTone,
    defaultPractice,

    preferShortParagraphs: bool(obj.preferShortParagraphs, defaults.preferShortParagraphs),
    preferBulletSummaries: bool(obj.preferBulletSummaries, defaults.preferBulletSummaries),
    askClarifyingQuestions: bool(obj.askClarifyingQuestions, defaults.askClarifyingQuestions),

    allowBehaviorPersonalization: bool(obj.allowBehaviorPersonalization, defaults.allowBehaviorPersonalization),
    allowTelemetry: bool(obj.allowTelemetry, defaults.allowTelemetry),
    allowEyeTracking: bool((obj as { allowEyeTracking?: unknown }).allowEyeTracking, defaults.allowEyeTracking),
  };
}

function storageKeyForUser(userId: string) {
  return `nb:personalization:v1:${userId}`;
}

function useDetectedTimezone(): string {
  return useMemo(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return typeof tz === "string" && tz.trim() ? tz.trim() : "UTC";
    } catch {
      return "UTC";
    }
  }, []);
}

function prettyTimezone(mode: TimezoneMode, manual: string, detected: string) {
  if (mode === "manual") return manual || "UTC";
  return detected || "UTC";
}

function SettingRow({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        className
      )}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {description ? (
          <div className="text-xs text-muted-foreground">{description}</div>
        ) : null}
      </div>
      <div className="flex w-full justify-start sm:w-auto sm:justify-end">{children}</div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl border border-border/60 bg-muted/30 text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
    </div>
  );
}

type PrefsSetter = Dispatch<SetStateAction<PersonalizationPrefsV1>>;

const AboutYouSection = memo(function AboutYouSection({
  nickname,
  occupation,
  about,
  setPrefs,
}: {
  nickname: string;
  occupation: string;
  about: string;
  setPrefs: PrefsSetter;
}) {
  return (
    <section className="space-y-5 pb-8 border-b border-border/60">
      <SectionHeader
        icon={<Sparkles className="h-4 w-4" />}
        title="About you"
        subtitle="A few basics that help personalize examples and pacing."
      />

      <div className="space-y-4">
        <SettingRow title="Preferred name" description="What Neurobridge should call you by default.">
          <Input
            value={nickname}
            onChange={(e) => setPrefs((prev) => ({ ...prev, nickname: e.target.value }))}
            placeholder="e.g., Alex"
            className="sm:w-64 rounded-xl"
          />
        </SettingRow>

        <SettingRow title="Occupation (optional)" description="Used for analogies and project-focused examples.">
          <Input
            value={occupation}
            onChange={(e) => setPrefs((prev) => ({ ...prev, occupation: e.target.value }))}
            placeholder="e.g., Product designer"
            className="sm:w-64 rounded-xl"
          />
        </SettingRow>

        <div className="space-y-2">
          <div className="text-sm font-medium text-foreground">More about you (optional)</div>
          <div className="text-xs text-muted-foreground">
            Anything you want Neurobridge to keep in mind across new paths.
          </div>
          <Textarea
            value={about}
            onChange={(e) => setPrefs((prev) => ({ ...prev, about: e.target.value }))}
            placeholder="Learning goals, background, what you already know, constraints, etc."
            className="min-h-[90px] rounded-2xl"
          />
        </div>
      </div>
    </section>
  );
});

const LanguageRegionSection = memo(function LanguageRegionSection({
  language,
  timezoneMode,
  timezone,
  units,
  resolvedTimezone,
  setPrefs,
}: {
  language: LanguagePreference;
  timezoneMode: TimezoneMode;
  timezone: string;
  units: UnitSystem;
  resolvedTimezone: string;
  setPrefs: PrefsSetter;
}) {
  return (
    <section className="space-y-5 pb-8 border-b border-border/60">
      <SectionHeader
        icon={<Shield className="h-4 w-4" />}
        title="Language & region"
        subtitle="Formatting defaults that help the app feel consistent."
      />

      <div className="space-y-4">
        <SettingRow title="Language" description="Preferred language for explanations (when available).">
          <Select
            value={language}
            onValueChange={(v) =>
              setPrefs((prev) => ({
                ...prev,
                language: oneOf(v, ["auto", "en", "es", "fr", "de", "pt"] as const, prev.language),
              }))
            }
          >
            <SelectTrigger className="w-full sm:w-64 rounded-xl bg-muted/20 border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto-detect</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Spanish</SelectItem>
              <SelectItem value="fr">French</SelectItem>
              <SelectItem value="de">German</SelectItem>
              <SelectItem value="pt">Portuguese</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <div className="space-y-2">
          <SettingRow title="Time zone" description={`Currently using ${resolvedTimezone}.`}>
            <Select
              value={timezoneMode}
              onValueChange={(v) =>
                setPrefs((prev) => ({
                  ...prev,
                  timezoneMode: oneOf(v, ["auto", "manual"] as const, prev.timezoneMode),
                }))
              }
            >
              <SelectTrigger className="w-full sm:w-64 rounded-xl bg-muted/20 border-border/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-detect</SelectItem>
                <SelectItem value="manual">Set manually</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>

          {timezoneMode === "manual" ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">
                  Enter an IANA timezone (e.g., <span className="font-medium">America/New_York</span>).
                </div>
              </div>
              <div className="flex w-full justify-start sm:w-auto sm:justify-end">
                <Input
                  value={timezone}
                  onChange={(e) => setPrefs((prev) => ({ ...prev, timezone: e.target.value }))}
                  placeholder="e.g., America/New_York"
                  className="sm:w-64 rounded-xl"
                />
              </div>
            </div>
          ) : null}
        </div>

        <SettingRow title="Units" description="Used for measurements in explanations.">
          <Select
            value={units}
            onValueChange={(v) =>
              setPrefs((prev) => ({
                ...prev,
                units: oneOf(v, ["metric", "imperial"] as const, prev.units),
              }))
            }
          >
            <SelectTrigger className="w-full sm:w-64 rounded-xl bg-muted/20 border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="metric">Metric</SelectItem>
              <SelectItem value="imperial">Imperial</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </div>
    </section>
  );
});

const LearningDefaultsSection = memo(function LearningDefaultsSection({
  mathComfort,
  codingComfort,
  sessionMinutes,
  sessionsPerWeek,
  setPrefs,
}: {
  mathComfort: ComfortLevel;
  codingComfort: CodingComfort;
  sessionMinutes: PersonalizationPrefsV1["sessionMinutes"];
  sessionsPerWeek: PersonalizationPrefsV1["sessionsPerWeek"];
  setPrefs: PrefsSetter;
}) {
  return (
    <section className="space-y-5 pb-8 border-b border-border/60">
      <SectionHeader
        icon={<Sparkles className="h-4 w-4" />}
        title="Learning defaults"
        subtitle="Used when a new path starts (or when we have low confidence)."
      />

      <div className="space-y-4">
        <SettingRow title="Math comfort" description="Controls how much math we assume by default.">
          <Select
            value={mathComfort}
            onValueChange={(v) =>
              setPrefs((prev) => ({
                ...prev,
                mathComfort: oneOf(v, ["low", "medium", "high"] as const, prev.mathComfort),
              }))
            }
          >
            <SelectTrigger className="w-full sm:w-64 rounded-xl bg-muted/20 border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Prefer intuition</SelectItem>
              <SelectItem value="medium">Some math is OK</SelectItem>
              <SelectItem value="high">Math-forward</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow title="Coding comfort" description="Controls how often we use code-first explanations.">
          <Select
            value={codingComfort}
            onValueChange={(v) =>
              setPrefs((prev) => ({
                ...prev,
                codingComfort: oneOf(v, ["none", "some", "high"] as const, prev.codingComfort),
              }))
            }
          >
            <SelectTrigger className="w-full sm:w-64 rounded-xl bg-muted/20 border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No code</SelectItem>
              <SelectItem value="some">Some code is OK</SelectItem>
              <SelectItem value="high">Code-forward</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow title="Typical session length" description="Helps size lessons and reviews.">
          <Select
            value={String(sessionMinutes)}
            onValueChange={(v) => {
              const n = asInt(v);
              if (!n) return;
              setPrefs((prev) => ({
                ...prev,
                sessionMinutes: oneOf(n, [10, 15, 20, 30, 45, 60, 90] as const, prev.sessionMinutes),
              }));
            }}
          >
            <SelectTrigger className="w-full sm:w-64 rounded-xl bg-muted/20 border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 minutes</SelectItem>
              <SelectItem value="15">15 minutes</SelectItem>
              <SelectItem value="20">20 minutes</SelectItem>
              <SelectItem value="30">30 minutes</SelectItem>
              <SelectItem value="45">45 minutes</SelectItem>
              <SelectItem value="60">60 minutes</SelectItem>
              <SelectItem value="90">90 minutes</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow title="Sessions per week" description="Used to plan review pacing.">
          <Select
            value={String(sessionsPerWeek)}
            onValueChange={(v) => {
              const n = asInt(v);
              if (!n) return;
              setPrefs((prev) => ({
                ...prev,
                sessionsPerWeek: oneOf(n, [1, 2, 3, 4, 5, 6, 7, 10, 14] as const, prev.sessionsPerWeek),
              }));
            }}
          >
            <SelectTrigger className="w-full sm:w-64 rounded-xl bg-muted/20 border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1</SelectItem>
              <SelectItem value="2">2</SelectItem>
              <SelectItem value="3">3</SelectItem>
              <SelectItem value="4">4</SelectItem>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="6">6</SelectItem>
              <SelectItem value="7">7</SelectItem>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="14">14</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </div>
    </section>
  );
});

const LEARNING_DISABILITY_OPTIONS: Array<{
  key: LearningDisability;
  label: string;
  description: string;
}> = [
  { key: "adhd", label: "ADHD / attention", description: "More structure, shorter steps, frequent checkpoints." },
  { key: "dyslexia", label: "Dyslexia", description: "Short paragraphs, clear formatting, fewer dense blocks." },
  { key: "dyscalculia", label: "Dyscalculia", description: "Slower math ramp, more intuition and examples." },
  { key: "dysgraphia", label: "Dysgraphia", description: "Less writing-heavy work, more choice-based practice." },
  { key: "dyspraxia", label: "Dyspraxia", description: "Clear step ordering and reduced motor-heavy tasks." },
  { key: "auditory_processing", label: "Auditory processing", description: "Prefer text-first instructions and captions." },
  { key: "autism_spectrum", label: "Autism spectrum", description: "Direct language, predictable structure, fewer tangents." },
  { key: "executive_function", label: "Executive function", description: "Plan-first outlines, reminders, and chunked tasks." },
  { key: "other", label: "Other", description: "Add a note below." },
  { key: "prefer_not_to_say", label: "Prefer not to say", description: "We won’t use this signal." },
];

const AccessibilitySection = memo(function AccessibilitySection({
  learningDisabilities,
  learningDisabilitiesOther,
  setPrefs,
}: {
  learningDisabilities: LearningDisability[];
  learningDisabilitiesOther: string;
  setPrefs: PrefsSetter;
}) {
  const selected = useMemo(() => new Set<LearningDisability>(learningDisabilities), [learningDisabilities]);

  const toggle = useCallback(
    (key: LearningDisability) => {
      setPrefs((prev) => {
        if (key === "prefer_not_to_say") {
          return { ...prev, learningDisabilities: ["prefer_not_to_say"], learningDisabilitiesOther: "" };
        }

        const next = new Set<LearningDisability>(
          (prev.learningDisabilities || []).filter((v) => v !== "prefer_not_to_say")
        );
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }

        const ordered = LEARNING_DISABILITIES.filter((k) => next.has(k) && k !== "prefer_not_to_say");
        const keepOther = ordered.includes("other");

        return {
          ...prev,
          learningDisabilities: ordered,
          learningDisabilitiesOther: keepOther ? prev.learningDisabilitiesOther : "",
        };
      });
    },
    [setPrefs]
  );

  return (
    <section className="space-y-5 pb-8 border-b border-border/60">
      <SectionHeader
        icon={<Shield className="h-4 w-4" />}
        title="Accessibility"
        subtitle="Optional. Helps Neurobridge format explanations and practice."
      />

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {LEARNING_DISABILITY_OPTIONS.map((opt) => {
            const isOn = selected.has(opt.key);
            return (
              <button
                key={opt.key}
                type="button"
                aria-pressed={isOn}
                onClick={() => toggle(opt.key)}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-3 text-left nb-motion-fast motion-reduce:transition-none",
                  isOn
                    ? "border-foreground/15 bg-muted/40"
                    : "border-border/60 bg-muted/10 hover:bg-muted/20"
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-5 w-5 items-center justify-center rounded-md border text-muted-foreground",
                    isOn ? "border-foreground/20 bg-background/60" : "border-border/60 bg-background/40"
                  )}
                  aria-hidden="true"
                >
                  {isOn ? <Check className="h-3.5 w-3.5" /> : null}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.description}</div>
                </div>
              </button>
            );
          })}
        </div>

        {selected.has("other") ? (
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Other (optional)</div>
            <div className="text-xs text-muted-foreground">
              Share anything that helps us adapt formatting, pacing, and practice.
            </div>
            <Input
              value={learningDisabilitiesOther}
              onChange={(e) => setPrefs((prev) => ({ ...prev, learningDisabilitiesOther: e.target.value }))}
              placeholder="e.g., migraines, color sensitivity, processing speed…"
              className="rounded-xl"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
});

const DefaultTeachingStyleSection = memo(function DefaultTeachingStyleSection({
  defaultDepth,
  defaultTeachingStyle,
  defaultTone,
  defaultPractice,
  preferShortParagraphs,
  preferBulletSummaries,
  askClarifyingQuestions,
  setPrefs,
}: {
  defaultDepth: ResponseDepth;
  defaultTeachingStyle: TeachingStyle;
  defaultTone: TonePreference;
  defaultPractice: PracticePreference;
  preferShortParagraphs: boolean;
  preferBulletSummaries: boolean;
  askClarifyingQuestions: boolean;
  setPrefs: PrefsSetter;
}) {
  return (
    <section className="space-y-5 pb-8 border-b border-border/60">
      <SectionHeader
        icon={<Sparkles className="h-4 w-4" />}
        title="Default teaching style"
        subtitle="These are starting points. Neurobridge can adapt within each path."
      />

      <div className="space-y-4">
        <SettingRow title="Detail level" description="How verbose explanations should be by default.">
          <Select
            value={defaultDepth}
            onValueChange={(v) =>
              setPrefs((prev) => ({
                ...prev,
                defaultDepth: oneOf(v, ["concise", "standard", "thorough"] as const, prev.defaultDepth),
              }))
            }
          >
            <SelectTrigger className="w-full sm:w-64 rounded-xl bg-muted/20 border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="concise">Concise</SelectItem>
              <SelectItem value="standard">Balanced</SelectItem>
              <SelectItem value="thorough">Thorough</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow title="Teaching style" description="How explanations are structured.">
          <Select
            value={defaultTeachingStyle}
            onValueChange={(v) =>
              setPrefs((prev) => ({
                ...prev,
                defaultTeachingStyle: oneOf(v, ["balanced", "direct", "socratic"] as const, prev.defaultTeachingStyle),
              }))
            }
          >
            <SelectTrigger className="w-full sm:w-64 rounded-xl bg-muted/20 border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="balanced">Balanced</SelectItem>
              <SelectItem value="direct">Direct</SelectItem>
              <SelectItem value="socratic">Socratic</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow title="Tone" description="How assertive vs supportive the assistant feels.">
          <Select
            value={defaultTone}
            onValueChange={(v) =>
              setPrefs((prev) => ({
                ...prev,
                defaultTone: oneOf(v, ["neutral", "encouraging", "no_fluff"] as const, prev.defaultTone),
              }))
            }
          >
            <SelectTrigger className="w-full sm:w-64 rounded-xl bg-muted/20 border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="neutral">Neutral</SelectItem>
              <SelectItem value="encouraging">Encouraging</SelectItem>
              <SelectItem value="no_fluff">No-fluff</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow title="Practice" description="How often we suggest drills and checks for understanding.">
          <Select
            value={defaultPractice}
            onValueChange={(v) =>
              setPrefs((prev) => ({
                ...prev,
                defaultPractice: oneOf(v, ["light", "balanced", "more"] as const, prev.defaultPractice),
              }))
            }
          >
            <SelectTrigger className="w-full sm:w-64 rounded-xl bg-muted/20 border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="balanced">Balanced</SelectItem>
              <SelectItem value="more">More practice</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow title="Short paragraphs" description="Improves readability and scanning.">
          <Switch
            checked={preferShortParagraphs}
            onCheckedChange={(checked) => setPrefs((prev) => ({ ...prev, preferShortParagraphs: Boolean(checked) }))}
          />
        </SettingRow>

        <SettingRow title="Bullet summaries" description="Prefer a quick bullet recap after explanations.">
          <Switch
            checked={preferBulletSummaries}
            onCheckedChange={(checked) => setPrefs((prev) => ({ ...prev, preferBulletSummaries: Boolean(checked) }))}
          />
        </SettingRow>

        <SettingRow title="Ask clarifying questions" description="When missing key context, ask before assuming.">
          <Switch
            checked={askClarifyingQuestions}
            onCheckedChange={(checked) => setPrefs((prev) => ({ ...prev, askClarifyingQuestions: Boolean(checked) }))}
          />
        </SettingRow>
      </div>
    </section>
  );
});

const PersonalizationControlsSection = memo(function PersonalizationControlsSection({
  allowBehaviorPersonalization,
  allowTelemetry,
  allowEyeTracking,
  setPrefs,
  onReset,
}: {
  allowBehaviorPersonalization: boolean;
  allowTelemetry: boolean;
  allowEyeTracking: boolean;
  setPrefs: PrefsSetter;
  onReset: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [eyeTrackingBusy, setEyeTrackingBusy] = useState(false);
  const [showCalibration, setShowCalibration] = useState(false);
  const { push } = useToast();
  const { calibrationState, needsCalibration, markCalibrated, clearCalibration } = useEyeCalibration();

  const handleEyeTrackingToggle = useCallback(
    async (checked: boolean) => {
      if (!checked) {
        setPrefs((prev) => ({ ...prev, allowEyeTracking: false }));
        clearCalibration();
        return;
      }
      if (eyeTrackingBusy) return;
      setEyeTrackingBusy(true);
      const result = await requestEyeTrackingPermission();
      setEyeTrackingBusy(false);
      if (result === "granted") {
        setPrefs((prev) => ({ ...prev, allowEyeTracking: true }));
        setShowCalibration(true);
        return;
      }
      setPrefs((prev) => ({ ...prev, allowEyeTracking: false }));
      push({
        variant: "error",
        title: result === "unavailable" ? "Camera not available" : "Camera permission denied",
        description:
          result === "unavailable"
            ? "This browser doesn't support camera access for eye tracking."
            : "Enable camera access to use eye tracking.",
      });
    },
    [eyeTrackingBusy, push, setPrefs]
  );

  return (
    <section className="space-y-5">
      <SectionHeader
        icon={<Shield className="h-4 w-4" />}
        title="Personalization controls"
        subtitle="Decide what Neurobridge can learn from your activity."
      />

      <div className="space-y-4">
        <SettingRow
          title="Adapt from behavior"
          description="Use activity signals to improve defaults and recommendations."
        >
          <Switch
            checked={allowBehaviorPersonalization}
            onCheckedChange={(checked) =>
              setPrefs((prev) => ({ ...prev, allowBehaviorPersonalization: Boolean(checked) }))
            }
          />
        </SettingRow>

        <SettingRow
          title="Usage telemetry"
          description="Collect anonymized diagnostics to improve reliability."
        >
          <Switch
            checked={allowTelemetry}
            onCheckedChange={(checked) =>
              setPrefs((prev) => ({ ...prev, allowTelemetry: Boolean(checked) }))
            }
          />
        </SettingRow>

        <SettingRow
          title="Camera-based reading detection"
          description="Optional. Uses on-device camera signals to improve reading detection accuracy."
        >
          <Switch
            checked={allowEyeTracking}
            onCheckedChange={(checked) => void handleEyeTrackingToggle(Boolean(checked))}
            disabled={eyeTrackingBusy}
          />
        </SettingRow>
        {allowEyeTracking ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
            <div className="text-xs text-muted-foreground">
              Calibration{" "}
              {calibrationState === "fresh"
                ? "up to date"
                : calibrationState === "stale"
                ? "recommended"
                : "required"}
            </div>
            <Button size="sm" variant="outline" onClick={() => setShowCalibration(true)}>
              {needsCalibration ? "Calibrate" : "Recalibrate"}
            </Button>
          </div>
        ) : null}

        <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl border border-border/60 bg-background/60 text-muted-foreground">
                <RotateCcw className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">Reset personalization</div>
                <div className="text-xs text-muted-foreground">Clears your saved defaults on this device.</div>
              </div>
            </div>

            {!confirmReset ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => setConfirmReset(true)}
              >
                Reset
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-xl"
                  onClick={() => setConfirmReset(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="rounded-xl"
                  onClick={() => {
                    onReset();
                    setConfirmReset(false);
                  }}
                >
                  Reset
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
      <EyeCalibrationOverlay
        open={showCalibration}
        onClose={() => setShowCalibration(false)}
        onComplete={() => {
          markCalibrated();
          setShowCalibration(false);
        }}
      />
    </section>
  );
});

export function PersonalizationTab() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const detectedTimezone = useDetectedTimezone();

  const userId = String(user?.id ?? "").trim();
  const storageKey = useMemo(() => (userId ? storageKeyForUser(userId) : ""), [userId]);

  const defaults = useMemo(() => {
    const nickname = String(user?.firstName || "").trim();
    return buildDefaults({ nickname, detectedTimezone });
  }, [user?.firstName, detectedTimezone]);

  const prefsQuery = useQuery({
    queryKey: queryKeys.personalizationPrefs(userId || "unknown"),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { prefs } = await getPersonalizationPrefs();
      return prefs;
    },
    staleTime: 5 * 60_000,
  });

  const toastCooldownRef = useRef(0);
  const lastSavedJSONRef = useRef("");

  const patchMutation = useMutation({
    mutationFn: async (nextPrefs: PersonalizationPrefsV1) => {
      const { prefs } = await patchPersonalizationPrefs(nextPrefs);
      return prefs;
    },
    onMutate: async (nextPrefs) => {
      if (!userId) return { prev: null };
      const key = queryKeys.personalizationPrefs(userId);
      const prev = queryClient.getQueryData<unknown | null>(key) ?? null;
      queryClient.setQueryData(key, nextPrefs);
      return { prev };
    },
    onSuccess: (_serverPrefs, sentPrefs) => {
      const sentJSON = JSON.stringify(sentPrefs);
      lastSavedJSONRef.current = sentJSON;
    },
    onError: (_err, _sentPrefs, ctx) => {
      if (userId) {
        const key = queryKeys.personalizationPrefs(userId);
        queryClient.setQueryData(key, ctx?.prev ?? null);
      }
      const now = Date.now();
      if (now - toastCooldownRef.current > 8000) {
        toastCooldownRef.current = now;
        push({
          variant: "error",
          title: "Couldn't save personalization",
          description: "Check your connection and try again.",
        });
      }
    },
  });
  const patchPrefs = patchMutation.mutate;

  const [prefs, setPrefs] = useState<PersonalizationPrefsV1>(defaults);
  const prefsRef = useRef(prefs);
  const hydratedRef = useRef(false);
  const initialSyncRef = useRef(false);
  const prevUserIdRef = useRef<string>("");

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remotePersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  useEffect(() => {
    persistEyeTrackingPreference(Boolean(prefs.allowEyeTracking));
  }, [prefs.allowEyeTracking]);

  useEffect(() => {
    if (prevUserIdRef.current === userId) return;
    prevUserIdRef.current = userId;
    hydratedRef.current = false;
    initialSyncRef.current = false;
    setSaveState("idle");
    setPrefs(defaults);
    lastSavedJSONRef.current = JSON.stringify(defaults);
  }, [userId, defaults]);

  useEffect(() => {
    if (!userId) return;

    const remoteReady = prefsQuery.isSuccess || prefsQuery.isError;
    if (!remoteReady) return;

    hydratedRef.current = true;

    const serverRaw = prefsQuery.isSuccess ? prefsQuery.data : null;
    if (serverRaw) {
      const normalized = normalizePrefs(serverRaw, defaults);
      setPrefs(normalized);
      lastSavedJSONRef.current = JSON.stringify(normalized);
      try {
        if (storageKey) window.localStorage.setItem(storageKey, JSON.stringify(normalized));
      } catch {
        // ignore storage errors
      }
      return;
    }

    // If server has no prefs (or is unreachable), fall back to local cache.
    let next = defaults;
    try {
      const raw = storageKey ? window.localStorage.getItem(storageKey) : null;
      const parsed = raw ? safeParseJSON(raw) : null;
      if (parsed) next = normalizePrefs(parsed, defaults);
    } catch {
      next = defaults;
    }

    setPrefs(next);
    lastSavedJSONRef.current = JSON.stringify(next);

    // One-time migration: if server has no prefs but local cache exists, sync it up.
    if (prefsQuery.isSuccess && prefsQuery.data == null && storageKey && !initialSyncRef.current) {
      initialSyncRef.current = true;
      try {
        const raw = window.localStorage.getItem(storageKey);
        const parsed = raw ? safeParseJSON(raw) : null;
        if (parsed) patchPrefs(normalizePrefs(parsed, defaults));
      } catch {
        // ignore
      }
    }
  }, [userId, prefsQuery.data, prefsQuery.isError, prefsQuery.isSuccess, defaults, storageKey, patchPrefs]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (localPersistTimerRef.current) clearTimeout(localPersistTimerRef.current);
      if (remotePersistTimerRef.current) clearTimeout(remotePersistTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;

    // Local cache (best-effort).
    if (storageKey) {
      if (localPersistTimerRef.current) clearTimeout(localPersistTimerRef.current);
      localPersistTimerRef.current = setTimeout(() => {
        localPersistTimerRef.current = null;
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(prefsRef.current));
        } catch {
          // ignore storage errors
        }
      }, 250);
    }

    const json = JSON.stringify(prefsRef.current);
    const dirty = json !== lastSavedJSONRef.current;
    if (!dirty) {
      setSaveState("idle");
      return;
    }

    const canSync = Boolean(userId) && !prefsQuery.isError;
    if (!canSync) {
      setSaveState("error");
      return;
    }

    setSaveState("saving");
    if (remotePersistTimerRef.current) clearTimeout(remotePersistTimerRef.current);
    remotePersistTimerRef.current = setTimeout(() => {
      remotePersistTimerRef.current = null;
      patchPrefs(prefsRef.current, {
        onSuccess: (_server, sent) => {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          const sentJSON = JSON.stringify(sent);
          if (JSON.stringify(prefsRef.current) !== sentJSON) return;
          setSaveState("saved");
          saveTimerRef.current = setTimeout(() => {
            if (JSON.stringify(prefsRef.current) === sentJSON) setSaveState("idle");
            saveTimerRef.current = null;
          }, 1200);
        },
        onError: () => {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          setSaveState("error");
          saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
          }, 1200);
        },
      });
    }, 650);
  }, [prefs, storageKey, userId, prefsQuery.isError, patchPrefs]);

  const resolvedTimezone = useMemo(
    () => prettyTimezone(prefs.timezoneMode, prefs.timezone, detectedTimezone),
    [prefs.timezoneMode, prefs.timezone, detectedTimezone]
  );

  const resetToDefaults = useCallback(() => {
    setPrefs(defaults);
    try {
      if (storageKey) window.localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [defaults, storageKey]);

  if (userId && prefsQuery.isPending) {
    return (
      <div className="space-y-8">
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl border border-border/60 bg-background/60 text-muted-foreground">
              <Info className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Personalization</div>
              <div className="text-xs text-muted-foreground">Loading your preferences…</div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl border border-border/60 bg-background/60 text-muted-foreground">
              <Info className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground">Defaults, not rules</div>
              <div className="text-xs text-muted-foreground">
                Used when you start a new path or when Neurobridge doesn’t have enough signal yet.
                You can override per-path later.
              </div>
            </div>
          </div>
          <div
            className={cn(
              "flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity nb-duration-micro nb-ease-out motion-reduce:transition-none",
              saveState === "saving" || saveState === "saved" || saveState === "error" ? "opacity-100" : "opacity-0"
            )}
            aria-live="polite"
          >
            {saveState === "saving" ? <RotateCcw className="h-3.5 w-3.5 animate-spin" /> : null}
            {saveState === "saved" ? <Check className="h-3.5 w-3.5" /> : null}
            {saveState === "error" ? <Info className="h-3.5 w-3.5" /> : null}
            {saveState === "saving" ? "Saving…" : null}
            {saveState === "saved" ? "Saved" : null}
            {saveState === "error" ? "Saved locally" : null}
          </div>
        </div>
      </div>

      <AboutYouSection
        nickname={prefs.nickname}
        occupation={prefs.occupation}
        about={prefs.about}
        setPrefs={setPrefs}
      />

      <LanguageRegionSection
        language={prefs.language}
        timezoneMode={prefs.timezoneMode}
        timezone={prefs.timezone}
        units={prefs.units}
        resolvedTimezone={resolvedTimezone}
        setPrefs={setPrefs}
      />

      <LearningDefaultsSection
        mathComfort={prefs.mathComfort}
        codingComfort={prefs.codingComfort}
        sessionMinutes={prefs.sessionMinutes}
        sessionsPerWeek={prefs.sessionsPerWeek}
        setPrefs={setPrefs}
      />

      <AccessibilitySection
        learningDisabilities={prefs.learningDisabilities}
        learningDisabilitiesOther={prefs.learningDisabilitiesOther}
        setPrefs={setPrefs}
      />

      <DefaultTeachingStyleSection
        defaultDepth={prefs.defaultDepth}
        defaultTeachingStyle={prefs.defaultTeachingStyle}
        defaultTone={prefs.defaultTone}
        defaultPractice={prefs.defaultPractice}
        preferShortParagraphs={prefs.preferShortParagraphs}
        preferBulletSummaries={prefs.preferBulletSummaries}
        askClarifyingQuestions={prefs.askClarifyingQuestions}
        setPrefs={setPrefs}
      />

      <PersonalizationControlsSection
        allowBehaviorPersonalization={prefs.allowBehaviorPersonalization}
        allowTelemetry={prefs.allowTelemetry}
        allowEyeTracking={prefs.allowEyeTracking}
        setPrefs={setPrefs}
        onReset={resetToDefaults}
      />
    </div>
  );
}
