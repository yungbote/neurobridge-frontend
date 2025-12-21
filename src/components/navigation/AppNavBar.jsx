import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlignJustify, ChevronDownIcon, CircleDashed, BadgePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { LoginDialog } from "@/components/auth/LoginDialog";
import { SignupDialog } from "@/components/auth/SignupDialog";
import { AppLogo } from "@/components/app/AppLogo";
import { ThemeToggle } from "@/providers/ThemeProvider";
import { MarketingNav } from "@/components/navigation/MarketingNav";
import { UserAvatar } from "@/components/app/UserAvatar";
import { FileUploadDialog } from "@/components/app/UploadFilesDialog";
import { useAuth } from "@/providers/AuthProvider";
import { useUser } from "@/providers/UserProvider";
import { Container } from "@/layout/Container";

export function AppNavBar() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { user, loading: userLoading } = useUser();
  const [authDialog, setAuthDialog] = useState(null);

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Container
        as="div"
        className="flex h-14 items-center gap-3"
      >
        {/* LEFT: Sidebar Trigger + Logo */}
        <div className="flex items-center gap-2">
          {isAuthenticated && (
            <SidebarTrigger className="md:hidden" aria-label="Open sidebar" />
          )}

          <Link to="/" aria-label="Go to home" className="flex items-center">
            <AppLogo className="cursor-pointer" />
          </Link>
        </div>

        {/* CENTER: Marketing Nav (desktop) */}
        {!isAuthenticated && (
          <div className="hidden md:flex flex-1 justify-center">
            <MarketingNav />
          </div>
        )}

        {/* RIGHT: Auth / User Actions */}
        {!isAuthenticated && (
          <div className="ml-auto flex items-center gap-2">
            {/* Mobile marketing menu */}
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Open menu">
                    <AlignJustify className="size-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem asChild>
                    <Link to="/about" className="w-full cursor-pointer">
                      About
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/features" className="w-full cursor-pointer">
                      Features
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/pricing" className="w-full cursor-pointer">
                      Pricing
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

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
          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
            {location.pathname === "/" && (
              <>
                <FileUploadDialog
                  trigger={
                    <Button variant="ghost" size="sm" className="gap-2">
                      <BadgePlus className="size-5" />
                      <span className="hidden sm:inline">New Path</span>
                    </Button>
                  }
                />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="group flex items-center justify-between gap-2 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
                    >
                      <div className="flex items-center gap-1.5">
                        <CircleDashed className="size-5" />
                        <span className="hidden sm:inline">In Progress</span>
                      </div>
                      <ChevronDownIcon className="size-5 transition-transform group-data-[state=open]:rotate-180" />
                    </Button>
                  </DropdownMenuTrigger>
                </DropdownMenu>
              </>
            )}
            <UserAvatar />
          </div>
        )}
      </Container>
    </nav>
  );
}









