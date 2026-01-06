import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeftIcon } from "lucide-react";

import { useIsMobile } from "@/app/providers/ViewportProvider";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Separator } from "@/shared/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/ui/tooltip";
import { m } from "framer-motion";
import { nbTransitions } from "@/shared/motion/presets";

const SIDEBAR_WIDTH = "17rem";
const SIDEBAR_WIDTH_MOBILE = "17rem";
const SIDEBAR_WIDTH_ICON = "3.5rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarState = "expanded" | "collapsed";
type SidebarVariant = "sidebar" | "floating" | "inset";
type SidebarSide = "left" | "right";
type SidebarCollapsible = "offcanvas" | "icon" | "none";
type SidebarOpenSource = "user" | "dialog";
type CSSVars = React.CSSProperties & Record<`--${string}`, string | number>;

interface SidebarContextValue {
  state: SidebarState;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isMobile: boolean;
  openMobile: boolean;
  setOpenMobile: (
    next: boolean | ((prev: boolean) => boolean),
    opts?: { source?: SidebarOpenSource }
  ) => void;
  toggleSidebar: () => void;
  suppressMobileAnim: boolean;
  suppressNextMobileAnim: () => void;
}

// localStorage persistence (expanded vs icon)
const SIDEBAR_STORAGE_KEY = "sidebar_mode"; // "expanded" | "collapsed"

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}

function readStoredMode(): SidebarState | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return v === "expanded" || v === "collapsed" ? v : null;
  } catch {
    return null;
  }
}

function writeStoredMode(mode: SidebarState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

interface SidebarProviderProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: SidebarProviderProps) {
  const isMobile = useIsMobile();

  // Read persisted mode once
  const initialMode = React.useMemo(() => readStoredMode(), []);

  // Single persisted "mode" preference (expanded vs collapsed)
  const [_open, _setOpen] = React.useState(() => {
    if (initialMode === "expanded") return true;
    if (initialMode === "collapsed") return false;
    return !!defaultOpen;
  });

  const open = openProp ?? _open;

  // ✅ Atomic ref so functional updates never use stale `open`
  const openRef = React.useRef(open);
  useIsomorphicLayoutEffect(() => {
    openRef.current = open;
  }, [open]);

  const setOpen = React.useCallback(
    (value: React.SetStateAction<boolean>) => {
      const prev = openRef.current;
      const next = typeof value === "function" ? !!value(prev) : !!value;

      // update ref first so rapid calls are correct
      openRef.current = next;

      if (setOpenProp) setOpenProp(next);
      else _setOpen(next);

      writeStoredMode(next ? "expanded" : "collapsed");
    },
    [setOpenProp]
  );

  // Keep storage consistent even if controlled from above
  React.useEffect(() => {
    writeStoredMode(open ? "expanded" : "collapsed");
  }, [open]);

  /**
   * ✅ Mobile-only *temporary* suppression:
   * Used by dialogs to close the sheet without changing the persisted `open` mode.
   * This is the key to making dialogs + breakpoints bug-free.
   */
  const [mobileSuspended, _setMobileSuspended] = React.useState(false);
  const mobileSuspendedRef = React.useRef(mobileSuspended);
  useIsomorphicLayoutEffect(() => {
    mobileSuspendedRef.current = mobileSuspended;
  }, [mobileSuspended]);

  /**
   * openMobile = actual visible sheet state
   * - derives from persisted `open`
   * - but can be temporarily suppressed while a user dialog is open/pending
   */
  const openMobile = isMobile ? !!open && !mobileSuspended : false;

  // Ref for atomic toggles on mobile (since openMobile is derived)
  const openMobileRef = React.useRef(openMobile);
  useIsomorphicLayoutEffect(() => {
    openMobileRef.current = openMobile;
  }, [openMobile]);

  /**
   * We ONLY want slide animation when the user explicitly opens on mobile.
   * If the sheet is "supposed to already be open" (refresh on mobile, or breakpoint switch),
   * we keep animations OFF for the entire time it remains open.
   */
  const [suppressMobileAnim, setSuppressMobileAnim] = React.useState(() => {
    return initialMode === "expanded"; // restoring open => treat as already-open
  });

