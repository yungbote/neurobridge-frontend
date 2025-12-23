import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Ampersand, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { useUser } from "@/providers/UserProvider";
import { useUserDialogs, USER_DIALOG_OPEN_EVENT } from "@/providers/UserDialogProvider";
import { ColorPicker, AVATAR_COLORS } from "@/components/app/ColorPicker";
import { cn } from "@/lib/utils";

function formatFullName(user) {
  if (!user) return "";
  const first = String(user.firstName || "").trim();
  const last = String(user.lastName || "").trim();
  const full = [first, last].filter(Boolean).join(" ").trim();
  return full || String(user.email || "").trim() || "User";
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
  emailClassName,
  menuClassName,
}) {
  const { isAuthenticated } = useAuth();
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

  const [localColor, setLocalColor] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    setLocalColor(user.avatarColor ?? AVATAR_COLORS[0]);
  }, [user?.avatarColor, user?.id]);

  const initials = useMemo(() => {
    if (!user) return "NB";
    return (
      (user.firstName?.[0] ?? user.email?.[0] ?? "?") +
      (user.lastName?.[0] ?? "")
    ).toUpperCase();
  }, [user]);

  const fullName = useMemo(() => formatFullName(user), [user]);
  const email = useMemo(() => String(user?.email || "").trim(), [user?.email]);

  const onPickColor = useCallback(
    (color) => {
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

  if (!isAuthenticated || userLoading || !user) return null;

  const safeAvatarUrl = user.avatarUrl || "/placeholder.svg";

  const AvatarNode = (
    <div className="relative h-8 w-8">
      <Avatar className="h-8 w-8">
        <AvatarImage key={safeAvatarUrl} src={safeAvatarUrl} alt={fullName} />
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

  if (!showMenu) return AvatarNode;

  const defaultTriggerClasses = showName
    ? "h-10 w-full justify-start px-2"
    : "h-10 w-10 p-0";

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
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
                  {fullName}
                </div>
                {email && (
                  <div
                    className={cn(
                      "truncate text-xs text-muted-foreground",
                      emailClassName
                    )}
                  >
                    {email}
                  </div>
                )}
              </div>
            )}
          </div>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className={cn("w-60 rounded-2xl py-3 text-base", menuClassName)}
        side={menuSide}
        align={menuAlign}
        sideOffset={menuSideOffset}
        alignOffset={menuAlignOffset}
      >
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={(e) => {
            e.preventDefault();
            setMenuOpen(false);
            openProfile();
          }}
        >
          <div className="flex w-full items-center gap-2 rounded-2xl px-2 py-1.5 hover:bg-muted">
            <Avatar className="h-6 w-6">
              <AvatarImage key={safeAvatarUrl} src={safeAvatarUrl} alt={fullName} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-base font-medium">{fullName}</div>
              {email && (
                <div className="truncate text-xs text-muted-foreground">{email}</div>
              )}
            </div>
          </div>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <button className="flex w-full items-center gap-2 cursor-pointer px-2 py-1.5 rounded-2xl hover:bg-muted">
              <Ampersand className="size-5 text-foreground" />
              <span className="text-base font-medium">Personalization</span>
            </button>
          </DropdownMenuItem>

          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={(e) => {
              e.preventDefault();
              setMenuOpen(false);
              openSettings();
            }}
          >
            <div className="flex w-full items-center gap-2 rounded-2xl px-2 py-1.5 hover:bg-muted">
              <Settings className="size-5 text-foreground" />
              <span className="text-base font-medium">Settings</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem
            className="cursor-pointer"
            onSelect={(e) => {
              e.preventDefault();
              setMenuOpen(false);
              openLogout();
            }}
          >
            <div className="flex w-full items-center gap-2 rounded-2xl px-2 py-1.5 hover:bg-muted">
              <LogOut className="size-5 text-foreground" />
              <span className="text-base font-medium">Log out</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}










