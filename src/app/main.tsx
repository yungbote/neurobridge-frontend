import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { domAnimation, LazyMotion, MotionConfig } from "framer-motion";
import { ViewportProvider } from "@/app/providers/ViewportProvider";
import { ThemeProvider, ThemeSync } from "@/app/providers/ThemeProvider";
import { I18nProvider } from "@/app/providers/I18nProvider";
import { AuthProvider } from "@/app/providers/AuthProvider";
import { HomeChatbarDockProvider } from "@/app/providers/HomeChatbarDockProvider";
import { SSEGate } from "@/app/providers/SSEProvider";
import { UserProvider } from "@/app/providers/UserProvider";
import { PathProvider } from "@/app/providers/PathProvider";
import { MaterialProvider } from "@/app/providers/MaterialProvider";
import { LessonProvider } from "@/app/providers/LessonProvider";
import { nbMotion } from "@/shared/motion/neurobridgeMotion";
import App from "./App";
import "@/styles/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <QueryClientProvider client={queryClient}>
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user" transition={nbMotion.transition}>
        <ViewportProvider>
          <I18nProvider>
            <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
              <AuthProvider>
                <SSEGate>
                  <UserProvider>
                    <ThemeSync />
                    <PathProvider>
                      <MaterialProvider>
                        <LessonProvider>
                          <HomeChatbarDockProvider>
                            <App />
                          </HomeChatbarDockProvider>
                        </LessonProvider>
                      </MaterialProvider>
                    </PathProvider>
                  </UserProvider>
                </SSEGate>
              </AuthProvider>
            </ThemeProvider>
          </I18nProvider>
        </ViewportProvider>
      </MotionConfig>
    </LazyMotion>
    {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
  </QueryClientProvider>
);
