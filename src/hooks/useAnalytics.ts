
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';


export interface AgentCommissionStats {
    agentId: string;
    agentName: string;
    totalCommission: number;
    sourceUsers: { username: string; amount: number }[]; // Direct commission sources
    referredUsers: UserBetStats[]; // Full stats of all users referred
}

export interface UserBetStats {
    userId: string;
    username: string;
    totalBets: number;
    totalWagered: number;
    totalWins: number;
    winRate: number;
    netProfit: number; // Payout - Wager
    totalCashIn: number;
    totalCashOut: number;
    referralAgent: string;
}

export interface GlobalAnalytics {
    totalProfit: number;
    totalCommission: number;
    houseEarnings: number; // Profit - Commission (Approx)
}

export const useAnalytics = () => {
    const [loading, setLoading] = useState(true);
    const [agentStats, setAgentStats] = useState<AgentCommissionStats[]>([]);
    const [userStats, setUserStats] = useState<UserBetStats[]>([]);
    const [globalStats, setGlobalStats] = useState<GlobalAnalytics>({
        totalProfit: 0,
        totalCommission: 0,
        houseEarnings: 0
    });

    const fetchAnalytics = async () => {
        setLoading(true);
        try {
            // 0. Fetch Profiles for Refferal Data
            const { data: profiles, error: profileError } = await supabase
                .from('profiles')
                .select('id, username, created_by');

            if (profileError) throw profileError;

            // Create a lookup for username -> id and id -> details
            const idToDetails = new Map<string, { username: string, created_by: string | null }>();
            profiles?.forEach(p => {
                idToDetails.set(p.id, { username: p.username, created_by: p.created_by });
            });

            // Helper to get username by ID
            const getUsername = (id: string | null) => id ? (idToDetails.get(id)?.username || 'Unknown') : 'System';


            // 1. Fetch Commissions
            const { data: commissions, error: comError } = await supabase
                .from('transactions')
                .select(`
                    amount,
                    receiver_id,
                    sender_id
                `)
                .eq('type', 'commission');

            if (comError) throw comError;

            // Process Commissions
            const agentMap = new Map<string, AgentCommissionStats>();
            let totalComm = 0;

            commissions?.forEach((tx: any) => {
                const agentId = tx.receiver_id;
                const amount = tx.amount;
                totalComm += amount;

                if (!agentMap.has(agentId)) {
                    agentMap.set(agentId, {
                        agentId,
                        agentName: getUsername(agentId),
                        totalCommission: 0,
                        sourceUsers: [],
                        referredUsers: []
                    });
                }
                const stats = agentMap.get(agentId)!;
                stats.totalCommission += amount;

                const sourceName = getUsername(tx.sender_id);
                const existingSource = stats.sourceUsers.find(s => s.username === sourceName);
                if (existingSource) {
                    existingSource.amount += amount;
                } else {
                    stats.sourceUsers.push({ username: sourceName, amount });
                }
            });

            // 1.5 Fetch Cash In / Cash Out Transactions
            const { data: cashFlow, error: cashError } = await supabase
                .from('transactions')
                .select('amount, type, receiver_id, sender_id')
                .in('type', ['load', 'withdraw']);

            if (cashError) throw cashError;

            const userCashStats = new Map<string, { in: number, out: number }>();

            cashFlow?.forEach((tx: any) => {
                const userId = tx.type === 'load' ? tx.receiver_id : tx.sender_id;

                if (!userId) return;

                if (!userCashStats.has(userId)) {
                    userCashStats.set(userId, { in: 0, out: 0 });
                }
                const stats = userCashStats.get(userId)!;

                if (tx.type === 'load') {
                    stats.in += tx.amount;
                } else if (tx.type === 'withdraw') {
                    stats.out += tx.amount;
                }
            });


            // 2. Fetch Bets for User Analytics & Global Profit
            const { data: bets, error: betError } = await supabase
                .from('bets')
                .select(`
                    user_id,
                    amount,
                    payout,
                    status,
                    created_at
                `)
                .neq('status', 'cancelled');

            if (betError) throw betError;

            const userMap = new Map<string, UserBetStats>();
            let totalWageredGlobal = 0;
            let totalPayoutsGlobal = 0;

            // Initialize userMap with all profiles to ensure we catch users who have transactions/referrals but no bets yet
            idToDetails.forEach((details, id) => {
                userMap.set(id, {
                    userId: id,
                    username: details.username,
                    totalBets: 0,
                    totalWagered: 0,
                    totalWins: 0,
                    winRate: 0,
                    netProfit: 0,
                    totalCashIn: userCashStats.get(id)?.in || 0,
                    totalCashOut: userCashStats.get(id)?.out || 0,
                    referralAgent: getUsername(details.created_by)
                });
            });

            bets?.forEach((bet: any) => {
                totalWageredGlobal += bet.amount;
                if (bet.status === 'won') {
                    totalPayoutsGlobal += bet.payout;
                }

                if (!bet.user_id) return;

                // Ensure user exists (fallback)
                if (!userMap.has(bet.user_id)) {
                    const cashIn = userCashStats.get(bet.user_id)?.in || 0;
                    const cashOut = userCashStats.get(bet.user_id)?.out || 0;
                    userMap.set(bet.user_id, {
                        userId: bet.user_id,
                        username: getUsername(bet.user_id),
                        totalBets: 0,
                        totalWagered: 0,
                        totalWins: 0,
                        winRate: 0,
                        netProfit: 0,
                        totalCashIn: cashIn,
                        totalCashOut: cashOut,
                        referralAgent: 'Unknown'
                    });
                }

                const uStats = userMap.get(bet.user_id)!;
                uStats.totalBets += 1;
                uStats.totalWagered += bet.amount;

                if (bet.status === 'won') {
                    uStats.totalWins += 1;
                    uStats.netProfit += (bet.payout - bet.amount);
                } else {
                    uStats.netProfit -= bet.amount;
                }
            });

            // Calculate Win Rates & Final List
            // Filter to only show users who have ANY activity (bets or cash flow)
            const processedUserStats = Array.from(userMap.values())
                .filter(u => u.totalBets > 0 || u.totalCashIn > 0 || u.totalCashOut > 0)
                .map(u => ({
                    ...u,
                    winRate: u.totalBets > 0 ? (u.totalWins / u.totalBets) * 100 : 0
                }))
                .sort((a, b) => b.totalWagered - a.totalWagered);

            setUserStats(processedUserStats);

            // Populate referredUsers in agentStats
            // We iterate over the FULL set of agents from profiles, not just those with commissions, 
            // but for now we only care about showing agents who EARNED commissions in the AgentPerformance table?
            // Actually, the request implies expansion of agents in the AgentCommissionTable.

            // Let's populate referredUsers for existing agents in agentMap.
            processedUserStats.forEach(user => {
                // Find agent by name (since referralAgent is a name string in UserStats)
                // Ideally this should use IDs, but we mapped names.
                // We need to match agentName in agentMap.

                // Let's iterate agentMap values
                for (const agent of agentMap.values()) {
                    if (agent.agentName === user.referralAgent) {
                        agent.referredUsers.push(user);
                        break;
                    }
                }
            });

            setAgentStats(Array.from(agentMap.values()).sort((a, b) => b.totalCommission - a.totalCommission));

            // Global Calculations
            const grossProfit = totalWageredGlobal - totalPayoutsGlobal;

            setGlobalStats({
                totalProfit: grossProfit,
                totalCommission: totalComm,
                houseEarnings: grossProfit - totalComm
            });

        } catch (error) {
            console.error("Error fetching analytics:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAnalytics();
    }, []);

    return { loading, agentStats, userStats, globalStats, refresh: fetchAnalytics };
};
