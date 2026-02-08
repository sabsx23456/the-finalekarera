import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { TrendingUp, TrendingDown } from 'lucide-react';
import clsx from 'clsx';

interface TransactionStatsCardProps {
    type: 'cash_in' | 'cash_out';
    title: string;
    userIds?: string[];
}

export const TransactionStatsCard = ({ type, title, userIds }: TransactionStatsCardProps) => {
    const [period, setPeriod] = useState<'yesterday' | 'today' | 'week' | 'month'>('today');
    const [loading, setLoading] = useState(true);
    const [totalAmount, setTotalAmount] = useState(0);
    const [chartData, setChartData] = useState<{ date: string, value: number }[]>([]);

    useEffect(() => {
        // If userIds is provided (even empty), we need to respect it.
        // If it's empty array, it means "no users", so no data.
        if (userIds && userIds.length === 0) {
            setTotalAmount(0);
            setChartData([]);
            setLoading(false);
            return;
        }
        fetchData();
    }, [type, period, userIds]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const now = new Date();
            let startDate = new Date();
            let endDate: Date | null = null;

            // Period Logic
            if (period === 'today') {
                startDate.setHours(0, 0, 0, 0); // Start of Today
            } else if (period === 'yesterday') {
                startDate.setDate(startDate.getDate() - 1);
                startDate.setHours(0, 0, 0, 0);

                endDate = new Date();
                endDate.setDate(endDate.getDate() - 1);
                endDate.setHours(23, 59, 59, 999);
            } else if (period === 'week') {
                startDate.setDate(now.getDate() - 7);
            } else if (period === 'month') {
                startDate.setMonth(now.getMonth() - 1);
            }

            // Map UI types to DB types
            // cash_in -> load (User loading wallet)
            // cash_out -> withdraw (User withdrawing balance)
            const dbType = type === 'cash_in' ? 'load' : (type === 'cash_out' ? 'withdraw' : type);

            let query = supabase
                .from('transactions')
                .select('amount, created_at')
                .eq('type', dbType)
                .gte('created_at', startDate.toISOString());

            if (endDate) {
                query = query.lte('created_at', endDate.toISOString());
            }

            // Filter by specific users if provided (e.g., for Agent view)
            if (userIds && userIds.length > 0) {
                if (type === 'cash_out') {
                    // For Cash Out, the user is the SENDER (sending money out/away)
                    query = query.in('sender_id', userIds);
                } else {
                    // For Cash In, the user is the RECEIVER (receiving money)
                    query = query.in('receiver_id', userIds);
                }
            }

            const { data, error } = await query;

            if (error) throw error;

            if (data) {
                const total = data.reduce((acc, curr) => acc + Number(curr.amount), 0);
                setTotalAmount(total);

                // Group for Chart
                const grouped: Record<string, number> = {};
                data.forEach(item => {
                    const d = new Date(item.created_at);
                    let key = '';

                    if (period === 'today' || period === 'yesterday') {
                        // Hourly grouping for today/yesterday
                        key = d.getHours() + ':00';
                    } else {
                        // Daily grouping for week/month
                        key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }

                    grouped[key] = (grouped[key] || 0) + Number(item.amount);
                });

                const chart = Object.keys(grouped).map(k => ({
                    date: k,
                    value: grouped[k]
                }));

                setChartData(chart);
            }
        } catch (error) {
            console.error("Error fetching stats:", error);
        } finally {
            setLoading(false);
        }
    };

    const isPositive = type === 'cash_in';
    const Icon = isPositive ? TrendingUp : TrendingDown;
    const colorClass = isPositive ? 'text-green-400' : 'text-red-400';
    const bgClass = isPositive ? 'bg-green-500/10' : 'bg-red-500/10';
    const borderClass = isPositive ? 'border-green-500/20' : 'border-red-500/20';

    return (
        <div className={clsx("glass-panel p-6 rounded-2xl relative overflow-hidden group border", borderClass)}>
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="text-white font-bold text-lg flex items-center gap-2">
                        <div className={clsx("p-2 rounded-lg", bgClass)}>
                            <Icon className={colorClass} size={20} />
                        </div>
                        {title}
                    </h3>
                </div>
                <div className="flex bg-neutral-900 rounded-lg p-1 border border-white/10">
                    {(['today', 'yesterday', 'week', 'month'] as const).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={clsx(
                                "px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all",
                                period === p ? "bg-white/10 text-white" : "text-neutral-500 hover:text-white"
                            )}
                        >
                            {p === 'today' ? 'Today' : p === 'yesterday' ? 'Yest' : p}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex items-baseline gap-2 mb-4">
                <span className="text-3xl font-display font-black text-white tracking-tighter">
                    ₱ {totalAmount.toLocaleString()}
                </span>
            </div>

            {/* Simple Visual Representation - Bar/Area */}
            <div className="h-24 w-full flex items-end gap-1">
                {loading ? (
                    <div className="w-full h-full flex items-center justify-center text-xs text-neutral-500 animate-pulse">Scanning transactions...</div>
                ) : chartData.length > 0 ? (
                    chartData.map((d, i) => {
                        const max = Math.max(...chartData.map(c => c.value));
                        const h = (d.value / max) * 100;
                        return (
                            <div key={i} className="flex-1 flex flex-col justify-end group/bar h-full">
                                <div
                                    style={{ height: `${h}%` }}
                                    className={clsx(
                                        "w-full rounded-t-sm opacity-50 hover:opacity-100 transition-all",
                                        isPositive ? "bg-green-500" : "bg-red-500"
                                    )}
                                ></div>
                            </div>
                        )
                    })
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-neutral-600 border border-dashed border-white/5 rounded">No activity</div>
                )}
            </div>
        </div>
    );
};