  const suppressNextMobileAnim = React.useCallback(() => {
    setSuppressMobileAnim(true);
  }, []);

  // Detect breakpoint transitions to suppress animation when entering mobile while open=true
  const prevIsMobileRef = React.useRef(isMobile);
  useIsomorphicLayoutEffect(() => {
    const wasMobile = prevIsMobileRef.current;
    if (wasMobile === isMobile) return;

    // Entering mobile: if sidebar mode is expanded and not suspended, sheet should appear already open (no anim)
    if (!wasMobile && isMobile && openRef.current && !mobileSuspendedRef.current) {
      suppressNextMobileAnim();
    }

    prevIsMobileRef.current = isMobile;
  }, [isMobile, suppressNextMobileAnim]);

  // When the mobile sheet is CLOSED (for real), re-enable animations for the next user-open
  React.useEffect(() => {
    if (!isMobile) return;
    if (openMobile) return;
    if (suppressMobileAnim) setSuppressMobileAnim(false);
  }, [isMobile, openMobile, suppressMobileAnim]);

  /**
   * setOpenMobile supports:
   * - normal user-driven open/close (Sheet onOpenChange, triggers) => updates persisted mode
   * - dialog-driven temporary close/reopen => DOES NOT update persisted mode
   *
   * opts.source:
   *  - "user" (default): actually changes mode (persisted)
   *  - "dialog": temporarily suspends/unsuspends the mobile sheet only
   */
  const setOpenMobile = React.useCallback(
    (next: boolean | ((prev: boolean) => boolean), opts?: { source?: SidebarOpenSource }) => {
      const source = opts?.source ?? "user";

      // Compute previous *actual* mobile open
      const prevActual = openRef.current && !mobileSuspendedRef.current;

      const resolved =
        typeof next === "function" ? !!next(prevActual) : !!next;

      if (source === "dialog") {
        // dialog wants to close the sheet temporarily without changing mode
        if (!resolved) {
          // suspend (close)
          _setMobileSuspended(true);
          // ensure next reopen can animate if desired
          setSuppressMobileAnim(false);
        } else {
          // unsuspend (reopen if mode is expanded)
          _setMobileSuspended(false);
        }
        return;
      }

      // user-driven: unsuspend and set persisted mode
      if (resolved) setSuppressMobileAnim(false); // user open should slide
      _setMobileSuspended(false);
      setOpen(resolved);
    },
    [setOpen]
  );

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) {
      // Toggle based on actual visibility (handles suspended state correctly)
      setOpenMobile((v) => !v, { source: "user" });
      return;
    }
    setOpen((v) => !v);
  }, [isMobile, setOpenMobile, setOpen]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const state: SidebarState = (isMobile ? openMobile : open) ? "expanded" : "collapsed";

  const contextValue = React.useMemo(
    () => ({
      state,
      open, // persisted mode
      setOpen,
      isMobile,
      openMobile, // actual visible mobile sheet state
      setOpenMobile,
      toggleSidebar,
      suppressMobileAnim,
      suppressNextMobileAnim,
    }),
    [
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
      suppressMobileAnim,
      suppressNextMobileAnim,
    ]
  );

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="sidebar-wrapper"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style,
            } as CSSVars
          }
          className={cn(
            "group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: SidebarSide;
  variant?: SidebarVariant;
  collapsible?: SidebarCollapsible;
}

function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  ...props
}: SidebarProps) {
  const { isMobile, state, openMobile, setOpenMobile, suppressMobileAnim } =
    useSidebar();

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "bg-sidebar/95 text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col border-r border-sidebar-border/60 backdrop-blur-sm",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }

  /**
   * ✅ CRITICAL FIX:
   * Keep the Sheet ROOT mounted always (even on desktop).
   * We simply force it closed when not mobile.
   *
   * This prevents Radix dismissable-layer pointer-events from getting stuck
   * during breakpoint changes while other dialogs are open.
   */
  const sheetOpen = isMobile ? openMobile : false;
  const isExpanded = state === "expanded";
  const isOffcanvas = collapsible === "offcanvas";
  const iconShellWidth =
    variant === "floating" || variant === "inset"
      ? "4.5rem" // 3.5rem icon + 1rem padding (p-2 both sides)
      : SIDEBAR_WIDTH_ICON;
  const gapWidth = isExpanded ? SIDEBAR_WIDTH : isOffcanvas ? "0rem" : iconShellWidth;
  const containerWidth = isOffcanvas ? SIDEBAR_WIDTH : isExpanded ? SIDEBAR_WIDTH : iconShellWidth;
  const containerX = !isExpanded && isOffcanvas ? (side === "left" ? "-100%" : "100%") : "0%";
  const shellTransition = isExpanded ? nbTransitions.panel : nbTransitions.default;

  return (
    <>
      <Sheet
        open={sheetOpen}
        onOpenChange={(o) => setOpenMobile(o, { source: "user" })}
      >
        <SheetContent
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          animation={suppressMobileAnim ? "none" : "slide"}
          className="bg-sidebar/95 text-sidebar-foreground w-(--sidebar-width) border border-sidebar-border/60 p-0 shadow-xl backdrop-blur-sm [&>button]:hidden"
          style={{ "--sidebar-width": SIDEBAR_WIDTH_MOBILE } as CSSVars}
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>

          {/* Render children ONLY on mobile so we don't double-mount */}
          {isMobile ? <div className="flex h-full w-full flex-col">{children}</div> : null}
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar (only render when not mobile to avoid double-mount) */}
      {!isMobile && (
        <div
          className={cn("group peer text-sidebar-foreground hidden md:block", className)}
          data-state={state}
          data-collapsible={state === "collapsed" ? collapsible : ""}
          data-variant={variant}
          data-side={side}
          data-slot="sidebar"
          {...props}
        >
          <m.div
            data-slot="sidebar-gap"
            initial={false}
            animate={{ width: gapWidth }}
            transition={shellTransition}
            className={cn(
              "relative bg-transparent nb-will-change-width",
              "group-data-[side=right]:rotate-180"
            )}
          />

          <m.div
            data-slot="sidebar-container"
            initial={false}
            animate={{ width: containerWidth, x: containerX }}
            transition={shellTransition}
            className={cn(
              "fixed inset-y-0 z-10 hidden h-svh nb-will-change-sidebar md:flex",
              side === "left" ? "left-0" : "right-0",
              variant === "floating" || variant === "inset"
                ? "p-2"
                : "group-data-[side=left]:border-r group-data-[side=right]:border-l"
            )}
          >
            <div
              data-sidebar="sidebar"
              data-slot="sidebar-inner"
              className="bg-sidebar/95 flex h-full w-full flex-col backdrop-blur-sm group-data-[variant=floating]:rounded-2xl group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border/60 group-data-[variant=floating]:shadow-md group-data-[variant=inset]:rounded-2xl group-data-[variant=inset]:border group-data-[variant=inset]:border-sidebar-border/60 group-data-[variant=inset]:shadow-sm"
            >
              {children}
            </div>
          </m.div>
        </div>
      )}
    </>
  );
}

