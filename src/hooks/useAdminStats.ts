import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface AdminStats {
    totalUsers: number;
    totalActiveUsers: number; // Placeholder for now, maybe recent login
    totalBetsToday: number;
    systemGGR: number;
    roleCounts: {
        master_agent: number;
        agent: number;
        loader: number;
        user: number;
    };
    roleBalances: {
        master_agent: number;
        agent: number;
        loader: number;
        user: number;
    };
}

export const useAdminStats = () => {
    const [stats, setStats] = useState<AdminStats>({
        totalUsers: 0,
        totalActiveUsers: 0,
        totalBetsToday: 0,
        systemGGR: 0,
        roleCounts: { master_agent: 0, agent: 0, loader: 0, user: 0 },
        roleBalances: { master_agent: 0, agent: 0, loader: 0, user: 0 },
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        const fetchStats = async () => {
            try {
                // 1. Fetch Profiles to calculate Role Counts and Balances
                const { data: profiles, error: profilesError } = await supabase
                    .from('profiles')
                    .select('role, balance');

                if (profilesError) throw profilesError;

                const roleCounts = { master_agent: 0, agent: 0, loader: 0, user: 0 };
                const roleBalances = { master_agent: 0, agent: 0, loader: 0, user: 0 };
                let totalUsers = 0;

                profiles.forEach(p => {
                    const r = p.role as keyof typeof roleCounts;
                    if (roleCounts[r] !== undefined) {
                        roleCounts[r]++;
                        roleBalances[r] += Number(p.balance) || 0;
                    }
                    totalUsers++;
                });

                // 2. Fetch Bets (Simple count for now)
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const { count: betsCount, error: betsError } = await supabase
                    .from('bets')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', today.toISOString());

                if (betsError) throw betsError;

                if (!mounted) return;

                setStats({
                    totalUsers,
                    totalActiveUsers: totalUsers,
                    totalBetsToday: betsCount || 0,
                    systemGGR: 0,
                    roleCounts,
                    roleBalances
                });

            } catch (err: any) {
                if (!mounted) return;
                if (err.name === 'AbortError' || err.message?.includes('AbortError')) return;
                console.error("Error fetching admin stats:", err);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchStats();

        // Subscribe to profile changes for live stats updates
        const profilesChannel = supabase
            .channel('admin-stats-profiles')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'profiles'
            }, () => {
                fetchStats();
            })
            .subscribe();

        // Subscribe to NEW BETS for live count update
        const betsChannel = supabase
            .channel('admin-stats-bets')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'bets'
            }, () => {
                // Optimistic update for bets count
                setStats(prev => ({
                    ...prev,
                    totalBetsToday: prev.totalBetsToday + 1
                }));
            })
            .subscribe();

        return () => {
            mounted = false;
            supabase.removeChannel(profilesChannel);
            supabase.removeChannel(betsChannel);
        };
    }, []);

    return { stats, loading };
};
