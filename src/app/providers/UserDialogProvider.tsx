import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { UserNameDialog } from "@/features/user/components/UserNameDialog";
import { SettingsDialog, type SettingsTab } from "@/features/user/components/SettingsDialog";
import { LogoutDialog } from "@/features/auth/components/LogoutDialog";
import { useSidebar } from "@/shared/ui/sidebar";

type UserDialogKind = "profile" | "settings" | "logout";

interface UserDialogsContextValue {
  openProfile: () => void;
  openSettings: (tab?: SettingsTab) => void;
  openLogout: () => void;
}

const UserDialogsContext = createContext<UserDialogsContextValue | null>(null);

export function useUserDialogs() {
  const ctx = useContext(UserDialogsContext);
  if (!ctx) throw new Error("useUserDialogs must be used within UserDialogsProvider");
  return ctx;
}

/**
 * Any avatar dropdown(s) should close immediately when we start opening one of these dialogs.
 * (Works even if there are multiple <UserAvatar/> instances.)
 */
export const USER_DIALOG_OPEN_EVENT = "nb:user-dialog-open";

// We can open dialogs immediately; the sheet is layered beneath dialogs (z-index).
const OPEN_DIALOG_AFTER_SIDEBAR_CLOSE_MS = 0;
const REOPEN_SIDEBAR_AFTER_DIALOG_CLOSE_MS = 260;

// Avoid flicker by closing the sheet before paint when needed.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

interface UserDialogsProviderProps {
  children: React.ReactNode;
}

export function UserDialogsProvider({ children }: UserDialogsProviderProps) {
  const { isMobile, openMobile, setOpenMobile } = useSidebar();

  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [logoutOpen, setLogoutOpen] = useState(false);

  const anyOpen = profileOpen || settingsOpen || logoutOpen;

  // pending = we're waiting for the mobile sheet to fully close before opening a dialog.
  const [pending, setPending] = useState(false);

  // If we ever had to force-close the sheet because of dialogs,
  // we restore after the last dialog closes.
  const shouldReopenSidebarRef = useRef(false);

  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reopenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const clearReopenTimer = useCallback(() => {
    if (reopenTimerRef.current) {
      clearTimeout(reopenTimerRef.current);
      reopenTimerRef.current = null;
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    clearOpenTimer();
    clearReopenTimer();
  }, [clearOpenTimer, clearReopenTimer]);

  // cleanup on unmount
  useEffect(() => clearAllTimers, [clearAllTimers]);

  const setOnly = useCallback((which: UserDialogKind | null) => {
    setProfileOpen(which === "profile");
    setSettingsOpen(which === "settings");
    setLogoutOpen(which === "logout");
  }, []);

  const dispatchCloseAvatarMenus = useCallback((which: UserDialogKind) => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent(USER_DIALOG_OPEN_EVENT, { detail: { which } })
    );
  }, []);

  const openDialog = useCallback(
    (which: UserDialogKind) => {
      // Always close any avatar dropdown(s) immediately.
      dispatchCloseAvatarMenus(which);

      // If we’re opening another dialog, never let a pending sidebar reopen fire.
      clearReopenTimer();

      // If we already had a pending dialog open, replace it (no stale opens).
      clearOpenTimer();

      /**
       * Mobile rule:
       * - If the sheet is open OR we are already in the "pending open" phase,
       *   keep the sheet closed and wait for the close animation to finish.
       */
      const mustWaitForSheet = isMobile && (openMobile || pending);

      if (mustWaitForSheet) {
        shouldReopenSidebarRef.current = true;

        // Ensure the sheet is closed (idempotent), WITHOUT changing persisted mode.
        if (openMobile) setOpenMobile(false, { source: "dialog" });

        setPending(true);

        openTimerRef.current = setTimeout(() => {
          openTimerRef.current = null;
          setPending(false);
          setOnly(which);
        }, OPEN_DIALOG_AFTER_SIDEBAR_CLOSE_MS);

        return;
      }

      // Desktop OR mobile-with-sheet-already-closed: open immediately.
      setPending(false);
      setOnly(which);
    },
    [
      dispatchCloseAvatarMenus,
      clearReopenTimer,
      clearOpenTimer,
      isMobile,
      openMobile,
      pending,
      setOpenMobile,
      setOnly,
    ]
  );

  /**
   * HARD INVARIANT:
   * If a dialog is open OR pending-open, the mobile sheet must not be open.
   * Use layout effect to prevent a single-frame flicker.
   *
   * IMPORTANT: close via {source:"dialog"} so we don't mutate persisted sidebar mode.
   */
  useIsomorphicLayoutEffect(() => {
    if (!isMobile) return;
    if (!openMobile) return;
    if (!(anyOpen || pending)) return;

    shouldReopenSidebarRef.current = true;
    setOpenMobile(false, { source: "dialog" });
  }, [isMobile, openMobile, anyOpen, pending, setOpenMobile]);

  /**
   * Restore sidebar after the *last* dialog closes (and no pending open).
   * Works regardless of breakpoint changes.
   *
   * IMPORTANT: reopen via {source:"dialog"} so we only unsuspend the sheet (mode stays whatever it was).
   */
  useEffect(() => {
    if (anyOpen || pending) return;
    if (!shouldReopenSidebarRef.current) return;

    shouldReopenSidebarRef.current = false;
    clearReopenTimer();

    const delay = isMobile ? REOPEN_SIDEBAR_AFTER_DIALOG_CLOSE_MS : 0;

    if (delay <= 0) {
      setOpenMobile(true, { source: "dialog" });
      return;
    }

    reopenTimerRef.current = setTimeout(() => {
      reopenTimerRef.current = null;
      setOpenMobile(true, { source: "dialog" });
    }, delay);
  }, [anyOpen, pending, isMobile, setOpenMobile, clearReopenTimer]);

  /**
   * Safety valve:
   * Radix dismissable-layer can (rarely) leave body pointer-events locked after
   * breakpoint changes while modals are open. If nothing is open, unlock.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;

    // If anything is open/pending, don't touch.
    if (anyOpen || pending) return;

    // If mobile sheet is open, don't touch (Radix is active).
    if (isMobile && openMobile) return;

    const t = setTimeout(() => {
      if (document.body?.style?.pointerEvents === "none") {
        document.body.style.pointerEvents = "";
      }
    }, 0);

    return () => clearTimeout(t);
  }, [anyOpen, pending, isMobile, openMobile]);

  const value = useMemo(
    () => ({
      openProfile: () => openDialog("profile"),
      openSettings: (tab?: SettingsTab) => {
        setSettingsTab(tab ?? "general");
        openDialog("settings");
      },
      openLogout: () => openDialog("logout"),
    }),
    [openDialog]
  );

  return (
    <UserDialogsContext.Provider value={value}>
      {children}

      <UserNameDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} initialTab={settingsTab} />
      <LogoutDialog open={logoutOpen} onOpenChange={setLogoutOpen} />
    </UserDialogsContext.Provider>
  );
}






