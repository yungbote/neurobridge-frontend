import { useEffect, useMemo, useState } from "react"
import { useTheme } from "@/providers/ThemeProvider"
import { useUser } from "@/providers/UserProvider"
import { X, Settings, Bell, Smile, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"

export function SettingsDialog({ open, onOpenChange, initialTab = "general" }) {
  const { theme, setTheme } = useTheme()
  const { user, changeTheme } = useUser()
  const currentTheme = user?.preferredTheme ?? theme

  const [activeTab, setActiveTab] = useState(initialTab)

  useEffect(() => {
    if (open) setActiveTab(initialTab)
  }, [open, initialTab])

  const navItems = useMemo(
    () => [
      { id: "general", label: "General", icon: Settings },
      { id: "notifications", label: "Notifications", icon: Bell },
      { id: "personalization", label: "Personalization", icon: Smile },
      { id: "account", label: "Account", icon: User },
    ],
    []
  )

  const title = useMemo(() => {
    const found = navItems.find((n) => n.id === activeTab)
    return found?.label ?? "Settings"
  }, [activeTab, navItems])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={[
          "p-0 gap-0 overflow-hidden",
          "bg-card text-foreground border-border",
          "rounded-2xl shadow-2xl",
          "w-[calc(100vw-2rem)] sm:w-full sm:max-w-3xl",
          "h-[calc(100svh-2rem)] sm:h-[600px]",
        ].join(" ")}
      >
        <div className="flex h-full w-full flex-col sm:flex-row">
          {/* Mobile header */}
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:hidden">
            <h1 className="text-base font-semibold text-foreground">{title}</h1>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl hover:bg-muted"
              onClick={() => onOpenChange?.(false)}
              aria-label="Close settings"
            >
              <X className="size-5 text-foreground/80" />
            </Button>
          </div>

          {/* Mobile tabs */}
          <div className="border-b border-border bg-muted/20 sm:hidden">
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
                      isActive ? "bg-muted text-foreground" : "text-foreground/80 hover:bg-muted/70",
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
          <div className="hidden w-64 shrink-0 bg-muted/40 border-r border-border p-3 sm:flex sm:flex-col">
            <Button
              variant="ghost"
              size="icon"
              className="self-start mb-4 rounded-xl hover:bg-muted"
              onClick={() => onOpenChange?.(false)}
              aria-label="Close settings"
            >
              <X className="size-5 text-foreground/80" />
            </Button>

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
                      isActive ? "bg-muted text-foreground" : "text-foreground/80 hover:bg-muted/70",
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

            <Separator className="hidden sm:block" />

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 sm:px-8 sm:py-6">
              {activeTab === "general" && (
                <GeneralTab
                  currentTheme={currentTheme}
                  onChangeTheme={(v) => {
                    // guard values
                    if (v !== "light" && v !== "dark" && v !== "system") return
                    setTheme(v)      // immediate UI
                    changeTheme(v)   // persist to backend
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
  )
}

function GeneralTab({ currentTheme, onChangeTheme }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-6 border-b border-border">
        <label className="text-sm font-normal text-foreground">Appearance</label>
        <Select value={currentTheme} onValueChange={onChangeTheme}>
          {/* ghost-ish */}
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
  )
}

function PlaceholderTab({ label }) {
  return <div className="text-sm text-muted-foreground">{label} settings coming soon.</div>
}









