import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import type { Profile } from '../types';

export const useAgentStats = () => {
    const { session } = useAuthStore();
    const [stats, setStats] = useState({ loaders: 0, users: 0, agents: 0 });
    const [pendingApprovals, setPendingApprovals] = useState<Profile[]>([]);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        if (session?.user.id) {
            fetchDownlineStats();
            fetchPendingApprovals();

            const channel = supabase
                .channel(`agent-stats-${session.user.id}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'profiles',
                    filter: `created_by=eq.${session.user.id}`
                }, () => {
                    fetchDownlineStats();
                    fetchPendingApprovals();
                })
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [session]);

    const fetchDownlineStats = async () => {
        const { data } = await supabase
            .from('profiles')
            .select('role, status')
            .eq('created_by', session?.user.id);

        if (data) {
            const counts = data.reduce((acc, curr) => {
                if (curr.role === 'loader') acc.loaders++;
                if (curr.role === 'agent') acc.agents++;
                if (curr.role === 'user' && curr.status === 'active') acc.users++;
                return acc;
            }, { loaders: 0, users: 0, agents: 0 });
            setStats(counts);
        }
    };

    const fetchPendingApprovals = async () => {
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('created_by', session?.user.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        if (data) setPendingApprovals(data as Profile[]);
    };

    const handleApproval = async (userId: string, status: 'active' | 'banned') => {
        setActionLoading(userId);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ status })
                .eq('id', userId);

            if (error) throw error;
            fetchPendingApprovals();
            fetchDownlineStats();
        } catch (err: any) {
            console.error('Approval error:', err);
        } finally {
            setActionLoading(null);
        }
    };

    return {
        stats,
        pendingApprovals,
        actionLoading,
        handleApproval,
        refreshStats: fetchDownlineStats
    };
};
