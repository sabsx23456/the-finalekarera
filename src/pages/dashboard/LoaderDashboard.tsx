import { useState } from 'react';
import { useAuthStore } from '../../lib/store';
import { Wallet, Send, Search, History, ReceiptText } from 'lucide-react';
import { LiveMatchBanner } from '../../components/dashboard/LiveMatchBanner';

export const LoaderDashboard = () => {
    const { profile } = useAuthStore();
    const [stats] = useState({ totalLoaded: 125000, todayTransactions: 8 });

    return (
        <div className="space-y-3 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-casino-gold-500" />
                <h1 className="text-lg font-bold text-white">Loader Portal</h1>
            </div>

            {/* Live Match Banner */}
            <LiveMatchBanner />

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2">
                <div className="glass-panel p-3 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="p-1.5 bg-casino-gold-500/10 rounded-md">
                            <Wallet className="w-3.5 h-3.5 text-casino-gold-500" />
                        </div>
                        <span className="text-[10px] text-casino-slate-500 uppercase font-semibold">Balance</span>
                    </div>
                    <p className="text-lg font-bold text-white">₱{profile?.balance?.toLocaleString() || '0'}</p>
                </div>

                <div className="glass-panel p-3 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="p-1.5 bg-blue-500/10 rounded-md">
                            <ReceiptText className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                        <span className="text-[10px] text-casino-slate-500 uppercase font-semibold">Distributed</span>
                    </div>
                    <p className="text-lg font-bold text-white">₱{stats.totalLoaded.toLocaleString()}</p>
                </div>

                <div className="glass-panel p-3 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="p-1.5 bg-green-500/10 rounded-md">
                            <History className="w-3.5 h-3.5 text-green-400" />
                        </div>
                        <span className="text-[10px] text-casino-slate-500 uppercase font-semibold">Today</span>
                    </div>
                    <p className="text-lg font-bold text-white">{stats.todayTransactions}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Transfer Card */}
                <div className="glass-panel p-4 rounded-xl border-white/5">
                    <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                        <Send size={16} className="text-casino-gold-500" />
                        Fund Account
                    </h2>

                    <form className="space-y-3">
                        <div>
                            <label className="text-[10px] font-semibold text-casino-slate-500 uppercase ml-1">Recipient</label>
                            <div className="relative mt-1">
                                <input
                                    type="text"
                                    className="w-full bg-casino-dark-850 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-casino-gold-500/50 outline-none pr-10"
                                    placeholder="Username or User ID"
                                />
                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <Search size={14} className="text-casino-slate-500" />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-semibold text-casino-slate-500 uppercase ml-1">Amount (₱)</label>
                            <input
                                type="number"
                                className="w-full bg-casino-dark-850 border border-white/10 rounded-lg px-3 py-2 text-lg font-bold text-white focus:border-casino-gold-500/50 outline-none mt-1"
                                placeholder="0.00"
                            />
                        </div>

                        <button
                            type="button"
                            className="w-full btn-casino-primary py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2"
                        >
                            <Send size={14} />
                            Execute Transfer
                        </button>
                    </form>

                    <div className="mt-3 p-2 bg-casino-dark-850 rounded-lg border border-white/5">
                        <p className="text-[10px] text-casino-slate-500 leading-relaxed">
                            Ensure the recipient username is correct. Transfers are irreversible.
                        </p>
                    </div>
                </div>

                {/* Recent Deliveries */}
                <div className="glass-panel p-4 rounded-xl">
                    <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                        <History size={16} className="text-casino-gold-500" />
                        Recent Deliveries
                    </h2>

                    <div className="space-y-2">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="flex items-center justify-between p-2 bg-casino-dark-850 rounded-lg border border-white/5">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-casino-dark-800 flex items-center justify-center text-casino-gold-500 font-bold text-xs border border-white/5">
                                        {String.fromCharCode(64 + i)}
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-white">Player_{i * 243}</p>
                                        <p className="text-[10px] text-casino-slate-500">2h ago</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-bold text-white">₱{(i * 500).toLocaleString()}</p>
                                    <p className="text-[10px] text-green-500 font-semibold">Done</p>
                                </div>
                            </div>
                        ))}

                        <button className="w-full py-2 text-[10px] font-semibold text-casino-slate-500 hover:text-white transition-colors uppercase tracking-wide">
                            View All History
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
