import React, { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserNameDialog } from "@/components/app/UserNameDialog"
import { SettingsDialog } from "@/components/app/SettingsDialog"
import { LogoutDialog } from "@/components/app/LogoutDialog"
import { Ampersand, Settings, LogOut } from "lucide-react"
import { useAuth } from "@/providers/AuthProvider"
import { useUser } from "@/providers/UserProvider"

import { ColorPicker, AVATAR_COLORS } from "@/components/app/ColorPicker"

export function UserAvatar({
  showMenu = true,
  showColorPicker = false,
}) {
  const { isAuthenticated } = useAuth()
  const { user, loading: userLoading, changeAvatarColor } = useUser()

  const [profileOpen, setProfileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)

  const [localColor, setLocalColor] = useState(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!user) return
    setLocalColor(user.avatarColor ?? AVATAR_COLORS[0])
  }, [user?.avatarColor, user?.id])

  const initials = useMemo(() => {
    if (!user) return "NB"
    return (
      (user.firstName?.[0] ?? user.email?.[0] ?? "?") +
      (user.lastName?.[0] ?? "")
    ).toUpperCase()
  }, [user])

  const onPickColor = useCallback(
    (color) => {
      setLocalColor(color)

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(async () => {
        try {
          await changeAvatarColor(color)
        } catch (e) {
          console.error("[UserAvatar] changeAvatarColor failed:", e)
          setLocalColor(user?.avatarColor ?? AVATAR_COLORS[0])
        }
      }, 250)
    },
    [changeAvatarColor, user]
  )

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  if (!isAuthenticated || userLoading || !user) return null

  const safeAvatarUrl = user.avatarUrl || "/placeholder.svg"

  const AvatarNode = (
    <div className="relative h-8 w-8">
      <Avatar className="h-8 w-8">
        {/* KEY forces remount when URL changes */}
        <AvatarImage
          key={safeAvatarUrl}
          src={safeAvatarUrl}
          alt={`${user.firstName} ${user.lastName}`}
        />
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
  )

  if (!showMenu) return AvatarNode

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            {AvatarNode}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-60 rounded-2xl py-3 text-base" align="end" alignOffset={-14}>
          <DropdownMenuItem>
            <button
              className="flex w-full items-center gap-2 cursor-pointer rounded-2xl hover:bg-muted"
              onClick={() => setProfileOpen(true)}
            >
              <Avatar className="h-6 w-6">
                {/* KEY here too */}
                <AvatarImage
                  key={safeAvatarUrl}
                  src={safeAvatarUrl}
                  alt={`${user.firstName} ${user.lastName}`}
                />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="text-base font-medium mt-1">
                {user.firstName?.charAt(0).toUpperCase() + user.firstName?.slice(1)}
              </span>
            </button>
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
              onSelect={(e) => {
                e.preventDefault()
                setSettingsOpen(true)
              }}
              className="cursor-pointer"
            >
              <button className="flex w-full items-center gap-2 cursor-pointer px-2 py-1.5 rounded-2xl hover:bg-muted">
                <Settings className="size-5 text-foreground" />
                <span className="text-base font-medium">Settings</span>
              </button>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                setLogoutOpen(true)
              }}
              className="cursor-pointer"
            >
              <button className="flex w-full items-center gap-2 cursor-pointer px-2 py-1.5 rounded-2xl hover:bg-muted">
                <LogOut className="size-5 text-foreground" />
                <span className="text-base font-medium">Log out</span>
              </button>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <UserNameDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <LogoutDialog open={logoutOpen} onOpenChange={setLogoutOpen} />
    </>
  )
}










