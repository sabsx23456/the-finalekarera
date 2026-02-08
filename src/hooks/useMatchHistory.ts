import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';

export interface MatchHistoryItem {
    id: string;
    event_name: string;
    team_a: string;
    team_b: string;
    winner: 'meron' | 'wala' | 'draw' | null;
    created_at: string;
    status: string;
}

export interface ReferralBetDetail {
    username: string;
    selection: 'meron' | 'wala' | 'draw';
    amount: number;
    payout: number;
    status: 'won' | 'lost' | 'pending' | 'cancelled' | 'draw';
    profit: number;
}

export const useMatchHistory = () => {
    const { profile } = useAuthStore();
    const [matches, setMatches] = useState<MatchHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
    const [referralBets, setReferralBets] = useState<ReferralBetDetail[]>([]);
    const [loadingBets, setLoadingBets] = useState(false);

    // Fetch Completed Matches
    const fetchMatches = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('matches')
                .select('*')
                .eq('status', 'finished')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setMatches(data || []);
        } catch (error) {
            console.error("Error fetching match history:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch Referral Bets for a specific match
    const fetchReferralBets = async (matchId: string) => {
        if (!profile?.id) return;
        setLoadingBets(true);
        setReferralBets([]); // Clear previous
        try {
            // Strategy:
            // 1. Get all bets for this match.
            // 2. Filter bets where the user's `created_by` IS the current user (if Agent/Master).
            //    OR if Admin, maybe show all? The requirement says "list of Users they refer".
            //    We will stick to strict referrer check for Agents/Masters. 
            //    For Admin, we might want to see EVERYTHING or just their direct. 
            //    Let's implement a check: if Admin, fetch all? Or stick to specific pattern?
            //    Re-reading request: "Users they refer". 
            //    However, usually Admins want to see GLOBAL bets.
            //    But let's stick to the "downline" logic first. If Admin, maybe we show all.

            let query = supabase
                .from('bets')
                .select(`
                    amount,
                    selection,
                    status,
                    payout,
                    user:profiles!inner (
                        username,
                        created_by
                    )
                `)
                .eq('match_id', matchId)
                .neq('status', 'cancelled');

            const { data, error } = await query;

            if (error) throw error;

            let filteredBets: any[] = data || [];

            if (profile.role !== 'admin') {
                // Client-side filter for strict downline (direct referrals)
                // If we want multilevel (Master Agent -> Agent -> User), this simple check handles direct only.
                // Master Agent usually wants to see sub-agent's users too?
                // The previous MasterAgent logic fetched full downline IDs.
                // Let's reuse that logic if possible, or simple check 'created_by'.
                // For optimal performance, we should ideally filter by ID list, but fetching match bets first is okay for reasonable volume.

                // Fetch full downline IDs to be accurate for Master Agents
                if (profile.role === 'master_agent') {
                    // Get all agents created by me
                    const { data: agents } = await supabase.from('profiles').select('id').eq('created_by', profile.id);
                    const agentIds = agents?.map(a => a.id) || [];
                    const myIdAndAgents = [profile.id, ...agentIds];

                    filteredBets = filteredBets.filter((bet: any) =>
                        myIdAndAgents.includes(bet.user.created_by)
                    );
                } else {
                    // Regular Agent: only direct
                    filteredBets = filteredBets.filter((bet: any) => bet.user.created_by === profile.id);
                }
            }

            // Map to interface
            const formattedBets: ReferralBetDetail[] = filteredBets.map((bet: any) => ({
                username: bet.user.username,
                selection: bet.selection,
                amount: bet.amount,
                payout: bet.payout,
                status: bet.status,
                profit: bet.status === 'won' ? (bet.payout - bet.amount) : (bet.status === 'draw' || bet.status === 'cancelled' ? 0 : -bet.amount)
            }));

            setReferralBets(formattedBets);

        } catch (error) {
            console.error("Error fetching referral bets:", error);
        } finally {
            setLoadingBets(false);
        }
    };

    useEffect(() => {
        fetchMatches();
    }, [fetchMatches]);

    const toggleMatch = (matchId: string) => {
        if (expandedMatchId === matchId) {
            setExpandedMatchId(null);
            setReferralBets([]);
        } else {
            setExpandedMatchId(matchId);
            fetchReferralBets(matchId);
        }
    };

    return {
        matches,
        loading,
        expandedMatchId,
        toggleMatch,
        referralBets,
        loadingBets,
        refreshMatches: fetchMatches
    };
};
