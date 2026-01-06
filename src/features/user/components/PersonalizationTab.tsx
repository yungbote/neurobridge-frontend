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
import { Check, Info, RotateCcw, Shield, Sparkles } from "lucide-react";
import { useUser } from "@/app/providers/UserProvider";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Switch } from "@/shared/ui/switch";
import { Textarea } from "@/shared/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { cn } from "@/shared/lib/utils";

type LanguagePreference = "auto" | "en" | "es" | "fr" | "de" | "pt";
type UnitSystem = "metric" | "imperial";
type ComfortLevel = "low" | "medium" | "high";
type CodingComfort = "none" | "some" | "high";
type TimezoneMode = "auto" | "manual";

type ResponseDepth = "concise" | "standard" | "thorough";
type TeachingStyle = "balanced" | "direct" | "socratic";
type TonePreference = "neutral" | "encouraging" | "no_fluff";
type PracticePreference = "light" | "balanced" | "more";

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

  defaultDepth: ResponseDepth;
  defaultTeachingStyle: TeachingStyle;
  defaultTone: TonePreference;
  defaultPractice: PracticePreference;

  preferShortParagraphs: boolean;
  preferBulletSummaries: boolean;
  askClarifyingQuestions: boolean;

  allowBehaviorPersonalization: boolean;
  allowTelemetry: boolean;
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

function asInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
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

    defaultDepth: "standard",
    defaultTeachingStyle: "balanced",
    defaultTone: "neutral",
    defaultPractice: "balanced",

    preferShortParagraphs: false,
    preferBulletSummaries: true,
    askClarifyingQuestions: true,

    allowBehaviorPersonalization: true,
    allowTelemetry: true,
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

    defaultDepth,
    defaultTeachingStyle,
    defaultTone,
    defaultPractice,

    preferShortParagraphs: bool(obj.preferShortParagraphs, defaults.preferShortParagraphs),
    preferBulletSummaries: bool(obj.preferBulletSummaries, defaults.preferBulletSummaries),
    askClarifyingQuestions: bool(obj.askClarifyingQuestions, defaults.askClarifyingQuestions),

    allowBehaviorPersonalization: bool(obj.allowBehaviorPersonalization, defaults.allowBehaviorPersonalization),
    allowTelemetry: bool(obj.allowTelemetry, defaults.allowTelemetry),
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
  setPrefs,
  onReset,
}: {
  allowBehaviorPersonalization: boolean;
  allowTelemetry: boolean;
  setPrefs: PrefsSetter;
  onReset: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);

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
    </section>
  );
});

export function PersonalizationTab() {
  const { user } = useUser();
  const detectedTimezone = useDetectedTimezone();

  const storageKey = useMemo(() => (user?.id ? storageKeyForUser(user.id) : ""), [user?.id]);

  const defaults = useMemo(() => {
    const nickname = String(user?.firstName || "").trim();
    return buildDefaults({ nickname, detectedTimezone });
  }, [user?.firstName, detectedTimezone]);

  const [prefs, setPrefs] = useState<PersonalizationPrefsV1>(defaults);
  const prefsRef = useRef(prefs);
  const hydratedRef = useRef(false);

  const [justSaved, setJustSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  useEffect(() => {
    if (!storageKey) return;
    hydratedRef.current = true;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setPrefs(defaults);
        return;
      }
      const parsed = safeParseJSON(raw);
      setPrefs(normalizePrefs(parsed, defaults));
    } catch {
      setPrefs(defaults);
    }
  }, [storageKey, defaults]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!storageKey) return;
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(prefsRef.current));
      } catch {
        // ignore storage errors
      }
    }, 250);

    setJustSaved(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setJustSaved(false);
      saveTimerRef.current = null;
    }, 1200);
  }, [prefs, storageKey]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, []);

  // Flush pending writes on unmount and when storageKey changes.
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      if (!hydratedRef.current) return;
      if (!storageKey) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(prefsRef.current));
      } catch {
        // ignore storage errors
      }
    };
  }, [storageKey]);

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
              "flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity",
              justSaved ? "opacity-100" : "opacity-0"
            )}
            aria-live="polite"
          >
            <Check className="h-3.5 w-3.5" />
            Saved
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
        setPrefs={setPrefs}
        onReset={resetToDefaults}
      />
    </div>
  );
}
