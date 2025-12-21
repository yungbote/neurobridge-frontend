import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSideBar } from "@/components/navigation/AppSideBar";
import { AppNavBar } from "@/components/navigation/AppNavBar";
import { useAuth } from "@/providers/AuthProvider";
import { Breadcrumbs } from "@/components/app/Breadcrumbs";
import { Container } from "@/layout/Container";

export default function Layout({ children }) {
  const { isAuthenticated } = useAuth();

  return (
    <SidebarProvider>
      <div className="flex w-full">
        {isAuthenticated && <AppSideBar />}

        <div className="flex-1 flex flex-col">
          <AppNavBar />

          {isAuthenticated && (
            <div>
              <Container className="py-3">
                <Breadcrumbs />
              </Container>
            </div>
          )}

          <main className="flex-1">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}







