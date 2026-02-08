import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import type { Bet } from '../../types';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

interface BettingHistoryTableProps {
    userId?: string;
    limit?: number;
}

export const BettingHistoryTable = ({ userId, limit = 20 }: BettingHistoryTableProps) => {
    const { session } = useAuthStore();
    const [bets, setBets] = useState<Bet[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const targetUserId = userId || session?.user.id;

    useEffect(() => {
        if (targetUserId) {
            fetchBets();

            const channel = supabase
                .channel('wallet-betting-history')
                .on('postgres_changes', {
                    event: 'UPDATE', // Listen for status updates (win/loss)
                    schema: 'public',
                    table: 'bets',
                    filter: `user_id=eq.${targetUserId}`
                }, () => fetchBets())
                .on('postgres_changes', {
                    event: 'INSERT', // Listen for new bets
                    schema: 'public',
                    table: 'bets',
                    filter: `user_id=eq.${targetUserId}`
                }, () => fetchBets())
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [targetUserId]);

    const fetchBets = async () => {
        try {
            setLoading(true);
            setError(null);
            const { data, error } = await supabase
                .from('bets')
                .select(`
                    *,
                    match:matches!match_id(meron_name, wala_name, winner, status)
                `)
                .eq('user_id', targetUserId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            if (data) setBets(data as any);
        } catch (err: any) {
            console.error('Error fetching bets:', err);
            setError(err.message || 'Failed to load betting history');
        } finally {
            setLoading(false);
        }
    };

    if (loading && bets.length === 0) {
        return (
            <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 text-casino-gold-400 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center bg-red-500/10 rounded-xl border border-red-500/20">
                <p className="text-red-400 text-sm font-bold mb-2">Failed to load betting history</p>
                <p className="text-xs text-neutral-400 mb-4">{error}</p>
                <button
                    onClick={() => fetchBets()}
                    className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-xs font-bold text-white transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead className="bg-[#111] text-neutral-500 text-xs uppercase tracking-widest">
                    <tr>
                        <th className="p-4">Event/Match</th>
                        <th className="p-4">Selection</th>
                        <th className="p-4">Amount</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Date</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-neutral-700">
                    {bets.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="p-8 text-center text-neutral-500">No betting history found.</td>
                        </tr>
                    ) : (
                        bets.map((bet: any) => (
                            <tr key={bet.id} className="hover:bg-neutral-700/30 transition-colors">
                                <td className="p-4">
                                    <div className="flex flex-col">
                                        <span className="text-white font-bold text-sm">
                                            {bet.match?.meron_name} vs {bet.match?.wala_name}
                                        </span>
                                        <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                                            Match ID: {bet.match_id?.slice(0, 8)}...
                                        </span>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <span className={clsx(
                                        "px-2 py-1 rounded text-[10px] font-black uppercase",
                                        bet.selection === 'meron' ? "bg-red-500/10 text-red-500" :
                                            bet.selection === 'wala' ? "bg-blue-500/10 text-blue-500" :
                                                "bg-yellow-500/10 text-yellow-500"
                                    )}>
                                        {bet.selection}
                                    </span>
                                </td>
                                <td className="p-4 font-mono font-bold text-white">₱ {bet.amount.toLocaleString()}</td>
                                <td className="p-4">
                                    <span className={clsx(
                                        "font-bold text-xs uppercase",
                                        bet.status === 'won' ? "text-green-500" :
                                            bet.status === 'lost' ? "text-red-500" :
                                                bet.status === 'cancelled' ? "text-neutral-400" :
                                                    "text-yellow-500"
                                    )}>
                                        {bet.status}
                                        {bet.status === 'won' && bet.payout > 0 && (
                                            <span className="block text-[10px] text-green-400 opacity-80 decoration-slice">
                                                +₱ {bet.payout.toLocaleString()}
                                            </span>
                                        )}
                                    </span>
                                </td>
                                <td className="p-4 text-xs text-neutral-500">
                                    {new Date(bet.created_at).toLocaleDateString()} {new Date(bet.created_at).toLocaleTimeString()}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
};
