import { Suspense, lazy } from 'react';
import { useAuthStore } from '../lib/store';
// import { AdminDashboard } from './dashboard/AdminDashboard';
// import { MasterAgentDashboard } from './dashboard/MasterAgentDashboard';
// import { AgentDashboard } from './dashboard/AgentDashboard';
// import { LoaderDashboard } from './dashboard/LoaderDashboard';
// import { UserDashboard } from './dashboard/UserDashboard';
import { PendingApproval } from './PendingApproval';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

const AdminDashboard = lazy(() => import('./dashboard/AdminDashboard').then(module => ({ default: module.AdminDashboard })));
const MasterAgentDashboard = lazy(() => import('./dashboard/MasterAgentDashboard').then(module => ({ default: module.MasterAgentDashboard })));
const AgentDashboard = lazy(() => import('./dashboard/AgentDashboard').then(module => ({ default: module.AgentDashboard })));
const LoaderDashboard = lazy(() => import('./dashboard/LoaderDashboard').then(module => ({ default: module.LoaderDashboard })));
const UserDashboard = lazy(() => import('./dashboard/UserDashboard').then(module => ({ default: module.UserDashboard })));

export const Dashboard = () => {
    const { profile, loading } = useAuthStore();

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-casino-slate-400 gap-4">
                <Loader2 className="animate-spin text-casino-gold-400 w-10 h-10" />
                <span className="text-sm font-bold uppercase tracking-[0.2em]">Preparing Lobby...</span>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-casino-slate-400 gap-6 glass-panel rounded-3xl p-12">
                <AlertCircle className="w-12 h-12 text-casino-gold-800" />
                <div className="text-center">
                    <p className="text-white font-bold text-lg mb-1">Session Expired</p>
                    <p className="text-sm">Please refresh or sign in again.</p>
                </div>
                <button
                    onClick={() => window.location.reload()}
                    className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10 transition-all font-bold"
                >
                    <RefreshCw size={18} />
                    Retry
                </button>
            </div>
        );
    }

    // Redirect pending users to the approval page
    if (profile.status === 'pending') {
        return <PendingApproval />;
    }

    const renderDashboard = () => {
        switch (profile.role) {
            case 'admin':
                return <AdminDashboard />;
            case 'master_agent':
                return <MasterAgentDashboard />;
            case 'agent':
                return <AgentDashboard />;
            case 'loader':
                return <LoaderDashboard />;
            case 'user':
                return <UserDashboard />;
            default:
                return (
                    <div className="flex items-center justify-center h-[60vh] text-casino-slate-400">
                        <div className="text-center">
                            <p className="text-xl font-bold text-white mb-2">Unknown Access Level</p>
                            <p>Please contact support if you believe this is an error.</p>
                        </div>
                    </div>
                );
        }
    };

    return (
        <Suspense fallback={
            <div className="flex flex-col items-center justify-center h-[60vh] text-casino-slate-400 gap-4">
                <Loader2 className="animate-spin text-casino-gold-400 w-10 h-10" />
                <span className="text-sm font-bold uppercase tracking-[0.2em]">Loading Dashboard...</span>
            </div>
        }>
            {renderDashboard()}
        </Suspense>
    );
};
