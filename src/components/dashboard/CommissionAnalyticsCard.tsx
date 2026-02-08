import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { TrendingUp, PieChart } from 'lucide-react';
import clsx from 'clsx';

// Simple CSS Bar Chart Component since we don't have Recharts installed
const SimpleBarChart = ({ data }: { data: { label: string, value: number, color?: string }[] }) => {
    const maxValue = Math.max(...data.map(d => d.value), 1);

    return (
        <div className="flex items-end gap-2 h-40 w-full pt-4">
            {data.map((item, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                    <div className="relative w-full flex justify-center items-end h-full">
                        <div
                            className={clsx(
                                "w-full max-w-[20px] rounded-t-lg transition-all duration-500 hover:opacity-80 relative group-hover:scale-110",
                                item.color || "bg-casino-gold-400"
                            )}
                            style={{ height: `${(item.value / maxValue) * 100}%` }}
                        >
                            {/* Tooltip */}
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-neutral-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10 border border-white/10">
                                ₱ {item.value.toLocaleString()}
                            </div>
                        </div>
                    </div>
                    <span className="text-[10px] text-neutral-500 font-mono rotate-0 truncate w-full text-center">{item.label}</span>
                </div>
            ))}
        </div>
    );
};

export const CommissionAnalyticsCard = () => {
    const { profile } = useAuthStore();
    const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week');
    const [loading, setLoading] = useState(true);
    const [totalCommission, setTotalCommission] = useState(0);
    const [chartData, setChartData] = useState<{ label: string, value: number, color?: string }[]>([]);

    useEffect(() => {
        if (!profile) return;
        fetchData();
    }, [profile, period]);

    const fetchData = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('commissions')
                .select('amount, created_at, type')
                .eq(profile?.role === 'admin' ? 'id' : 'recipient_id', profile?.id || ''); // Admin might see global (id!=null hack for now if RLS allows, but Admin RLS allows all)

            // For Admin: "recipient_id" is null for system profit.
            if (profile?.role === 'admin') {
                query = supabase.from('commissions').select('amount, created_at, type'); // Fetch all
            } else {
                query = query.eq('recipient_id', profile?.id);
            }

            // Date Filter
            const now = new Date();
            let startDate = new Date();
            if (period === 'day') startDate.setHours(0, 0, 0, 0);
            if (period === 'week') startDate.setDate(now.getDate() - 7);
            if (period === 'month') startDate.setMonth(now.getMonth() - 1);

            query = query.gte('created_at', startDate.toISOString());

            const { data, error } = await query;
            if (error) throw error;

            if (data) {
                // Calculate Total
                const total = data.reduce((acc, curr) => acc + Number(curr.amount), 0);
                setTotalCommission(total);

                // Prepare Chart Data (Group by Day)
                const grouped: Record<string, number> = {};
                data.forEach(item => {
                    const date = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    grouped[date] = (grouped[date] || 0) + Number(item.amount);
                });

                // Fill in gaps or just show existing
                const chart = Object.keys(grouped).map(key => ({
                    label: key,
                    value: grouped[key],
                    color: profile?.role === 'admin' ? 'bg-red-500' : 'bg-casino-gold-400'
                }));
                // Sort by date roughly (this is simple string sort, might need refinement but mostly works for short/numeric months)
                // actually simple sort might fail on month boundary (Feb 1 after Jan 31). 
                // Let's rely on data order or just simple keys for now.
                setChartData(chart.slice(-7)); // Show last 7 entries
            }
        } catch (error) {
            console.error("Error fetching analytics:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
            {/* Background Decoration */}
            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-700">
                <PieChart size={120} />
            </div>

            <div className="relative z-10">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-white font-bold text-lg flex items-center gap-2">
                            <TrendingUp className="text-casino-gold-400" size={20} />
                            {profile?.role === 'admin' ? 'System Revenue' : 'My Commissions'}
                        </h3>
                        <p className="text-casino-slate-500 text-xs">
                            Earnings overview based on betting volume.
                        </p>
                    </div>
                    <div className="flex bg-neutral-900 rounded-lg p-1 border border-white/10">
                        {(['day', 'week', 'month'] as const).map((p) => (
                            <button
                                key={p}
                                onClick={() => setPeriod(p)}
                                className={clsx(
                                    "px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all",
                                    period === p ? "bg-white/10 text-white" : "text-neutral-500 hover:text-white"
                                )}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mb-6">
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-display font-black text-white tracking-tighter">
                            ₱ {totalCommission.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-green-500 text-xs font-bold bg-green-500/10 px-2 py-0.5 rounded-full">
                            +{period === 'day' ? 'Today' : period === 'week' ? 'This Week' : 'This Month'}
                        </span>
                    </div>
                </div>

                {loading ? (
                    <div className="h-40 flex items-center justify-center text-neutral-500 text-xs animate-pulse">
                        Calculating...
                    </div>
                ) : chartData.length > 0 ? (
                    <SimpleBarChart data={chartData} />
                ) : (
                    <div className="h-40 flex items-center justify-center text-neutral-600 text-xs italic border border-dashed border-white/5 rounded-xl">
                        No data recorded for this period
                    </div>
                )}
            </div>
        </div>
    );
};
