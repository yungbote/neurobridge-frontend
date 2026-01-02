import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/app/providers/ThemeProvider";
import { useUser } from "@/app/providers/UserProvider";
import { UI_THEME_OPTIONS } from "@/shared/theme/uiThemes";
import { X, Settings, Bell, Smile, User, Check, type LucideIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import { Dialog, DialogContent } from "@/shared/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Separator } from "@/shared/ui/separator";
import type { ThemePreference, UiTheme } from "@/shared/types/models";

type SettingsTab = "general" | "notifications" | "personalization" | "account";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: SettingsTab;
}

export function SettingsDialog({ open, onOpenChange, initialTab = "general" }: SettingsDialogProps) {
  const { theme, setTheme, uiTheme, setUiTheme } = useTheme();
  const { user, changeTheme, changeUiTheme } = useUser();
  const currentTheme = (user?.preferredTheme ?? theme) as ThemePreference;
  const currentUiTheme = (user?.preferredUiTheme ?? uiTheme) as UiTheme;

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  const navItems = useMemo(
    (): Array<{ id: SettingsTab; label: string; icon: LucideIcon }> => [
      { id: "general", label: "General", icon: Settings },
      { id: "notifications", label: "Notifications", icon: Bell },
      { id: "personalization", label: "Personalization", icon: Smile },
      { id: "account", label: "Account", icon: User },
    ],
    []
  );

  const title = useMemo(() => {
    const found = navItems.find((n) => n.id === activeTab);
    return found?.label ?? "Settings";
  }, [activeTab, navItems]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={[
          "p-0 gap-0 overflow-hidden",
          "w-[calc(100vw-2rem)] sm:w-full sm:max-w-3xl",
          "h-[calc(100svh-2rem)] sm:h-[600px]",
        ].join(" ")}
      >
        <div className="flex h-full w-full flex-col sm:flex-row">
          {/* Mobile header */}
          <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4 sm:hidden">
            <h1 className="text-base font-semibold text-foreground">{title}</h1>
            <IconButton
              variant="ghost"
              size="icon"
              className="rounded-xl hover:bg-muted/60"
              onClick={() => onOpenChange?.(false)}
              label="Close settings"
            >
              <X className="size-5 text-foreground/80" />
            </IconButton>
          </div>

          {/* Mobile tabs */}
          <div className="border-b border-border/60 bg-muted/20 sm:hidden">
            <div className="scrollbar-none flex items-center gap-2 overflow-x-auto px-3 py-2">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = activeTab === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={[
                      "flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                      isActive ? "bg-muted/60 text-foreground" : "text-foreground/70 hover:bg-muted/50",
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
          <div className="hidden w-64 shrink-0 bg-muted/30 border-r border-border/60 p-3 sm:flex sm:flex-col">
            <IconButton
              variant="ghost"
              size="icon"
              className="self-start mb-4 rounded-xl hover:bg-muted/60"
              onClick={() => onOpenChange?.(false)}
              label="Close settings"
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
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
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
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="hidden px-8 pt-8 pb-6 sm:block">
              <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
            </div>

            <Separator className="hidden sm:block bg-border/60" />

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 sm:px-8 sm:py-6">
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
              {activeTab === "notifications" && <PlaceholderTab label="Notifications" />}
              {activeTab === "personalization" && <PlaceholderTab label="Personalization" />}
              {activeTab === "account" && <PlaceholderTab label="Account" />}
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
  return (
    <div className="space-y-6">
      <div className="space-y-5 pb-6 border-b border-border/60">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-foreground">Mode</div>
            <div className="text-xs text-muted-foreground">Light, dark, or system.</div>
          </div>
          <Select value={currentTheme} onValueChange={onChangeTheme}>
            <SelectTrigger className="w-32 border-0 bg-transparent hover:bg-muted rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-sm font-medium text-foreground">UI theme</div>
            <div className="text-xs text-muted-foreground">Choose a palette and surface feel.</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {UI_THEME_OPTIONS.map((theme) => {
              const isActive = theme.id === currentUiTheme;
              return (
                <button
                  key={theme.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onChangeUiTheme(theme.id)}
                  className={[
                    "w-full rounded-2xl border px-3 py-3 text-left transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    isActive
                      ? "border-foreground/40 bg-muted/40 shadow-sm"
                      : "border-border/60 hover:border-foreground/30 hover:bg-muted/30",
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
        </div>
      </div>

      <div className="flex items-center justify-between pb-6">
        <label className="text-sm font-normal text-foreground">Language</label>
        <Select defaultValue="auto">
          <SelectTrigger className="w-40 border-0 bg-transparent hover:bg-muted rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto-detect</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="es">Spanish</SelectItem>
            <SelectItem value="fr">French</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function PlaceholderTab({ label }: { label: string }) {
  return <div className="text-sm text-muted-foreground">{label} settings coming soon.</div>;
}
