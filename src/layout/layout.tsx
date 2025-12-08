import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSideBar } from "@/components/navigation/AppSideBar"
import { AppNavBar } from "@/components/navigation/AppNavBar"

export default function Layout({ children }) {
  return (
    <SidebarProvider>
      <div className="flex w-full">
        <AppSideBar />
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
