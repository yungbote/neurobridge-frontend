import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider, ThemeSync } from '@/providers/ThemeProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { SSEGate } from '@/providers/SSEProvider';
import { UserProvider } from '@/providers/UserProvider';
import { PathProvider } from '@/providers/PathProvider';
import App from './App.jsx';
import "./index.css";

const queryClient = new QueryClient();

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <AuthProvider>
        <SSEGate>
          <UserProvider>
            <ThemeSync />
            <PathProvider>
              <App />
            </PathProvider>
          </UserProvider>
        </SSEGate>
      </AuthProvider>
    </ThemeProvider>
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
);










