import * as React from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, m } from "framer-motion"
import { X } from "lucide-react"

import { cn } from "@/shared/lib/utils"

export type ToastVariant = "default" | "success" | "error" | "info"

export type ToastAction = {
  label: string
  onClick: () => void
  className?: string
}

export type ToastItem = {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
  durationMs?: number // 0 => sticky
  actions?: ToastAction[]
}

type ToastInput = Omit<ToastItem, "id"> & { id?: string }

type ToastContextValue = {
  push: (toast: ToastInput) => string
  dismiss: (id: string) => void
  clear: () => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

function genId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  } catch (err) {
    void err
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function variantClasses(variant: ToastVariant | undefined) {
  switch (variant) {
    case "success":
      return "border-emerald-200/40 dark:border-emerald-400/20"
    case "error":
      return "border-destructive/40"
    case "info":
      return "border-sky-200/40 dark:border-sky-400/20"
    default:
      return "border-border"
  }
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([])
  const timersRef = React.useRef<Map<string, number>>(new Map())

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const clear = React.useCallback(() => {
    setToasts([])
    for (const timer of timersRef.current.values()) {
      window.clearTimeout(timer)
    }
    timersRef.current.clear()
  }, [])

  const push = React.useCallback(
    (toast: ToastInput) => {
      const id = String(toast.id || genId())
      const next: ToastItem = {
        id,
        title: toast.title,
        description: toast.description,
        variant: toast.variant ?? "default",
        durationMs: typeof toast.durationMs === "number" ? toast.durationMs : 9000,
        actions: toast.actions ?? [],
      }

      setToasts((prev) => {
        const existingIdx = prev.findIndex((t) => t.id === id)
        if (existingIdx === -1) return [next, ...prev].slice(0, 4)
        const copy = prev.slice()
        copy[existingIdx] = { ...copy[existingIdx], ...next }
        return copy
      })

      const duration = next.durationMs ?? 0
      if (duration > 0) {
        const existingTimer = timersRef.current.get(id)
        if (existingTimer) window.clearTimeout(existingTimer)
        const timer = window.setTimeout(() => dismiss(id), duration)
        timersRef.current.set(id, timer)
      }

      return id
    },
    [dismiss]
  )

  React.useEffect(() => {
    return () => clear()
  }, [clear])

  const value = React.useMemo<ToastContextValue>(() => ({ push, dismiss, clear }), [push, dismiss, clear])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider")
  }
  return ctx
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  if (!mounted) return null

  return createPortal(
    <div className="pointer-events-none fixed left-4 right-4 top-4 z-50 flex flex-col items-end gap-2 sm:left-auto">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <m.div
            key={t.id}
            initial={{ opacity: 0, x: 12, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 560, damping: 36, mass: 0.7 }}
            className={cn(
              "pointer-events-auto group relative w-full overflow-hidden rounded-2xl border bg-background/90 p-4 shadow-xl backdrop-blur sm:w-[420px]",
              variantClasses(t.variant)
            )}
            role="status"
            aria-live="polite"
          >
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground opacity-70 transition hover:bg-muted hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>

            {t.title ? <div className="pr-9 text-sm font-semibold text-foreground">{t.title}</div> : null}
            {t.description ? (
              <div className="mt-1 pr-9 text-sm text-muted-foreground whitespace-pre-wrap">{t.description}</div>
            ) : null}

            {t.actions && t.actions.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                {t.actions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={a.onClick}
                    className={cn(
                      "inline-flex items-center justify-center rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted",
                      a.className
                    )}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            ) : null}
          </m.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  )
}
