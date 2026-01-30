import React, { useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { X, ExternalLink } from "lucide-react";
import { AnimatePresence, m } from "framer-motion";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/ui/sheet";
import { IconButton } from "@/shared/ui/icon-button";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { useIsMobile } from "@/app/providers/ViewportProvider";
import { useChatDock } from "@/app/providers/ChatDockProvider";
import { nbPanelRight, nbTransitions } from "@/shared/motion/presets";
import { useI18n } from "@/app/providers/I18nProvider";
import ChatThreadPage from "@/features/chat/pages/ChatThreadPage";

export function ChatDockPanel() {
  const isMobile = useIsMobile();
  const { t } = useI18n();
  const { open, setOpen, width, setWidth, activeThreadId, activeContext } = useChatDock();

  const isResizing = useRef(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const minWidth = 340;
  const maxWidth = 760;

  const chatScale = useMemo(() => {
    if (isMobile) return 0.95;
    const t = Math.min(1, Math.max(0, (width - minWidth) / (maxWidth - minWidth)));
    return 0.92 + t * 0.08;
  }, [isMobile, width]);

  const chatVars = useMemo(
    () =>
      ({
        "--chat-scale": chatScale,
        "--chat-user-size": `${15 * chatScale}px`,
        "--chat-user-size-sm": `${16 * chatScale}px`,
        "--chat-body-size": `${16 * chatScale}px`,
        "--chat-body-size-sm": `${17 * chatScale}px`,
        "--chat-bubble-px": `${20 * chatScale}px`,
        "--chat-bubble-px-sm": `${24 * chatScale}px`,
        "--chat-bubble-py": `${12 * chatScale}px`,
        "--chat-bubble-py-sm": `${13 * chatScale}px`,
      }) as React.CSSProperties,
    [chatScale]
  );

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

  const handleWheelCapture = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (!open) return;
      if (Math.abs(e.deltaY) <= 0) return;

      const root = panelRef.current;
      const target = e.target as HTMLElement | null;
      if (!root || !target || !root.contains(target)) return;

      const canScrollElement = (el: HTMLElement) => {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        if (overflowY === "visible" || overflowY === "hidden") return false;
        return el.scrollHeight > el.clientHeight + 1;
      };

      const findScrollableAncestor = (el: HTMLElement) => {
        let current: HTMLElement | null = el;
        while (current && current !== root) {
          if (canScrollElement(current)) return current;
          current = current.parentElement;
        }
        return null;
      };

      const scrollable = findScrollableAncestor(target);
      const delta = e.deltaY;

      const isAtStart = (el: HTMLElement) => el.scrollTop <= 0;
      const isAtEnd = (el: HTMLElement) =>
        Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight;

      if (scrollable) {
        if ((delta < 0 && isAtStart(scrollable)) || (delta > 0 && isAtEnd(scrollable))) {
          e.preventDefault();
        }
        return;
      }

      const fallback = root.querySelector<HTMLElement>('[data-chat-scroll="true"]');
      if (fallback && canScrollElement(fallback)) {
        fallback.scrollTop += delta;
        e.preventDefault();
      } else {
        e.preventDefault();
      }
    },
    [open]
  );

  const Content = (
    <div className="flex h-full flex-col">
      <div className="h-14 sm:h-16 flex items-center justify-between border-b border-border px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium text-foreground">{t("chat.title")}</h1>
          {activeThreadId ? (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" asChild>
              <Link to={`/chat/threads/${activeThreadId}`}>
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                {t("chat.openFull")}
              </Link>
            </Button>
          ) : null}
        </div>
        <IconButton
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "h-11 w-11 sm:h-8 sm:w-8 rounded-full",
            "touch-manipulation -webkit-tap-highlight-color-transparent",
            "active:scale-95 active:bg-muted/60"
          )}
          label={t("chat.close")}
          shortcut="Esc"
          onClick={() => setOpen(false)}
        >
          <X className="h-5 w-5 sm:h-4 sm:w-4" />
        </IconButton>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {activeThreadId ? (
          <ChatThreadPage embedded threadId={activeThreadId} blockContext={activeContext} />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
            {t("chat.emptyDock")}
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="p-0 w-[92vw] sm:w-[420px]" onWheelCapture={handleWheelCapture}>
          <SheetHeader className="sr-only">
            <SheetTitle>{t("chat.title")}</SheetTitle>
          </SheetHeader>
          <div ref={panelRef} className="h-full" style={chatVars}>
            {Content}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {open ? (
        <m.div
          key="chat-dock"
          initial="initial"
          animate="animate"
          exit="exit"
          variants={nbPanelRight}
          transition={nbTransitions.panel}
          style={{ width, ...chatVars }}
          className="sticky top-0 h-svh shrink-0 border-l border-border bg-background/95 backdrop-blur flex flex-col relative"
          ref={panelRef}
          onWheelCapture={handleWheelCapture}
        >
          <div
            onMouseDown={handleMouseDown}
            className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize nb-motion-fast motion-reduce:transition-none hover:bg-muted/60"
          >
            <div className="absolute left-0 top-0 bottom-0 w-4 -translate-x-1/2" />
          </div>
          {Content}
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