type SidebarTriggerProps = React.ComponentPropsWithoutRef<typeof Button>;

function SidebarTrigger({ className, onClick, ...props }: SidebarTriggerProps) {
  const { toggleSidebar, state, isMobile } = useSidebar();
  const cursor = !isMobile && state === "collapsed" ? "e-resize" : !isMobile ? "w-resize" : undefined;

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      className={cn("size-9 rounded-xl", className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar(); // ✅ no stale openMobile reads ever
      }}
      style={cursor ? { cursor } : undefined}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  );
}

type SidebarRailProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

function SidebarRail({ className, ...props }: SidebarRailProps) {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-[background-color,transform] nb-duration-panel nb-ease-out group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      )}
      {...props}
    />
  );
}

type SidebarInsetProps = React.ComponentPropsWithoutRef<"main">;

function SidebarInset({ className, ...props }: SidebarInsetProps) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "bg-background relative flex w-full flex-1 flex-col",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      {...props}
    />
  );
}

type SidebarInputProps = React.ComponentPropsWithoutRef<typeof Input>;

function SidebarInput({ className, ...props }: SidebarInputProps) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn("bg-background h-9 w-full rounded-lg shadow-none", className)}
      {...props}
    />
  );
}

type SidebarHeaderProps = React.ComponentPropsWithoutRef<"div">;

