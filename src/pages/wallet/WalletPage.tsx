import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { Wallet, Plus, Minus, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { TransactionHistoryTable } from '../../components/wallet/TransactionHistoryTable';
import { BettingHistoryTable } from '../../components/wallet/BettingHistoryTable';
import clsx from 'clsx';
import type { TransactionRequest } from '../../types';
import { CashInModal } from '../../components/modals/CashInModal';
import { CashOutModal } from '../../components/modals/CashOutModal';

export const WalletPage = () => {
    const { session, profile } = useAuthStore();
    const [requests, setRequests] = useState<TransactionRequest[]>([]);
    const [activeTab, setActiveTab] = useState<'requests' | 'history' | 'bets'>('requests');
    const [isCashInModalOpen, setIsCashInModalOpen] = useState(false);
    const [isCashOutModalOpen, setIsCashOutModalOpen] = useState(false);

    useEffect(() => {
        if (session?.user.id) {
            fetchRequests();
            const requestsChannel = supabase
                .channel('wallet-requests')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'transaction_requests', filter: `user_id=eq.${session.user.id}` }, () => fetchRequests())
                .subscribe();
            return () => { supabase.removeChannel(requestsChannel); };
        }
    }, [session]);

    const fetchRequests = async () => {
        if (!session?.user.id) return;
        const { data } = await supabase
            .from('transaction_requests')
            .select('*')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });
        if (data) setRequests(data);
    };

    return (
        <div className="space-y-3 max-w-4xl mx-auto">
            {/* Header & Balance */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-casino-gold-500" />
                    <h1 className="text-lg font-bold text-white">Wallet</h1>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-casino-slate-500 uppercase">Balance</p>
                    <p className="text-xl font-bold text-white">₱ {profile?.balance?.toLocaleString() || '0.00'}</p>
                </div>
            </div>

            {/* Cash In/Out Buttons */}
            <div className="grid grid-cols-2 gap-3">
                <button
                    onClick={() => setIsCashInModalOpen(true)}
                    className="flex flex-col items-center justify-center gap-1 py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-bold uppercase tracking-wide transition-all active:scale-95"
                >
                    <Plus className="w-6 h-6" strokeWidth={3} />
                    Cash In
                </button>
                <button
                    onClick={() => setIsCashOutModalOpen(true)}
                    className="flex flex-col items-center justify-center gap-1 py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold uppercase tracking-wide transition-all active:scale-95"
                >
                    <Minus className="w-6 h-6" strokeWidth={3} />
                    Cash Out
                </button>
            </div>

            {/* Tabs */}
            <div className="flex bg-casino-dark-850 rounded-lg p-1">
                {['requests', 'history', 'bets'].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={clsx(
                            "flex-1 py-2 text-xs font-semibold rounded-md transition-all capitalize",
                            activeTab === tab ? "bg-casino-gold-500 text-casino-dark-950" : "text-casino-slate-400 hover:text-white"
                        )}
                    >
                        {tab === 'requests' ? 'Pending' : tab}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="glass-panel rounded-xl overflow-hidden">
                {activeTab === 'requests' && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-casino-dark-900 text-casino-slate-500 text-[10px] uppercase">
                                <tr>
                                    <th className="p-3">Type</th>
                                    <th className="p-3">Amount</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3 hidden sm:table-cell">Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {requests.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="p-6 text-center text-casino-slate-500 text-sm">No requests found</td>
                                    </tr>
                                ) : (
                                    requests.map((req) => (
                                        <tr key={req.id} className="hover:bg-white/[0.02]">
                                            <td className="p-3">
                                                <span className={clsx(
                                                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                                    req.type === 'cash_in' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                                                )}>
                                                    {req.type.replace('_', ' ')}
                                                </span>
                                            </td>
                                            <td className="p-3 font-mono font-semibold text-white">₱ {req.amount.toLocaleString()}</td>
                                            <td className="p-3">
                                                <span className={clsx(
                                                    "flex items-center gap-1 text-xs",
                                                    req.status === 'pending' ? "text-yellow-500" : req.status === 'approved' ? "text-green-500" : "text-red-500"
                                                )}>
                                                    {req.status === 'pending' && <Clock className="w-3 h-3" />}
                                                    {req.status === 'approved' && <CheckCircle2 className="w-3 h-3" />}
                                                    {req.status === 'rejected' && <XCircle className="w-3 h-3" />}
                                                    {req.status}
                                                </span>
                                            </td>
                                            <td className="p-3 text-xs text-casino-slate-500 hidden sm:table-cell">
                                                {new Date(req.created_at).toLocaleDateString()}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
                {activeTab === 'history' && <TransactionHistoryTable />}
                {activeTab === 'bets' && <BettingHistoryTable />}
            </div>

            <CashInModal isOpen={isCashInModalOpen} onClose={() => setIsCashInModalOpen(false)} onSuccess={fetchRequests} />
            <CashOutModal isOpen={isCashOutModalOpen} onClose={() => setIsCashOutModalOpen(false)} onSuccess={fetchRequests} pendingRequest={requests.some(req => req.type === 'cash_out' && req.status === 'pending')} />
        </div>
    );
};
