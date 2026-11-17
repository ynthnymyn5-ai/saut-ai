import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import { I18nProvider } from "./i18n";
import { MiraProvider } from "./lib/store";
import { ConfirmProvider, PendingActionsModal } from "./components/ConfirmModal";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/Home";
import { DashboardPage } from "./pages/Dashboard";
import { AgentPage } from "./pages/AgentPage";
import { HistoryPage } from "./pages/History";
import { ActivityPage } from "./pages/Activity";
import { SettingsPage } from "./pages/Settings";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <MiraProvider>
        <ConfirmProvider>
          <BrowserRouter>
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
          </BrowserRouter>
        </ConfirmProvider>
      </MiraProvider>
    </I18nProvider>
  </StrictMode>,
);

// PWA: register the service worker (offline shell + push notifications)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(console.error));
}
