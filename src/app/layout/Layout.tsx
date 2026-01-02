import type { ReactNode } from "react";
import { SidebarProvider } from "@/shared/ui/sidebar";
import { AppSideBar } from "@/app/navigation/AppSideBar";
import { AppNavBar } from "@/app/navigation/AppNavBar";
import { useAuth } from "@/app/providers/AuthProvider";
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

  return (
    <SidebarProvider>
      <UserDialogsProvider>
        {/* TODO: Activity Panel should only be visible on the associated chat page */}
        <ActivityPanelProvider>
          <div className="flex w-full min-h-svh">
            {isAuthenticated && <AppSideBar />}

            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              <AppNavBar />

              {isAuthenticated && (
                <div>
                  <Container className="py-3">
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









