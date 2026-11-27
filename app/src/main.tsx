import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { App } from './App'
import { AuthProvider } from './features/auth/AuthProvider'
import { ToastProvider } from './components/Toast'
import { persistOptions, queryClient } from './lib/queryClient'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
)
