import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";

// Pages are code-split: each route loads its own chunk on navigation, so the
// initial load stays small. Named exports are adapted to lazy()'s default shape.
const LoginPage = lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const OverviewPage = lazy(() => import("@/pages/OverviewPage").then((m) => ({ default: m.OverviewPage })));
const MoneyPage = lazy(() => import("@/pages/MoneyPage").then((m) => ({ default: m.MoneyPage })));
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const RecurringPage = lazy(() => import("@/pages/RecurringPage").then((m) => ({ default: m.RecurringPage })));
const ThingsIOwnPage = lazy(() => import("@/pages/ThingsIOwnPage").then((m) => ({ default: m.ThingsIOwnPage })));
const WhatIOwePage = lazy(() => import("@/pages/WhatIOwePage").then((m) => ({ default: m.WhatIOwePage })));
const OwedToMePage = lazy(() => import("@/pages/OwedToMePage").then((m) => ({ default: m.OwedToMePage })));
const GoalsPage = lazy(() => import("@/pages/GoalsPage").then((m) => ({ default: m.GoalsPage })));
const ReportsPage = lazy(() => import("@/pages/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const BudgetsPage = lazy(() => import("@/pages/BudgetsPage").then((m) => ({ default: m.BudgetsPage })));
const ImportPage = lazy(() => import("@/pages/ImportPage").then((m) => ({ default: m.ImportPage })));
const ReconcilePage = lazy(() => import("@/pages/ReconcilePage").then((m) => ({ default: m.ReconcilePage })));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));

const Loading = () => (
  <div className="mx-auto max-w-4xl px-5 pt-8">
    <div className="h-8 w-40 animate-pulse rounded-md bg-ink/10" />
    <div className="mt-6 h-40 w-full animate-pulse rounded-2xl bg-ink/5" />
    <div className="mt-6 h-40 w-full animate-pulse rounded-2xl bg-ink/5" />
  </div>
);

// Routing. /login is public; everything else lives behind ProtectedRoute inside
// the app shell (AppLayout provides the sidebar + bottom nav). Routes mirror
// NAV_ITEMS in app/nav.ts.
export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<OverviewPage />} />
            <Route path="money" element={<MoneyPage />} />
            <Route path="things-i-own" element={<ThingsIOwnPage />} />
            <Route path="what-i-owe" element={<WhatIOwePage />} />
            <Route path="owed-to-me" element={<OwedToMePage />} />
            <Route path="recurring" element={<RecurringPage />} />
            <Route path="goals" element={<GoalsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="budgets" element={<BudgetsPage />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="reconcile" element={<ReconcilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
