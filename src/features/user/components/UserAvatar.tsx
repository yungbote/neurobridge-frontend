import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Ampersand, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/app/providers/AuthProvider";
import { useI18n } from "@/app/providers/I18nProvider";
import { useUser } from "@/app/providers/UserProvider";
import { useUserDialogs, USER_DIALOG_OPEN_EVENT } from "@/app/providers/UserDialogProvider";
import { ColorPicker, AVATAR_COLORS } from "@/features/user/components/ColorPicker";
import { cn } from "@/shared/lib/utils";
import type { UserProfile } from "@/shared/types/models";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip";
import { Skeleton } from "@/shared/ui/skeleton";

function formatDisplayName(user: UserProfile | null | undefined, fallbackName = "User") {
  if (!user) return fallbackName;
  const first = String(user.firstName || "").trim();
  const last = String(user.lastName || "").trim();
  const cap = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : "");
  const full = [cap(first), cap(last)].filter(Boolean).join(" ").trim();
  return full || fallbackName;
}

function formatFirstName(user: UserProfile | null | undefined, fallbackName = "User") {
  if (!user) return fallbackName;
  const first = String(user.firstName || "").trim();
  if (!first) return fallbackName;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

type MenuSide = React.ComponentPropsWithoutRef<typeof DropdownMenuContent>["side"];
type MenuAlign = React.ComponentPropsWithoutRef<typeof DropdownMenuContent>["align"];

interface UserAvatarProps {
  showMenu?: boolean;
  showColorPicker?: boolean;
  showName?: boolean;
  menuSide?: MenuSide;
  menuAlign?: MenuAlign;
  menuSideOffset?: number;
  menuAlignOffset?: number;
  triggerClassName?: string;
  nameClassName?: string;
  menuClassName?: string;
}

export function UserAvatar({
  showMenu = true,
  showColorPicker = false,
  showName = false,

  menuSide = "bottom",
  menuAlign = "end",
  menuSideOffset = 8,
  menuAlignOffset = -14,

  triggerClassName,
  nameClassName,
  menuClassName,
}: UserAvatarProps) {
  const { isAuthenticated } = useAuth();
  const { t } = useI18n();
  const { user, loading: userLoading, changeAvatarColor } = useUser();
  const { openProfile, openSettings, openLogout } = useUserDialogs();

  const [menuOpen, setMenuOpen] = useState(false);

  // Close this dropdown if ANY user dialog is opened (even from another avatar instance)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = () => setMenuOpen(false);
    window.addEventListener(USER_DIALOG_OPEN_EVENT, handler);
    return () => window.removeEventListener(USER_DIALOG_OPEN_EVENT, handler);
  }, []);

  const [localColor, setLocalColor] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    setLocalColor(user.avatarColor ?? AVATAR_COLORS[0]);
  }, [user?.avatarColor, user?.id]);

  const initials = useMemo(() => {
    if (!user) return "NB";
    return (
      (user.firstName?.[0] ?? "U") +
      (user.lastName?.[0] ?? "")
    ).toUpperCase();
  }, [user]);

  const fallbackName = t("user.fallbackName");
  const displayName = useMemo(() => formatDisplayName(user, fallbackName), [fallbackName, user]);
  const firstNameLabel = useMemo(() => formatFirstName(user, fallbackName), [fallbackName, user]);
  const showTooltip = !showName && Boolean(firstNameLabel);

  const onPickColor = useCallback(
    (color: string) => {
      setLocalColor(color);

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        try {
          await changeAvatarColor(color);
        } catch (e) {
          console.error("[UserAvatar] changeAvatarColor failed:", e);
          setLocalColor(user?.avatarColor ?? AVATAR_COLORS[0]);
        }
      }, 250);
    },
    [changeAvatarColor, user]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (!isAuthenticated) return null;
  if (userLoading) {
    const defaultTriggerClasses = showName ? "h-10 w-full justify-start px-2" : "h-10 w-10 p-0";
    return (
      <div className={cn("inline-flex items-center", defaultTriggerClasses, triggerClassName)}>
        <div className={cn("flex items-center", showName ? "gap-2" : "justify-center")}>
          <UserAvatarSkeleton showName={showName} />
        </div>
      </div>
    );
  }
  if (!user) return null;

  const safeAvatarUrl = user.avatarUrl || "/placeholder.svg";

  const AvatarNode = (
    <div className="relative h-8 w-8">
      <Avatar className="h-8 w-8">
        <AvatarImage key={safeAvatarUrl} src={safeAvatarUrl} alt={displayName} />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>

      {showColorPicker && (
        <ColorPicker
          value={localColor ?? (user.avatarColor ?? AVATAR_COLORS[0])}
          onChange={onPickColor}
          position="top-right"
          radius={34}
          swatchSize={16}
        />
      )}
    </div>
  );

  if (!showMenu) {
    if (!showTooltip) return AvatarNode;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{AvatarNode}</TooltipTrigger>
        <TooltipContent side="top" align="center" shortcut="U">
          {firstNameLabel}
        </TooltipContent>
      </Tooltip>
    );
  }

  const defaultTriggerClasses = showName
    ? "h-10 w-full justify-start px-2"
    : "h-10 w-10 p-0";

  const triggerButton = (
    <Button
      variant="ghost"
      className={cn(defaultTriggerClasses, triggerClassName)}
    >
      <div
        className={cn(
          "flex items-center",
          showName ? "gap-2" : "justify-center"
        )}
      >
        {AvatarNode}

        {showName && (
          <div className="min-w-0 leading-tight">
            <div className={cn("truncate text-sm font-medium", nameClassName)}>
              {displayName}
            </div>
          </div>
        )}
      </div>
    </Button>
  );

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      {showTooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              {triggerButton}
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" align="center" shortcut="U">
            {firstNameLabel}
          </TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger asChild>
          {triggerButton}
        </DropdownMenuTrigger>
      )}

      <DropdownMenuContent
        className={cn(
          "w-64 rounded-2xl border border-border/60 bg-popover/90 p-2 text-sm shadow-xl backdrop-blur-md",
          menuClassName
        )}
        side={menuSide}
        align={menuAlign}
        sideOffset={menuSideOffset}
        alignOffset={menuAlignOffset}
      >
        <DropdownMenuItem
          className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 focus:bg-muted/70"
          onSelect={(e) => {
            e.preventDefault();
            setMenuOpen(false);
            openProfile();
          }}
        >
          <Avatar className="h-9 w-9">
            <AvatarImage key={safeAvatarUrl} src={safeAvatarUrl} alt={displayName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
            <div className="text-xs text-muted-foreground">{t("user.viewProfile")}</div>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-2" />

        <DropdownMenuGroup>
          <DropdownMenuItem
            className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 focus:bg-muted/70"
            onSelect={(e) => {
              e.preventDefault();
              setMenuOpen(false);
              openSettings("personalization");
            }}
          >
            <Ampersand className="size-4 text-muted-foreground group-hover:text-foreground" />
            <span className="text-sm font-medium">{t("settings.personalization")}</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 focus:bg-muted/70"
            onSelect={(e) => {
              e.preventDefault();
              setMenuOpen(false);
              openSettings();
            }}
          >
            <Settings className="size-4 text-muted-foreground group-hover:text-foreground" />
            <span className="text-sm font-medium">{t("settings.title")}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="my-2" />

        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            className="group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2"
            onSelect={(e) => {
              e.preventDefault();
              setMenuOpen(false);
              openLogout();
            }}
          >
            <LogOut className="size-4" />
            <span className="text-sm font-medium">{t("user.logout")}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserAvatarSkeleton({
  showName = false,
  className,
}: {
  showName?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)} aria-hidden="true">
      <Skeleton className="h-8 w-8 rounded-full" />
      {showName ? <Skeleton className="h-4 w-28 rounded-full" /> : null}
    </div>
  );
}
