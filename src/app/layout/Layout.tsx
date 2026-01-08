import { useLayoutEffect, type ReactNode } from "react";
import { matchPath, useLocation } from "react-router-dom";
import { SidebarProvider } from "@/shared/ui/sidebar";
import { AppSideBar } from "@/app/navigation/AppSideBar";
import { AppNavBar } from "@/app/navigation/AppNavBar";
import { useAuth } from "@/app/providers/AuthProvider";
import { usePaths } from "@/app/providers/PathProvider";
import { Breadcrumbs } from "@/app/components/Breadcrumbs";
import { Container } from "@/shared/layout/Container";
import { UserDialogsProvider } from "@/app/providers/UserDialogProvider";
import { ActivityPanelProvider } from "@/app/providers/ActivityPanelProvider";
import { ActivityPanel } from "@/features/activity/components/ActivityPanel";

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { isAuthenticated } = useAuth();
  const { activePathId } = usePaths();
  const location = useLocation();
  const isPathContext = Boolean(
    matchPath({ path: "/paths/:id", end: false }, location.pathname) ||
      matchPath({ path: "/path-nodes/:id", end: false }, location.pathname) ||
      matchPath({ path: "/activities/:id", end: false }, location.pathname)
  );
  const hideBreadcrumbs = location.pathname.startsWith("/chat") || isPathContext || Boolean(activePathId);

  useLayoutEffect(() => {
    if (!isAuthenticated) return;
    if (!isPathContext) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    const main = document.querySelector("main");
    if (main instanceof HTMLElement) {
      main.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [isAuthenticated, isPathContext, location.key]);

  return (
    <SidebarProvider>
      <UserDialogsProvider>
        {/* TODO: Activity Panel should only be visible on the associated chat page */}
        <ActivityPanelProvider>
          <div className="flex w-full min-h-svh">
            {isAuthenticated && <AppSideBar />}

            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              <AppNavBar />

              {isAuthenticated && !hideBreadcrumbs && (
                <div>
                  <Container size="app" className="py-3">
                    <Breadcrumbs />
                  </Container>
                </div>
              )}

              <main className="flex-1 min-w-0 min-h-0">{children}</main>
            </div>

            {isAuthenticated && <ActivityPanel />}
          </div>
        </ActivityPanelProvider>
      </UserDialogsProvider>
    </SidebarProvider>
  );
}


