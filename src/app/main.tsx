import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ViewportProvider } from "@/app/providers/ViewportProvider";
import { ThemeProvider, ThemeSync } from "@/app/providers/ThemeProvider";
import { AuthProvider } from "@/app/providers/AuthProvider";
import { HomeChatbarDockProvider } from "@/app/providers/HomeChatbarDockProvider";
import { SSEGate } from "@/app/providers/SSEProvider";
import { UserProvider } from "@/app/providers/UserProvider";
import { PathProvider } from "@/app/providers/PathProvider";
import App from "./App";
import "@/styles/index.css";

const queryClient = new QueryClient();
const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <QueryClientProvider client={queryClient}>
    <ViewportProvider>
      <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        <AuthProvider>
          <SSEGate>
            <UserProvider>
              <ThemeSync />
              <PathProvider>
                <HomeChatbarDockProvider>
                  <App />
                </HomeChatbarDockProvider>
              </PathProvider>
            </UserProvider>
          </SSEGate>
        </AuthProvider>
      </ThemeProvider>
    </ViewportProvider>
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
);





