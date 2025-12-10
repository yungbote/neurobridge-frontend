import React, { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserNameDialog } from "@/components/app/UserNameDialog";
import { Ampersand, Settings, LogOut } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { useUser } from "@/providers/UserProvider";

export function UserAvatar() {
  const { isAuthenticated } = useAuth();
  const { user, loading: userLoading } = useUser();
  const [profileOpen, setProfileOpen] = useState(false);

  if (!isAuthenticated || userLoading || !user) {
    return null;
  }

  const initials =
    (user.firstName?.[0] ?? user.email?.[0] ?? "?") +
    (user.lastName?.[0] ?? "");

  return (
    <>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8">
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={user.avatarUrl}
                alt={`${user.firstName} ${user.lastName}`}
              />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-60 rounded-2xl py-3 text-base" align="end" alignOffset={-14}>
          {/* Name label opens UserNameDialog */}
          <DropdownMenuItem>
            <button
              className="flex w-full items-center gap-2 cursor-pointer rounded-2xl hover:bg-muted"
              onClick={() => setProfileOpen(true)}
            >
              <Avatar className="h-6 w-6">
                <AvatarImage
                  src={user.avatarUrl}
                  alt={`${user.firstName} ${user.lastName}`}
                />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="text-base font-medium mt-1">
                {user.firstName.charAt(0).toUpperCase() + user.firstName.slice(1)}
              </span>
            </button>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <button className="flex w-full items-center gap-2 cursor-pointer px-2 py-1.5 rounded-2xl hover:bg-muted">
                <Ampersand className="size-5 text-foreground"/>
                <span className="text-base font-medium">Personalization</span>
              </button>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <button className="flex w-full items-center gap-2 cursor-pointer px-2 py-1.5 rounded-2xl hover:bg-muted">
                <Settings className="size-5 text-foreground" />
                <span className="text-base font-medium">Settings</span>
              </button>
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <button className="flex w-full items-center gap-2 cursor-pointer px-2 py-1.5 rounded-2xl hover:bg-muted">
                <LogOut className="size-5 text-foreground" />
                <span className="text-base font-medium">Log out</span>
              </button>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      
      <UserNameDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </>
  );
}










