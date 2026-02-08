import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { logAdminAction } from '../../lib/adminLogger';
import { Clock, Check, X, Image as ImageIcon } from 'lucide-react';
import clsx from 'clsx';
import type { TransactionRequest } from '../../types';

interface IncomingRequestsTableProps {
    refreshTrigger?: number;
}

export const IncomingRequestsTable = ({ refreshTrigger }: IncomingRequestsTableProps) => {
    const { session, profile } = useAuthStore();
    const [requests, setRequests] = useState<TransactionRequest[]>([]);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [viewProof, setViewProof] = useState<string | null>(null);

    useEffect(() => {
        if (session?.user.id && profile) {
            fetchPendingRequests();

            const filter = profile.role === 'admin'
                ? undefined
                : `upline_id=eq.${session.user.id}`;

            const channel = supabase
                .channel(`incoming-requests-${session.user.id}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'transaction_requests',
                    filter: filter
                }, () => {
                    fetchPendingRequests();
                })
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [session, profile, refreshTrigger]);

    const fetchPendingRequests = async () => {
        let query = supabase
            .from('transaction_requests')
            .select('*, profiles!user_id(username)')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        // If NOT admin, filter by upline_id to only show own downline requests
        if (profile?.role !== 'admin') {
            query = query.eq('upline_id', session?.user.id);
        }

        const { data } = await query;
        if (data) setRequests(data);
    };

    const handleAction = async (req: TransactionRequest, status: 'approved' | 'rejected') => {
        setActionLoading(req.id);
        try {
            // 1. Update Request Status directly (Trigger handles the balance)
            const { error } = await supabase
                .from('transaction_requests')
                .update({ status })
                .eq('id', req.id);

            if (error) throw error;

            // 2. [FIX] Create Transaction Record for Analytics & History
            // Triggers might handle balance, but we need a clear record in 'transactions' for analytics (TransactionStatsCard)
            if (status === 'approved') {
                // Match the DB enum `transaction_type` (see Supabase): load | withdraw | transfer | ...
                const txType = req.type === 'cash_in' ? 'load' : 'withdraw';
                const transactionData = {
                    type: txType,
                    amount: req.amount,
                    // For Cash In: Sender is Approver (Upline/Admin), Receiver is User
                    // For Cash Out: Sender is User, Receiver is Approver (Upline/Admin)
                    sender_id: req.type === 'cash_in' ? session?.user.id : req.user_id,
                    receiver_id: req.type === 'cash_in' ? req.user_id : session?.user.id,
                };

                const { error: txError } = await supabase
                    .from('transactions')
                    .insert(transactionData);

                if (txError) console.error('Error creating transaction record:', txError);
            }

            const actionType = `${status === 'approved' ? 'APPROVE' : 'REJECT'}_${req.type.toUpperCase()}`;

            await logAdminAction({
                actionType,
                targetId: req.user_id ?? undefined,
                targetName: req.profiles?.username ?? req.user_id ?? undefined,
                details: {
                    requestId: req.id,
                    requestType: req.type,
                    amount: req.amount,
                    paymentMethod: req.payment_method ?? null,
                    proofUrl: req.proof_url ?? null,
                    userId: req.user_id ?? null,
                    uplineId: req.upline_id ?? null,
                    accountName: req.account_name ?? null,
                    accountNumber: req.account_number ?? null,
                    walletAddress: req.wallet_address ?? null,
                    chain: req.chain ?? null,
                    convertedAmount: req.converted_amount ?? null,
                    exchangeRate: req.exchange_rate ?? null,
                    previousStatus: req.status ?? 'pending',
                    newStatus: status,
                    approvedBy: session?.user.id ?? null
                }
            });

            fetchPendingRequests();
            // Refresh own profile in case we approved our own request (unlikely but possible for testing)
            useAuthStore.getState().refreshProfile();

        } catch (err: any) {
            console.error('Action error full object:', err);
            const msg = err.message || err.details || err.hint || JSON.stringify(err);
            alert(`Action failed: ${msg}`);
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-white font-display font-black text-xl uppercase tracking-wider flex items-center gap-3">
                <Clock size={20} className="text-casino-gold-400" />
                Transaction Queue
            </h2>

            <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-black/20 text-casino-slate-500 text-[10px] uppercase font-black tracking-[0.15em]">
                            <tr>
                                <th className="p-6">Player</th>
                                <th className="p-6">Type</th>
                                <th className="p-6">Method</th>
                                <th className="p-6">Amount</th>
                                <th className="p-6">Proof</th>
                                <th className="p-6 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {requests.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center text-casino-slate-600 font-medium italic">Queue is clear.</td>
                                </tr>
                            ) : (
                                requests.map((req) => (
                                    <tr key={req.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="p-6 font-bold text-white">{req.profiles?.username || 'Unknown'}</td>
                                        <td className="p-6">
                                            <div className={clsx(
                                                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider",
                                                req.type === 'cash_in' ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"
                                            )}>
                                                {req.type.replace('_', ' ')}
                                            </div>
                                        </td>
                                        <td className="p-6 text-sm font-bold text-casino-slate-300 uppercase">
                                            {req.payment_method || 'N/A'}
                                        </td>
                                        <td className="p-6 font-display font-black text-casino-gold-400 text-lg">₱ {req.amount.toLocaleString()}</td>
                                        <td className="p-6">
                                            {req.proof_url ? (
                                                <button
                                                    onClick={() => setViewProof(req.proof_url!)}
                                                    className="flex items-center gap-2 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors"
                                                >
                                                    <ImageIcon size={16} />
                                                    View
                                                </button>
                                            ) : (
                                                <span className="text-casino-slate-600 text-xs italic">No Proof</span>
                                            )}
                                        </td>
                                        <td className="p-6 text-right">
                                            <div className="flex items-center justify-end gap-3">
                                                <button
                                                    onClick={() => handleAction(req, 'approved')}
                                                    disabled={!!actionLoading}
                                                    className="bg-green-500/10 text-green-500 hover:bg-green-500 hover:text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all active:scale-95 border border-green-500/20 flex items-center gap-2"
                                                >
                                                    {actionLoading === req.id ? '...' : <><Check size={14} /> Accept</>}
                                                </button>
                                                <button
                                                    onClick={() => handleAction(req, 'rejected')}
                                                    disabled={!!actionLoading}
                                                    className="bg-white/5 text-casino-slate-400 hover:text-red-400 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all active:scale-95 flex items-center gap-2"
                                                >
                                                    <X size={14} /> Decline
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Proof Modal */}
            {viewProof && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4" onClick={() => setViewProof(null)}>
                    <div className="relative max-w-4xl max-h-[90vh] overflow-auto rounded-2xl border border-white/20 shadow-2xl">
                        <img src={viewProof} alt="Payment Proof" className="w-full h-auto" />
                        <button
                            className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-full hover:bg-black/80 transition-colors"
                            onClick={() => setViewProof(null)}
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
