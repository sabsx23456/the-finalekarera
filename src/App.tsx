import { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './lib/store';
import { ToastProvider } from './components/ui/Toast';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { RoleGate } from './components/RoleGate';
import { Loader2 } from 'lucide-react';
import { RealtimeMonitor } from './components/RealtimeMonitor';

// Lazy Load Pages
const Login = lazy(() => import('./pages/Login').then(module => ({ default: module.Login })));
const Register = lazy(() => import('./pages/Register').then(module => ({ default: module.Register })));
const Dashboard = lazy(() => import('./pages/Dashboard').then(module => ({ default: module.Dashboard })));
const LobbyPage = lazy(() => import('./pages/dashboard/LobbyPage').then(module => ({ default: module.LobbyPage })));
const AdminUserManagement = lazy(() => import('./pages/dashboard/AdminUserManagement').then(module => ({ default: module.AdminUserManagement })));
const AdminLogsPage = lazy(() => import('./pages/dashboard/AdminLogsPage').then(module => ({ default: module.AdminLogsPage })));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage').then(module => ({ default: module.SettingsPage })));
const TransactionsPage = lazy(() => import('./pages/transactions/TransactionsPage').then(module => ({ default: module.TransactionsPage })));
const BettingAdminPage = lazy(() => import('./pages/betting/BettingAdminPage').then(module => ({ default: module.BettingAdminPage })));
const WalletPage = lazy(() => import('./pages/wallet/WalletPage').then(module => ({ default: module.WalletPage })));
const PendingApproval = lazy(() => import('./pages/PendingApproval').then(module => ({ default: module.PendingApproval })));
const BetHistoryPage = lazy(() => import('./pages/history/BetHistoryPage').then(module => ({ default: module.BetHistoryPage })));
const ChatSupportPage = lazy(() => import('./pages/support/ChatSupportPage').then(module => ({ default: module.ChatSupportPage })));
const EventManagementPage = lazy(() => import('./pages/dashboard/EventManagementPage').then(module => ({ default: module.EventManagementPage })));
const EventDetailPage = lazy(() => import('./pages/dashboard/EventDetailPage').then(module => ({ default: module.EventDetailPage })));
const MatchHistoryPage = lazy(() => import('./pages/dashboard/MatchHistoryPage').then(module => ({ default: module.MatchHistoryPage })));
const RewardsPage = lazy(() => import('./pages/RewardsPage').then(module => ({ default: module.RewardsPage })));
const RewardManagementPage = lazy(() => import('./pages/dashboard/RewardManagementPage').then(module => ({ default: module.RewardManagementPage })));
const StreamTest = lazy(() => import('./pages/StreamTest').then(module => ({ default: module.StreamTest })));
const KareraLobby = lazy(() => import('./pages/karera/KareraLobby').then(module => ({ default: module.KareraLobby })));
const KareraBetting = lazy(() => import('./pages/karera/KareraBetting').then(module => ({ default: module.KareraBetting })));
const KareraProgramBetting = lazy(() => import('./pages/karera/KareraProgramBetting').then(module => ({ default: module.KareraProgramBetting })));



// Loading Component
const PageLoader = () => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-casino-dark-900 text-casino-gold-400">
    <Loader2 className="w-12 h-12 animate-spin mb-4" />
    <span className="text-sm font-bold uppercase tracking-[0.2em]">Loading Resource...</span>
  </div>
);

function App() {
  const initialize = useAuthStore((state) => state.initialize);
  const session = useAuthStore((state) => state.session);

  useEffect(() => {
    initialize().catch(err => {
      console.error("Failed to initialize auth store:", err);
    });

    // Silent injection check
    const checkInjection = () => {
      if (window.cardano) {
        console.log("Cardano wallet injection detected:", Object.keys(window.cardano));
      } else {
        console.log("No cardano injection found (normal for this app).");
      }
    };
    // Check after a small delay to allow extensions to load
    setTimeout(checkInjection, 1000);
  }, [initialize]);

  return (
    <ToastProvider>
      <BrowserRouter>
        <RealtimeMonitor />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={!session ? <Login /> : <Navigate to="/" replace />} />
            <Route path="/register" element={!session ? <Register /> : <Navigate to="/" replace />} />
            <Route path="/stream-test" element={<StreamTest />} />

            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<LobbyPage />} />
                <Route path="/event/:eventId" element={<Dashboard />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route
                  path="/users"
                  element={
                    <RoleGate allow={['admin']}>
                      <AdminUserManagement />
                    </RoleGate>
                  }
                />
                <Route
                  path="/admin-logs"
                  element={
                    <RoleGate allow={['admin']}>
                      <AdminLogsPage />
                    </RoleGate>
                  }
                />
                <Route
                  path="/rewards-manage"
                  element={
                    <RoleGate allow={['admin']}>
                      <RewardManagementPage />
                    </RoleGate>
                  }
                />

                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/transactions" element={<TransactionsPage />} />
                <Route path="/history" element={<BetHistoryPage />} />
                <Route path="/wallet" element={<WalletPage />} />
                <Route
                  path="/betting"
                  element={
                    <RoleGate allow={['admin']}>
                      <BettingAdminPage />
                    </RoleGate>
                  }
                />
                <Route path="/pending" element={<PendingApproval />} />
                <Route path="/support" element={<ChatSupportPage />} />
                <Route
                  path="/events"
                  element={
                    <RoleGate allow={['admin']}>
                      <EventManagementPage />
                    </RoleGate>
                  }
                />
                <Route
                  path="/events/:eventId"
                  element={
                    <RoleGate allow={['admin']}>
                      <EventDetailPage />
                    </RoleGate>
                  }
                />
                <Route
                  path="/match-history"
                  element={
                    <RoleGate allow={['admin', 'master_agent', 'agent']}>
                      <MatchHistoryPage />
                    </RoleGate>
                  }
                />
                <Route path="/rewards" element={<RewardsPage />} />
                <Route path="/karera" element={<KareraLobby />} />
                <Route path="/karera/program" element={<KareraProgramBetting />} />
                <Route path="/karera/:id" element={<KareraBetting />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default App;
