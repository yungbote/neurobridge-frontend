import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { AuthProvider } from '@/providers/AuthProvider';
import { SSEGate } from '@/providers/SSEProvider';
import { UserProvider } from '@/providers/UserProvider';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <AuthProvider>
        <SSEGate>
          <UserProvider>
            <App />
          </UserProvider>
        </SSEGate>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
)