function SidebarHeader({ className, ...props }: SidebarHeaderProps) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col gap-3 px-3 py-3", className)}
      {...props}
    />
  );
}

type SidebarFooterProps = React.ComponentPropsWithoutRef<"div">;

function SidebarFooter({ className, ...props }: SidebarFooterProps) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col gap-3 px-3 py-3", className)}
      {...props}
    />
  );
}

type SidebarSeparatorProps = React.ComponentPropsWithoutRef<typeof Separator>;

function SidebarSeparator({ className, ...props }: SidebarSeparatorProps) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("bg-sidebar-border/70 mx-3 w-auto", className)}
      {...props}
    />
  );
}

type SidebarContentProps = React.ComponentPropsWithoutRef<"div">;

function SidebarContent({ className, ...props }: SidebarContentProps) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-3 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  );
}

type SidebarGroupProps = React.ComponentPropsWithoutRef<"div">;

function SidebarGroup({ className, ...props }: SidebarGroupProps) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col px-2 pb-2 pt-1", className)}
      {...props}
    />
  );
}

type SidebarGroupLabelProps = React.ComponentPropsWithoutRef<"div"> & {
  asChild?: boolean;
};

function SidebarGroupLabel({ className, asChild = false, ...props }: SidebarGroupLabelProps) {
  const Comp = asChild ? Slot : "div";

  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        "text-sidebar-foreground/60 ring-sidebar-ring flex h-7 shrink-0 items-center rounded-md px-3 text-[11px] font-medium uppercase tracking-wider outline-hidden transition-[margin,opacity] nb-duration nb-ease-out focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className
      )}
      {...props}
    />
  );
}

type SidebarGroupActionProps = React.ComponentPropsWithoutRef<"button"> & {
  asChild?: boolean;
};

function SidebarGroupAction({ className, asChild = false, ...props }: SidebarGroupActionProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      className={cn(
        "text-sidebar-foreground/80 ring-sidebar-ring hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground absolute top-3 right-3 flex aspect-square w-6 items-center justify-center rounded-lg p-0 outline-hidden transition-colors transition-transform nb-duration-micro nb-ease-out motion-reduce:transition-none focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "after:absolute after:-inset-2 md:after:hidden",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  );
}

type SidebarGroupContentProps = React.ComponentPropsWithoutRef<"div">;

function SidebarGroupContent({ className, ...props }: SidebarGroupContentProps) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  );
}

type SidebarMenuProps = React.ComponentPropsWithoutRef<"ul">;

function SidebarMenu({ className, ...props }: SidebarMenuProps) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-2", className)}
      {...props}
    />
  );
}

type SidebarMenuItemProps = React.ComponentPropsWithoutRef<"li">;

