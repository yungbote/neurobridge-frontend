import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/app/providers/ThemeProvider";
import { useI18n } from "@/app/providers/I18nProvider";
import { useUser } from "@/app/providers/UserProvider";
import { buildPlannedLanguageOptions, catalogKeyForLocale } from "@/shared/i18n/languages";
import { UI_THEME_OPTIONS } from "@/shared/theme/uiThemes";
import { X, Settings, Bell, Smile, User, Check, ChevronDown, Search, type LucideIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Separator } from "@/shared/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/shared/ui/accordion";
import { PersonalizationTab } from "@/features/user/components/PersonalizationTab";
import type { ThemePreference, UiTheme } from "@/shared/types/models";

export type SettingsTab = "general" | "notifications" | "personalization" | "account";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: SettingsTab;
}

export function SettingsDialog({ open, onOpenChange, initialTab = "general" }: SettingsDialogProps) {
  const { theme, setTheme, uiTheme, setUiTheme } = useTheme();
  const { user, changeTheme, changeUiTheme } = useUser();
  const { t } = useI18n();
  const currentTheme = (user?.preferredTheme ?? theme) as ThemePreference;
  const currentUiTheme = (user?.preferredUiTheme ?? uiTheme) as UiTheme;

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  const navItems = useMemo(
    (): Array<{ id: SettingsTab; label: string; icon: LucideIcon }> => [
      { id: "general", label: t("settings.general"), icon: Settings },
      { id: "notifications", label: t("settings.notifications"), icon: Bell },
      { id: "personalization", label: t("settings.personalization"), icon: Smile },
      { id: "account", label: t("settings.account"), icon: User },
    ],
    [t]
  );

  const title = useMemo(() => {
    const found = navItems.find((n) => n.id === activeTab);
    return found?.label ?? t("settings.title");
  }, [activeTab, navItems]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={[
          "p-0 gap-0 overflow-hidden grid-rows-[minmax(0,1fr)]",
          "w-[calc(100vw-2rem)] sm:w-full sm:max-w-3xl",
          "h-[calc(100svh-2rem)] sm:h-[600px]",
        ].join(" ")}
      >
        <div className="flex h-full w-full min-h-0 flex-col sm:flex-row">
          {/* Mobile header */}
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4 sm:hidden">
            <h1 className="text-base font-semibold text-foreground">{title}</h1>
            <IconButton
              variant="ghost"
              size="icon"
              className="rounded-xl hover:bg-muted/60"
              onClick={() => onOpenChange?.(false)}
              label={t("settings.close")}
              shortcut="Esc"
            >
              <X className="size-5 text-foreground/80" />
            </IconButton>
          </div>

          {/* Mobile tabs */}
          <div className="border-b border-border/60 bg-muted/20 sm:hidden">
            <div className="scrollbar-none flex items-center gap-1 overflow-x-auto px-2 py-2 touch-pan-x -webkit-tap-highlight-color-transparent">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={[
                      "flex items-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium",
                      // Touch-friendly sizing (min 44px height)
                      "min-h-[44px] px-3 py-2",
                      // Transitions
                      "nb-motion-fast motion-reduce:transition-none",
                      // Touch optimizations
                      "touch-manipulation -webkit-tap-highlight-color-transparent active:scale-[0.97]",
                      isActive ? "bg-muted/60 text-foreground" : "text-foreground/70 hover:bg-muted/50 active:bg-muted/40",
                    ].join(" ")}
                  >
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Desktop sidebar */}
          <div className="hidden w-64 shrink-0 bg-muted/30 border-e border-border/60 p-3 sm:flex sm:flex-col">
            <IconButton
              variant="ghost"
              size="icon"
              className="self-start mb-4 rounded-xl hover:bg-muted/60"
              onClick={() => onOpenChange?.(false)}
              label={t("settings.close")}
              shortcut="Esc"
            >
              <X className="size-5 text-foreground/80" />
            </IconButton>

            <nav className="space-y-1 flex-1">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={[
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium nb-motion-fast motion-reduce:transition-none",
                      isActive ? "bg-muted/60 text-foreground" : "text-foreground/70 hover:bg-muted/50",
                    ].join(" ")}
                  >
                    <Icon className="size-5" />
                    <span>{item.label}</span>
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <div className="hidden px-8 pt-8 pb-6 sm:block">
              <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
            </div>

            <Separator className="hidden sm:block bg-border/60" />

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 sm:px-8 sm:py-6 scrollbar-none">
              {activeTab === "general" && (
                <GeneralTab
                  currentTheme={currentTheme}
                  currentUiTheme={currentUiTheme}
                  onChangeTheme={(v: string) => {
                    // guard values
                    if (v !== "light" && v !== "dark" && v !== "system") return;
                    const next = v as ThemePreference;
                    setTheme(next);      // immediate UI
                    changeTheme(next);   // persist to backend
                  }}
                  onChangeUiTheme={(next: UiTheme) => {
                    setUiTheme(next);      // immediate UI
                    changeUiTheme(next);   // persist to backend
                  }}
                />
              )}
              {activeTab === "notifications" && <PlaceholderTab label={t("settings.notifications")} />}
              {activeTab === "personalization" && <PersonalizationTab />}
              {activeTab === "account" && <PlaceholderTab label={t("settings.account")} />}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface GeneralTabProps {
  currentTheme: ThemePreference;
  currentUiTheme: UiTheme;
  onChangeTheme: (value: string) => void;
  onChangeUiTheme: (value: UiTheme) => void;
}

function GeneralTab({ currentTheme, currentUiTheme, onChangeTheme, onChangeUiTheme }: GeneralTabProps) {
  const { t, localePreference, locale, setLocalePreference, languageOptions } = useI18n();
  const [uiThemeOpen, setUiThemeOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [langQuery, setLangQuery] = useState("");
  const currentUiOption = useMemo(
    () => UI_THEME_OPTIONS.find((option) => option.id === currentUiTheme) ?? UI_THEME_OPTIONS[0],
    [currentUiTheme]
  );
  const plannedLanguageOptions = useMemo(() => buildPlannedLanguageOptions(locale), [locale]);

  const currentLanguageLabel = useMemo(() => {
    const tag = localePreference === "auto" ? locale : String(localePreference);
    const normalized = String(tag).trim();
    const exact = languageOptions.find((o) => o.tag.toLowerCase() === normalized.toLowerCase());
    const catalogKey = catalogKeyForLocale(normalized);
    const byCatalogKey = catalogKey ? languageOptions.find((o) => o.tag.toLowerCase() === catalogKey.toLowerCase()) : undefined;
    const base = exact?.label || byCatalogKey?.label || normalized;
    if (localePreference === "auto") return `${t("settings.language.auto")} • ${base}`;
    return base;
  }, [languageOptions, locale, localePreference, t]);

  const filteredAvailableLanguages = useMemo(() => {
    const q = langQuery.trim().toLowerCase();
    if (!q) return languageOptions;
    return languageOptions.filter((o) => {
      return (
        o.tag.toLowerCase().includes(q) ||
        o.label.toLowerCase().includes(q) ||
        o.nativeLabel.toLowerCase().includes(q)
      );
    });
  }, [langQuery, languageOptions]);

  const filteredPlannedLanguages = useMemo(() => {
    const q = langQuery.trim().toLowerCase();
    if (!q) return plannedLanguageOptions;
    return plannedLanguageOptions.filter((o) => {
      return (
        o.tag.toLowerCase().includes(q) ||
        o.label.toLowerCase().includes(q) ||
        o.nativeLabel.toLowerCase().includes(q)
      );
    });
  }, [langQuery, plannedLanguageOptions]);

  return (
    <div className="space-y-6">
      <div className="space-y-5 pb-6 border-b border-border/60">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-foreground">{t("settings.mode.label")}</div>
            <div className="text-xs text-muted-foreground">{t("settings.mode.help")}</div>
          </div>
          <Select value={currentTheme} onValueChange={onChangeTheme}>
            <SelectTrigger className="w-32 border-0 bg-transparent hover:bg-muted rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">{t("settings.mode.light")}</SelectItem>
              <SelectItem value="dark">{t("settings.mode.dark")}</SelectItem>
              <SelectItem value="system">{t("settings.mode.system")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Accordion
          type="single"
          collapsible
          value={uiThemeOpen ? "ui-theme" : ""}
          onValueChange={(value) => setUiThemeOpen(value === "ui-theme")}
        >
          <AccordionItem value="ui-theme" className="border-b-0">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-foreground">{t("settings.uiTheme.label")}</div>
                <div className="text-xs text-muted-foreground">{t("settings.uiTheme.help")}</div>
              </div>
              <AccordionTrigger
                className={[
                  "flex-none w-auto items-center justify-center gap-2 rounded-xl border border-border/60",
                  "bg-muted/30 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50",
                  "hover:no-underline",
                ].join(" ")}
              >
                <span className="text-sm font-medium">{currentUiOption.label}</span>
                <span className="flex items-center gap-1.5">
                  {currentUiOption.swatches.map((swatch) => (
                    <span
                      key={swatch}
                      className="h-3.5 w-3.5 rounded-full border border-border"
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                </span>
              </AccordionTrigger>
            </div>
            <AccordionContent className="pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {UI_THEME_OPTIONS.map((theme) => {
                  const isActive = theme.id === currentUiTheme;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => {
                        onChangeUiTheme(theme.id);
                        setUiThemeOpen(false);
                      }}
                      className={[
                        "w-full rounded-2xl border text-start",
                        // Touch-friendly sizing (min 56px height on mobile)
                        "min-h-[56px] sm:min-h-[48px] px-3 py-3",
                        // Transitions
                        "nb-motion-fast motion-reduce:transition-none",
                        // Touch optimizations
                        "touch-manipulation -webkit-tap-highlight-color-transparent active:scale-[0.98]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                        isActive
                          ? "border-foreground/40 bg-muted/40 shadow-sm"
                          : "border-border/60 hover:border-foreground/30 hover:bg-muted/30 active:bg-muted/40",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-foreground">{theme.label}</div>
                          <div className="text-xs text-muted-foreground">{theme.description}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            {theme.swatches.map((swatch) => (
                              <span
                                key={swatch}
                                className="h-3.5 w-3.5 rounded-full border border-border"
                                style={{ backgroundColor: swatch }}
                              />
                            ))}
                          </div>
                          {isActive && (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <div className="flex items-center justify-between pb-6">
        <label className="text-sm font-normal text-foreground">{t("settings.language.label")}</label>
        <button
          type="button"
          onClick={() => setLangOpen(true)}
          className={[
            "w-56 inline-flex items-center justify-between gap-2 rounded-xl px-3 py-2",
            "border border-transparent bg-transparent text-sm text-foreground/90",
            "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          ].join(" ")}
          aria-label={t("settings.language.label")}
        >
          <span className="truncate">{currentLanguageLabel}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <Dialog
        open={langOpen}
        onOpenChange={(next) => {
          setLangOpen(next);
          if (!next) setLangQuery("");
        }}
      >
        <DialogContent className="sm:max-w-xl" showCloseButton>
          <DialogHeader>
            <DialogTitle>{t("settings.language.dialog.title")}</DialogTitle>
            <DialogDescription>{t("settings.language.dialog.subtitle")}</DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              value={langQuery}
              onChange={(e) => setLangQuery(e.target.value)}
              placeholder={t("common.search")}
              className="border-0 bg-transparent p-0 h-auto shadow-none focus-visible:ring-0"
            />
          </div>

          <div className="max-h-[55vh] overflow-y-auto rounded-2xl border border-border/60">
            <div className="px-4 pt-4 pb-2 text-xs font-medium text-muted-foreground">
              {t("settings.language.dialog.current")}
            </div>
            <button
              type="button"
              onClick={() => {
                setLocalePreference("auto");
                setLangOpen(false);
              }}
              className={[
                "w-full flex items-center justify-between gap-3 text-sm text-foreground",
                // Touch-friendly sizing (min 48px height on mobile)
                "min-h-[48px] sm:min-h-[44px] px-4 py-3",
                // Hover/active states
                "hover:bg-muted/40 active:bg-muted/50",
                // Touch optimizations
                "touch-manipulation -webkit-tap-highlight-color-transparent",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
              ].join(" ")}
            >
              <div className="min-w-0">
                <div className="font-medium">{t("settings.language.auto")}</div>
                <div className="text-xs text-muted-foreground truncate">{locale}</div>
              </div>
              {localePreference === "auto" && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </button>

            <div className="px-4 pt-5 pb-2 text-xs font-medium text-muted-foreground">
              {t("settings.language.dialog.all")}
            </div>
            <div className="pb-2">
              {filteredAvailableLanguages.map((opt) => {
                const selected =
                  localePreference !== "auto" &&
                  catalogKeyForLocale(String(localePreference))?.toLowerCase() === opt.tag.toLowerCase();
                return (
                  <button
                    key={opt.tag}
                    type="button"
                    onClick={() => {
                      setLocalePreference(opt.tag);
                      setLangOpen(false);
                    }}
                    className={[
                      "w-full flex items-center justify-between gap-3 text-sm text-foreground",
                      // Touch-friendly sizing (min 48px height on mobile)
                      "min-h-[48px] sm:min-h-[44px] px-4 py-3",
                      // Hover/active states
                      "hover:bg-muted/40 active:bg-muted/50",
                      // Touch optimizations
                      "touch-manipulation -webkit-tap-highlight-color-transparent",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                    ].join(" ")}
                  >
                    <div className="min-w-0 flex items-start justify-between gap-4 flex-1">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{opt.label}</div>
                        <div className="text-xs text-muted-foreground truncate">{opt.tag}</div>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{opt.nativeLabel}</div>
                    </div>
                    {selected && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {filteredPlannedLanguages.length > 0 ? (
              <>
                <div className="px-4 pt-5 pb-2 text-xs font-medium text-muted-foreground">
                  {t("settings.language.dialog.comingSoon")}
                </div>
                <div className="pb-2">
                  {filteredPlannedLanguages.map((opt) => {
                    return (
                      <div
                        key={opt.tag}
                        aria-disabled="true"
                        className={[
                          "w-full px-4 py-3 flex items-center justify-between gap-3 text-sm text-foreground",
                          "opacity-60 cursor-not-allowed",
                        ].join(" ")}
                      >
                        <div className="min-w-0 flex items-start justify-between gap-4 flex-1">
                          <div className="min-w-0">
                            <div className="font-medium truncate">{opt.label}</div>
                            <div className="text-xs text-muted-foreground truncate">{opt.tag}</div>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{opt.nativeLabel}</div>
                        </div>
                        <span className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {t("settings.language.dialog.comingSoon")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}

            {filteredAvailableLanguages.length === 0 && filteredPlannedLanguages.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">{t("common.noResults")}</div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlaceholderTab({ label }: { label: string }) {
  const { t } = useI18n();
  return <div className="text-sm text-muted-foreground">{t("settings.placeholder.comingSoon", { label })}</div>;
}
