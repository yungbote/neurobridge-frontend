import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSideBar } from "@/components/navigation/AppSideBar"
import { AppNavBar } from "@/components/navigation/AppNavBar"
import { useAuth } from "@/providers/AuthProvider";
export default function Layout({ children }) {
  const { isAuthenticated } = useAuth();
  return (
    <SidebarProvider>
      <div className="flex w-full">
        {isAuthenticated && (<AppSideBar />)}
        <div className="flex-1 flex flex-col">
          <AppNavBar />
          <main className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}










