import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { LoginDialog } from "@/components/auth/LoginDialog";
import { SignupDialog } from "@/components/auth/SignupDialog";
import { AppLogo } from "@/components/app/AppLogo";
import { ThemeToggle } from "@/providers/ThemeProvider";
import { MarketingNav } from "@/components/navigation/MarketingNav";
import { UserAvatar } from "@/components/app/UserAvatar";
import { useAuth } from "@/providers/AuthProvider";
import { useUser } from "@/providers/UserProvider";

export function AppNavBar() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { user, loading: userLoading } = useUser();
  const [authDialog, setAuthDialog] = useState(null);
  const initials =
    (user?.firstName?.[0] ?? user?.email?.[0] ?? "?") +
    (user?.lastName?.[0] ?? "");
  const [inProgressOpen, setInProgressOpen] = useState();

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-13 items-center px-6">
        {/* LEFT: Sidebar Trigger + Logo */}
        <div className="flex items-center gap-3">
          {isAuthenticated && !(<SidebarTrigger className="h-10 w-10" />)}
          <div className="flex items-center justify-center">
            <AppLogo className="cursor-pointer" />
          </div>
        </div>

        {/* CENTER: Marketing Nav */}
        {!isAuthenticated && (
          <div className="pointer-events-auto absolute left-1/2 -translate-x-1/2">
            <MarketingNav />
          </div>
        )}

        {/* RIGHT: Auth Buttons & Theme Toggle */}
        {!isAuthenticated && (
          <div className="ml-auto flex items-center gap-2">
            <LoginDialog
              triggerLabel="Login"
              open={authDialog === "login"}
              onOpenChange={(open) => {
                setAuthDialog(open ? "login" : null);
              }}
              onSwitchToSignup={() => setAuthDialog("signup")}
            />
            <SignupDialog
              triggerLabel="Sign up"
              open={authDialog === "signup"}
              onOpenChange={(open) => {
                setAuthDialog(open ? "signup" : null);
              }}
              onSwitchToLogin={() => setAuthDialog("login")}
            />
            <ThemeToggle />
          </div>
        )}

        {isAuthenticated && !userLoading && user && (
          <div className="ml-auto flex items-center gap-3">
            {location.pathname === "/" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="group data-[state=open]:bg-accent data-[state=open]:text-accent-foreground justify-between"
                  >
                    <span>In Progress</span>
                    <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                  </Button>
                </DropdownMenuTrigger>
              </DropdownMenu>
            )}
            <UserAvatar />
          </div>
        )}
      </div>
    </nav>
  );
}










