import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import type { Transaction } from '../../types';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

interface TransactionHistoryTableProps {
    userId?: string;
    limit?: number;
}

export const TransactionHistoryTable = ({ userId, limit = 20 }: TransactionHistoryTableProps) => {
    const { session } = useAuthStore();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const targetUserId = userId || session?.user.id;

    useEffect(() => {
        if (targetUserId) {
            fetchTransactions();

            const channel = supabase
                .channel('wallet-transactions-history')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'transactions',
                    filter: `receiver_id=eq.${targetUserId}`
                }, () => fetchTransactions())
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'transactions',
                    filter: `sender_id=eq.${targetUserId}`
                }, () => fetchTransactions())
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [targetUserId]);

    const fetchTransactions = async () => {
        try {
            setLoading(true);
            setError(null);

            // First try with relations
            const { data, error: fetchError } = await supabase
                .from('transactions')
                .select(`
                    *,
                    sender:profiles!sender_id(username),
                    receiver:profiles!receiver_id(username)
                `)
                .or(`sender_id.eq.${targetUserId},receiver_id.eq.${targetUserId}`)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (fetchError) {
                console.warn("Fetch with relations failed, trying simple fetch:", fetchError);
                // Fallback: Fetch without relations (in case RLS blocks profile access)
                const { data: simpleData, error: simpleError } = await supabase
                    .from('transactions')
                    .select('*')
                    .or(`sender_id.eq.${targetUserId},receiver_id.eq.${targetUserId}`)
                    .order('created_at', { ascending: false })
                    .limit(limit);

                if (simpleError) throw simpleError;
                if (simpleData) setTransactions(simpleData as any);
            } else {
                if (data) setTransactions(data as any);
            }
        } catch (err: any) {
            console.error('Error fetching transactions:', err);
            setError(err.message || 'Failed to load history');
        } finally {
            setLoading(false);
        }
    };

    if (loading && transactions.length === 0) {
        return (
            <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 text-casino-gold-400 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center bg-red-500/10 rounded-xl border border-red-500/20">
                <p className="text-red-400 text-sm font-bold mb-2">Failed to load transactions</p>
                <p className="text-xs text-neutral-400 mb-4">{error}</p>
                <button
                    onClick={() => fetchTransactions()}
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
                        <th className="p-4">Type</th>
                        <th className="p-4">Amount</th>
                        <th className="p-4">Ending Bal.</th>
                        <th className="p-4">From/To</th>
                        <th className="p-4">Date</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-neutral-700">
                    {transactions.length === 0 ? (
                        <tr>
                            <td colSpan={4} className="p-8 text-center text-neutral-500">
                                <div className="flex flex-col items-center gap-2">
                                    <p>No successful transactions found.</p>
                                    <p className="text-xs text-neutral-600">
                                        Note: "Pending Requests" are not transactions yet.
                                        They must be approved by an upline first.
                                    </p>
                                </div>
                            </td>
                        </tr>
                    ) : (
                        transactions.map((tx) => (
                            <tr key={tx.id} className="hover:bg-neutral-700/30 transition-colors">
                                <td className="p-4">
                                    <span className={clsx(
                                        "px-2 py-1 rounded text-[10px] font-black uppercase",
                                        tx.type === 'load' ? "bg-green-500/10 text-green-500" :
                                            tx.type === 'withdraw' ? "bg-red-500/10 text-red-500" :
                                                tx.type === 'transfer' ? "bg-blue-500/10 text-blue-500" :
                                                    tx.type === 'bet' ? "bg-orange-500/10 text-orange-500" :
                                                        tx.type === 'win' ? "bg-yellow-500/10 text-yellow-500" :
                                                            "bg-neutral-500/10 text-neutral-400"
                                    )}>
                                        {tx.type === 'load' ? 'Balance Load' :
                                            tx.type === 'withdraw' ? 'Cash Out' :
                                                tx.type === 'transfer' ? 'Transfer' :
                                                    tx.type === 'bet' ? 'Match Bet' :
                                                        tx.type === 'win' ? 'Match Win' :
                                                            tx.type.replace('_', ' ')}
                                    </span>
                                </td>
                                <td className="p-4 font-mono font-bold text-white">₱ {tx.amount.toLocaleString()}</td>
                                <td className="p-4 font-mono text-xs text-neutral-400">
                                    {/* Using 'balance_after' if it exists, otherwise showing '-' */}
                                    {(tx as any).balance_after !== undefined && (tx as any).balance_after !== null
                                        ? `₱ ${Number((tx as any).balance_after).toLocaleString()}`
                                        : '-'
                                    }
                                </td>
                                <td className="p-4 text-xs text-neutral-400 font-medium">
                                    {tx.type === 'transfer' ? (
                                        tx.sender_id === targetUserId ? (
                                            <span className="flex flex-col">
                                                <span className="text-red-400/80">To {tx.receiver?.username || 'User'}</span>
                                                <span className="text-[9px] opacity-50 uppercase">Outgoing</span>
                                            </span>
                                        ) : (
                                            <span className="flex flex-col">
                                                <span className="text-green-400/80">From {tx.sender?.username || 'User'}</span>
                                                <span className="text-[9px] opacity-50 uppercase">Incoming</span>
                                            </span>
                                        )
                                    ) : tx.type === 'load' ? (
                                        <span className="flex flex-col">
                                            <span className="text-green-400/80">From {tx.sender?.username || 'Admin'}</span>
                                            <span className="text-[9px] opacity-50 uppercase">Balance Load</span>
                                        </span>
                                    ) : tx.type === 'withdraw' ? (
                                        <span className="flex flex-col">
                                            <span className="text-red-400/80">To {tx.receiver?.username || 'Admin'}</span>
                                            <span className="text-[9px] opacity-50 uppercase">Cash Out</span>
                                        </span>
                                    ) : tx.type === 'bet' ? (
                                        <span className="text-orange-400/60 font-bold uppercase tracking-tighter italic">Match Bet</span>
                                    ) : tx.type === 'win' ? (
                                        <span className="text-yellow-400/60 font-bold uppercase tracking-tighter italic">Match Win</span>
                                    ) : (
                                        <span className="opacity-50 italic">System Event</span>
                                    )}
                                </td>
                                <td className="p-4 text-xs text-neutral-500">
                                    {new Date(tx.created_at).toLocaleDateString()} {new Date(tx.created_at).toLocaleTimeString()}
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
};
