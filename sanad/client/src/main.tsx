import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, MemoryRouter, Route, Routes } from "react-router-dom";
import { installMockApi } from "./demo/mockApi";
import "./index.css";
import { I18nProvider } from "./i18n";
import { SanadProvider } from "./lib/store";
import { ConfirmProvider, PendingActionsModal } from "./components/ConfirmModal";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/Home";
import { DashboardPage } from "./pages/Dashboard";
import { AgentPage } from "./pages/AgentPage";
import { HistoryPage } from "./pages/History";
import { ActivityPage } from "./pages/Activity";
import { SettingsPage } from "./pages/Settings";
import { LoginPage } from "./pages/Login";
import { useSanad } from "./lib/store";
import type { ReactNode } from "react";

/** Shows the owner login screen in password mode until signed in. */
function AuthGate({ children }: { children: ReactNode }) {
  const { user, authMode } = useSanad();
  if (authMode === "password" && !user) return <LoginPage />;
  return <>{children}</>;
}

// Static demo build (VITE_DEMO=1): in-browser mock server + in-memory routing
const DEMO = import.meta.env.VITE_DEMO === "1";
if (DEMO) installMockApi();
const Router = DEMO ? MemoryRouter : BrowserRouter;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <SanadProvider>
        <ConfirmProvider>
          <Router>
            <AuthGate>
            <Layout>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/agents/:id" element={<AgentPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/activity" element={<ActivityPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<HomePage />} />
              </Routes>
            </Layout>
            <PendingActionsModal />
            </AuthGate>
          </Router>
        </ConfirmProvider>
      </SanadProvider>
    </I18nProvider>
  </StrictMode>,
);

// PWA: register the service worker (offline shell + push notifications)
if ("serviceWorker" in navigator && !DEMO) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(console.error));
}
