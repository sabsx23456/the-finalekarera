import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Swords } from 'lucide-react';
import clsx from 'clsx';

interface BettingStatsCardProps {
    userIds?: string[];
}

export const BettingStatsCard = ({ userIds }: BettingStatsCardProps) => {
    const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ meron: 0, wala: 0, total: 0 });

    useEffect(() => {
        if (userIds && userIds.length === 0) {
            setStats({ meron: 0, wala: 0, total: 0 });
            setLoading(false);
            return;
        }
        fetchData();
    }, [period, userIds]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const now = new Date();
            let startDate = new Date();

            if (period === 'today') {
                startDate.setHours(0, 0, 0, 0);
            } else if (period === 'week') {
                startDate.setDate(now.getDate() - 7);
            } else if (period === 'month') {
                startDate.setMonth(now.getMonth() - 1);
            }

            let query = supabase
                .from('bets')
                .select('amount, selection')
                .gte('created_at', startDate.toISOString())
                .neq('status', 'cancelled');

            if (userIds && userIds.length > 0) {
                query = query.in('user_id', userIds);
            }

            const { data, error } = await query;
            if (error) throw error;

            if (data) {
                const meron = data
                    .filter(b => b.selection === 'meron')
                    .reduce((sum, b) => sum + Number(b.amount), 0);

                const wala = data
                    .filter(b => b.selection === 'wala')
                    .reduce((sum, b) => sum + Number(b.amount), 0);

                setStats({ meron, wala, total: meron + wala });
            }
        } catch (error) {
            console.error("Error fetching betting stats:", error);
        } finally {
            setLoading(false);
        }
    };

    const meronPercent = stats.total > 0 ? (stats.meron / stats.total) * 100 : 0;
    const walaPercent = stats.total > 0 ? (stats.wala / stats.total) * 100 : 0;

    return (
        <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group border border-blue-500/20">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="text-white font-bold text-lg flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-blue-500/10">
                            <Swords className="text-blue-400" size={20} />
                        </div>
                        Player Bets
                    </h3>
                </div>
                <div className="flex bg-neutral-900 rounded-lg p-1 border border-white/10">
                    {(['today', 'week', 'month'] as const).map((p) => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={clsx(
                                "px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all",
                                period === p ? "bg-white/10 text-white" : "text-neutral-500 hover:text-white"
                            )}
                        >
                            {p === 'today' ? 'Today' : p}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex items-end justify-between mb-2">
                <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-1">Meron</div>
                    <div className="text-2xl font-display font-black text-white">₱ {stats.meron.toLocaleString()}</div>
                </div>
                <div className="text-right">
                    <div className="text-[10px] font-black uppercase tracking-widest text-blue-500 mb-1">Wala</div>
                    <div className="text-2xl font-display font-black text-white">₱ {stats.wala.toLocaleString()}</div>
                </div>
            </div>

            {/* Bet Bar */}
            <div className="h-4 w-full bg-neutral-800 rounded-full overflow-hidden flex relative">
                {loading ? (
                    <div className="w-full h-full bg-neutral-800 animate-pulse" />
                ) : stats.total === 0 ? (
                    <div className="w-full h-full bg-neutral-800 flex items-center justify-center text-[10px] text-neutral-500">
                        No bets placed
                    </div>
                ) : (
                    <>
                        <div style={{ width: `${meronPercent}%` }} className="h-full bg-gradient-to-r from-red-600 to-red-500 transition-all duration-500 relative group">
                            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div style={{ width: `${walaPercent}%` }} className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 relative group">
                            <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    </>
                )}
            </div>

            <div className="flex justify-between mt-2 text-[10px] font-bold text-neutral-500">
                <span>{Math.round(meronPercent)}%</span>
                <span>{Math.round(walaPercent)}%</span>
            </div>
        </div>
    );
};
