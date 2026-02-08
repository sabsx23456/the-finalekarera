
import { DollarSign, Landmark, Percent } from 'lucide-react';
import type { GlobalAnalytics } from '../../hooks/useAnalytics';

interface ProfitAnalyticsProps {
    data: GlobalAnalytics;
}

export const ProfitAnalytics = ({ data }: ProfitAnalyticsProps) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-panel p-6 rounded-2xl border-l-4 border-l-green-500">
                <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-green-500/10 rounded-xl">
                        <DollarSign className="w-6 h-6 text-green-400" />
                    </div>
                </div>
                <p className="text-sm text-casino-slate-400 font-medium uppercase tracking-wider">Gross Profit</p>
                <h3 className="text-2xl font-black text-white mt-1">₱{data.totalProfit.toLocaleString()}</h3>
                <p className="text-[10px] text-casino-slate-500 mt-2">Total Wagered - Payouts</p>
            </div>

            <div className="glass-panel p-6 rounded-2xl border-l-4 border-l-blue-500">
                <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-blue-500/10 rounded-xl">
                        <Percent className="w-6 h-6 text-blue-400" />
                    </div>
                </div>
                <p className="text-sm text-casino-slate-400 font-medium uppercase tracking-wider">Total Commissions</p>
                <h3 className="text-2xl font-black text-white mt-1">₱{data.totalCommission.toLocaleString()}</h3>
                <p className="text-[10px] text-casino-slate-500 mt-2">Paid to agents/loaders</p>
            </div>

            <div className="glass-panel p-6 rounded-2xl border-l-4 border-l-yellow-500 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-500/10 blur-3xl rounded-full translate-x-10 -translate-y-10" />
                <div className="flex items-center justify-between mb-4 relative z-10">
                    <div className="p-3 bg-yellow-500/10 rounded-xl">
                        <Landmark className="w-6 h-6 text-yellow-400" />
                    </div>
                </div>
                <p className="text-sm text-casino-slate-400 font-medium uppercase tracking-wider relative z-10">Net House Earnings</p>
                <h3 className="text-2xl font-black text-white mt-1 relative z-10">₱{data.houseEarnings.toLocaleString()}</h3>
                <p className="text-[10px] text-casino-slate-500 mt-2 relative z-10">Realized Profit</p>
            </div>
        </div>
    );
};
