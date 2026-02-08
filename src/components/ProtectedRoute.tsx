import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../lib/store';

export const ProtectedRoute = () => {
    const { session, profile, loading, refreshProfile } = useAuthStore();

    useEffect(() => {
        if (session && !profile && !loading) {
            // Fallback: if the profile row is created asynchronously after auth, retry with backoff.
            // Realtime on `profiles` should normally populate this quickly (see store subscription).
            let cancelled = false;
            let timer: number | null = null;
            let attempt = 0;

            const tick = async () => {
                attempt += 1;
                try {
                    await refreshProfile();
                } catch {
                    // ignore
                }

                if (cancelled) return;

                // Backoff up to 30s to avoid hammering Supabase.
                const nextDelayMs = Math.min(30_000, 1000 * Math.pow(2, attempt));
                timer = window.setTimeout(tick, nextDelayMs);
            };

            tick();

            return () => {
                cancelled = true;
                if (timer) window.clearTimeout(timer);
            };
        }
    }, [session, profile, loading, refreshProfile]);

    if (loading) {
        return (
            <div className="min-h-screen bg-neutral-900 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
            </div>
        );
    }

    if (!session) return <Navigate to="/login" replace />;

    // If session exists but profile is not loaded yet (e.g. delayed creation), show loader
    if (session && !profile) {
        return (
            <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-600"></div>
                <p className="text-gray-400 text-sm animate-pulse">Setting up your profile...</p>
            </div>
        );
    }

    // If account is pending, force logout to prevent access
    if (profile?.status === 'pending') {
        const { signOut } = useAuthStore.getState();
        signOut(); // Force sign out
        return <Navigate to="/login" replace />;
    }

    // If account is active, don't allow access to the pending page
    if (profile?.status === 'active' && window.location.pathname === '/pending') {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
};
