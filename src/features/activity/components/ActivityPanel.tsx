import React, { useCallback, useRef } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/shared/ui/icon-button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/ui/sheet";
import { useIsMobile } from "@/app/providers/ViewportProvider";
import { cn } from "@/shared/lib/utils";
import { useActivityPanel } from "@/app/providers/ActivityPanelProvider";

export function ActivityPanel() {
  const isMobile = useIsMobile();
  const { open, setOpen, width, setWidth, items } = useActivityPanel();

  const isResizing = useRef(false);
  const minWidth = 280;
  const maxWidth = 600;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;

      isResizing.current = true;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const startX = e.clientX;
      const startWidth = width;

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isResizing.current) return;
        const delta = startX - ev.clientX;
        const next = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
        setWidth(next);
      };

      const handleMouseUp = () => {
        isResizing.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [width, setWidth]
  );

  const Content = (
    <div className="flex h-full flex-col">
      <div className="h-14 flex items-center justify-between border-b border-border px-5 py-4">
        <h1 className="text-sm font-medium text-foreground">Activity</h1>
        <IconButton
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full"
          label="Close activity"
          shortcut="Esc"
          onClick={() => setOpen(false)}
        >
          <X className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="space-y-0">
          {(items || []).map((a, index) => (
            <div key={a.id || index} className="flex items-stretch gap-3">
              <div className="relative flex flex-col items-center flex-shrink-0">
                <div className="mt-2 h-2 w-2 rounded-full bg-muted-foreground/70 z-10" />
                {index < items.length - 1 && (
                  <div className="absolute top-4 bottom-0 w-px bg-border" />
                )}
              </div>

              <div className="min-w-0 pb-5">
                <h2 className="mb-1.5 text-[15px] font-semibold leading-snug tracking-tight text-foreground">
                  {a.title}
                </h2>
                {a.content ? (
                  <div className="text-[14px] leading-[1.65] text-muted-foreground">
                    {a.content}
                  </div>
                ) : null}
                {typeof a.progress === "number" ? (
                  <div className="mt-2">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${Math.max(0, Math.min(100, a.progress))}%` }}
                      />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {Math.round(a.progress)}%
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {(!items || items.length === 0) && (
            <div className="text-sm text-muted-foreground">No activity yet.</div>
          )}
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="p-0 w-[92vw] sm:w-[420px]">
          <SheetHeader className="sr-only">
            <SheetTitle>Activity</SheetTitle>
          </SheetHeader>
          {Content}
        </SheetContent>
      </Sheet>
    );
  }

  if (!open) return null;

  return (
    <div
      style={{ width }}
      className={cn(
        "sticky top-0 h-svh shrink-0 border-l border-border bg-background/95 backdrop-blur flex flex-col relative"
      )}
    >
      <div
        onMouseDown={handleMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-muted/60 transition-colors"
      >
        <div className="absolute left-0 top-0 bottom-0 w-4 -translate-x-1/2" />
      </div>
      {Content}
    </div>
  );
}






