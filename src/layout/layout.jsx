import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSideBar } from "@/components/navigation/AppSideBar";
import { AppNavBar } from "@/components/navigation/AppNavBar";
import { useAuth } from "@/providers/AuthProvider";
import { Breadcrumbs } from "@/components/app/Breadcrumbs";
import { Container } from "@/layout/Container";
import { UserDialogsProvider } from "@/providers/UserDialogProvider";
import { ActivityPanelProvider } from "@/providers/ActivityPanelProvider";
import { ActivityPanel } from "@/components/app/ActivityPanel";

export default function Layout({ children }) {
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