function SidebarMenuItem({ className, ...props }: SidebarMenuItemProps) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative", className)}
      {...props}
    />
  );
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center justify-start gap-2.5 overflow-hidden rounded-xl px-3 py-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] transition-colors nb-duration-micro nb-ease-out motion-reduce:transition-none hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-9 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:p-2! group-data-[collapsible=icon]:[&>span:last-child]:hidden [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
        outline:
          "bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]",
      },
      size: {
        default: "h-9 text-sm",
        sm: "h-8 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

type SidebarMenuButtonProps = React.ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof sidebarMenuButtonVariants> & {
    asChild?: boolean;
    isActive?: boolean;
    tooltip?: string | React.ComponentPropsWithoutRef<typeof TooltipContent>;
    tooltipShortcut?: string;
  };

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  tooltipShortcut,
  className,
  ...props
}: SidebarMenuButtonProps) {
  const Comp = asChild ? Slot : "button";
  const { isMobile, state } = useSidebar();

  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  );

  if (!tooltip) return button;

  const tooltipProps =
    typeof tooltip === "string"
      ? { children: tooltip, shortcut: tooltipShortcut }
      : { ...tooltip, shortcut: tooltipShortcut ?? tooltip.shortcut };

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...tooltipProps}
      />
    </Tooltip>
  );
}

type SidebarMenuActionProps = React.ComponentPropsWithoutRef<"button"> & {
  asChild?: boolean;
  showOnHover?: boolean;
};

function SidebarMenuAction({
  className,
  asChild = false,
  showOnHover = false,
  ...props
}: SidebarMenuActionProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      className={cn(
        "text-sidebar-foreground/80 ring-sidebar-ring hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground peer-hover/menu-button:text-sidebar-accent-foreground absolute top-1.5 right-1 flex aspect-square w-6 items-center justify-center rounded-lg p-0 outline-hidden transition-colors transition-transform nb-duration-micro nb-ease-out motion-reduce:transition-none focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "after:absolute after:-inset-2 md:after:hidden",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        showOnHover &&
          "peer-data-[active=true]/menu-button:text-sidebar-accent-foreground group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0",
        className
      )}
      {...props}
    />
  );
}

type SidebarMenuBadgeProps = React.ComponentPropsWithoutRef<"div">;

function SidebarMenuBadge({ className, ...props }: SidebarMenuBadgeProps) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "text-sidebar-foreground pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-lg px-1 text-xs font-medium tabular-nums select-none",
        "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  );
}

type SidebarMenuSkeletonProps = React.ComponentPropsWithoutRef<"div"> & {
  showIcon?: boolean;
};

function SidebarMenuSkeleton({ className, showIcon = false, ...props }: SidebarMenuSkeletonProps) {
  const id = React.useId();
  const width = React.useMemo(() => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash * 31 + id.charCodeAt(i)) | 0;
    }
    const pct = 50 + (Math.abs(hash) % 41);
    return `${pct}%`;
  }, [id]);

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn("flex h-9 items-center gap-2 rounded-xl px-3", className)}
      {...props}
    >
      {showIcon && (
        <Skeleton className="size-4 rounded-md" data-sidebar="menu-skeleton-icon" />
      )}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={{ "--skeleton-width": width } as CSSVars}
      />
    </div>
  );
}

type SidebarMenuSubProps = React.ComponentPropsWithoutRef<"ul">;

function SidebarMenuSub({ className, ...props }: SidebarMenuSubProps) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        "border-sidebar-border/60 mx-3.5 flex min-w-0 flex-col gap-1 border-l px-3 py-1",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  );
}

type SidebarMenuSubItemProps = React.ComponentPropsWithoutRef<"li">;

function SidebarMenuSubItem({ className, ...props }: SidebarMenuSubItemProps) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn("group/menu-sub-item relative", className)}
      {...props}
    />
  );
}

type SidebarMenuSubButtonProps = React.ComponentPropsWithoutRef<"a"> & {
  asChild?: boolean;
  size?: "sm" | "md";
  isActive?: boolean;
};

function SidebarMenuSubButton({
  asChild = false,
  size = "md",
  isActive = false,
  className,
  ...props
}: SidebarMenuSubButtonProps) {
  const Comp = asChild ? Slot : "a";

  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground [&>svg]:text-sidebar-accent-foreground flex min-w-0 items-center justify-start gap-2.5 overflow-hidden rounded-xl px-3 outline-hidden transition-colors nb-duration-micro nb-ease-out motion-reduce:transition-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
        "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
        size === "sm" && "h-8 text-xs",
        size === "md" && "h-9 text-sm",
        "group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
};
