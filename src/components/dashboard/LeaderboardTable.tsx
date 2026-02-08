import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Trophy, Medal, User, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../../lib/store';

interface LeaderboardEntry {
    username: string;
    total_commission: number;
    rank: number;
    role: string;
}

export const LeaderboardTable = () => {
    const { profile } = useAuthStore();
    const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterRole, setFilterRole] = useState<'agent' | 'master_agent'>('agent');

    useEffect(() => {
        fetchLeaderboard();
    }, [filterRole]);

    const fetchLeaderboard = async () => {
        setLoading(true);
        try {
            // Complex aggregation usually needs a View or RPC. 
            // Since we can't easily add Views, we will fetch commissions and aggregate locally (OK for small datasets)
            // OR use a clever query. 
            // Query: Get all commissions where recipient role matches. sum amount. group by recipient.

            // Supabase JS doesn't support complex GROUP BY well without RPC/Views. 
            // Fallback: Fetch all commissions for the role in the last 30 days (limit 1000) and aggregate JS side.
            // Not scalable but works for now. 
            // Better Check: Do we have profiles with 'balance'? NO, balance is wallet. commission is earnings.
            // Let's use RPC if available. If not, fetch commissions.

            // Trying a raw RPC call if user added one? No.
            // Let's fetch profiles of that role, and maybe we can just show "High Rollers" by Balance? 
            // ORIGINAL REQUEST: "Best Agents/Master Agents Commision Earn"
            // So we need Commission Earnings.

            // Scalable approach: Fetch commissions joined with recipient profile, filter by role.
            const { data, error } = await supabase
                .from('commissions')
                .select(`
                    amount,
                    recipient:recipient_id (username, role)
                `)
                .not('recipient_id', 'is', null) // Correct syntax for Not Null
                .limit(2000);

            if (error) throw error;

            if (data) {
                const map: Record<string, { username: string, total: number, role: string }> = {};

                data.forEach((c: any) => {
                    if (!c.recipient) return;
                    if (c.recipient.role !== filterRole) return;

                    const name = c.recipient.username;
                    if (!map[name]) map[name] = { username: name, total: 0, role: c.recipient.role };
                    map[name].total += Number(c.amount);
                });

                const sorted = Object.values(map)
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 10) // Top 10
                    .map((item, index) => ({
                        ...item,
                        rank: index + 1,
                        username: item.username,
                        total_commission: item.total
                    }));

                setEntries(sorted);
            }

        } catch (error) {
            console.error("Error fetching leaderboard:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="glass-panel rounded-2xl overflow-hidden flex flex-col h-full">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                <div>
                    <h3 className="text-white font-bold text-lg flex items-center gap-2">
                        <Trophy className="text-yellow-400" size={20} />
                        Top Earners
                    </h3>
                </div>
                {profile?.role === 'admin' && (
                    <div className="flex bg-neutral-900 rounded-lg p-1 border border-white/10">
                        <button
                            onClick={() => setFilterRole('master_agent')}
                            className={clsx(
                                "px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all",
                                filterRole === 'master_agent' ? "bg-purple-600 text-white shadow" : "text-neutral-500 hover:text-white"
                            )}
                        >
                            Masters
                        </button>
                        <button
                            onClick={() => setFilterRole('agent')}
                            className={clsx(
                                "px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all",
                                filterRole === 'agent' ? "bg-blue-600 text-white shadow" : "text-neutral-500 hover:text-white"
                            )}
                        >
                            Agents
                        </button>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left">
                    <thead className="bg-neutral-900/50 text-[10px] font-black text-neutral-500 uppercase tracking-[0.2em]">
                        <tr>
                            <th className="px-6 py-4">Rank</th>
                            <th className="px-6 py-4">Agent</th>
                            <th className="px-6 py-4 text-right">Commission</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {loading ? (
                            <tr>
                                <td colSpan={3} className="p-8 text-center text-xs text-neutral-500 animate-pulse">Calculating rankings...</td>
                            </tr>
                        ) : entries.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="p-8 text-center text-xs text-neutral-500 italic">No data available yet</td>
                            </tr>
                        ) : (
                            entries.map((entry) => (
                                <tr key={entry.rank} className="hover:bg-white/5 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className={clsx(
                                            "w-8 h-8 rounded-full flex items-center justify-center font-black text-sm",
                                            entry.rank === 1 ? "bg-yellow-400 text-black shadow-lg shadow-yellow-400/20" :
                                                entry.rank === 2 ? "bg-neutral-300 text-black" :
                                                    entry.rank === 3 ? "bg-orange-400 text-black" :
                                                        "bg-neutral-800 text-neutral-500 border border-white/5"
                                        )}>
                                            {entry.rank <= 3 ? <Medal size={16} /> : entry.rank}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-neutral-800 border border-white/10 flex items-center justify-center">
                                                <User size={14} className="text-neutral-400" />
                                            </div>
                                            <span className="font-bold text-white text-sm">{entry.username}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="font-mono font-bold text-casino-gold-400">
                                            ₱ {entry.total_commission.toLocaleString()}
                                        </span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <div className="p-4 border-t border-white/5 bg-white/5 text-center">
                <button className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-white flex items-center justify-center gap-1 mx-auto transition-colors">
                    View Full Rankings <ChevronRight size={12} />
                </button>
            </div>
        </div>
    );
};
