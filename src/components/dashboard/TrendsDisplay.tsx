import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Activity } from 'lucide-react';
import clsx from 'clsx';
import type { Match } from '../../types';

export const TrendsDisplay = ({ eventId }: { eventId?: string }) => {
    const [matches, setMatches] = useState<Match[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!eventId) return; // Don't fetch if no event context (or handle 'all' if needed, but per request we want isolation)

        fetchHistory();

        const channel = supabase
            .channel(`trends-history-${eventId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'matches',
                filter: `event_id=eq.${eventId}`
            }, () => fetchHistory())
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [eventId]);

    const fetchHistory = async () => {
        let query = supabase
            .from('matches')
            .select('*')
            .in('status', ['finished', 'cancelled'])
            .order('created_at', { ascending: false })
            .limit(100);

        if (eventId) {
            query = query.eq('event_id', eventId);
        }

        const { data } = await query;

        if (data) {
            // Reverse to chronological order (oldest to newest) for proper road generation
            setMatches((data as Match[]).reverse());
        }
        setLoading(false);
    };

    // --- Statistics ---
    const stats = useMemo(() => {
        return matches.reduce((acc, curr) => {
            if (curr.status === 'cancelled') acc.cancelled++;
            else if (curr.winner === 'meron') acc.meron++;
            else if (curr.winner === 'wala') acc.wala++;
            else if (curr.winner === 'draw') acc.draw++;
            return acc;
        }, { meron: 0, wala: 0, draw: 0, cancelled: 0, total: matches.length });
    }, [matches]);

    // --- Bead Road Logic ---
    // Simple 6-row grid, filling columns top-down, left-right.
    const renderBeadRoad = () => {
        // We only show the last N items that fit, or scroll. Let's make it horizontal scrollable.
        // For a grid in standard road map, it's usually fixed height (6 rows).

        return (
            <div className="grid grid-rows-6 grid-flow-col gap-1 auto-cols-max">
                {matches.map((match) => {
                    const isCancelled = match.status === 'cancelled';
                    return (
                        <div key={match.id} className="w-6 h-6 flex items-center justify-center">
                            <div className={clsx(
                                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shadow-sm",
                                isCancelled ? "bg-gray-500 text-white" :
                                    match.winner === 'meron' ? "bg-red-500 text-white" :
                                        match.winner === 'wala' ? "bg-blue-500 text-white" :
                                            "bg-green-500 text-white"
                            )}>
                                {isCancelled ? 'C' : (match.winner === 'meron' ? 'M' : match.winner === 'wala' ? 'W' : 'D')}
                            </div>
                        </div>
                    );
                })}
                {/* Fillers to maintain grid shape if few matches */}
                {Array.from({ length: Math.max(0, 60 - matches.length) }).map((_, i) => (
                    <div key={`empty-${i}`} className="w-6 h-6 flex items-center justify-center">
                        <div className="w-5 h-5 rounded-full bg-white/5 border border-white/5"></div>
                    </div>
                ))}
            </div>
        );
    };

    // --- Big Road Logic (Simplified) ---
    // Columns track current streak. New column when winner changes.
    // Draws usually don't change column in standard Baccarat rules (they add a line), 
    // but for simplicity here we'll treat them as a result or ignore them for streaks.
    // Let's treat Draw as its own streak for now to simplify visualization for Sabong users.
    const bigRoadColumns = useMemo(() => {
        const columns: Match[][] = [];
        let currentCol: Match[] = [];
        let lastWinner: string | null = null;

        matches.forEach((match) => {
            // Determine "result type" for the road
            // If cancelled, we treat it as its own type 'cancelled'
            const resultType = match.status === 'cancelled' ? 'cancelled' : match.winner;

            // Skip if no winner and not cancelled
            if (!resultType) return;

            if (currentCol.length === 0) {
                currentCol.push(match);
                lastWinner = resultType;
            } else {
                if (resultType === lastWinner) {
                    // Check max height (usually 6). If full, we "dragon tail" right... 
                    // For CSS Grid simplicity, let's just create a new column if > 6?
                    // Or let layout handle overflow. Let's stack up to 6 then simple-wrap (simplification).
                    if (currentCol.length < 6) {
                        currentCol.push(match);
                    } else {
                        // In a real road map this turns right. simplified: just start new col with same color?
                        // No, let's just cap at 6 for this version to keep UI clean, 
                        // or better yet, proper standard is "dragon tail".
                        // Let's stick to strict vertical stacking for now: Trigger new column if different.
                        // If same and full, technically it wraps right. We'll simplify: just push to new column but keep tracking same winner?
                        // Actually, easiest valid simplified version: Always new col if diff. Stack if same. 
                        // If stack > 6, just visually truncate or squish (CSS Flex).
                        currentCol.push(match);
                    }
                } else {
                    columns.push(currentCol);
                    currentCol = [match];
                    lastWinner = resultType;
                }
            }
        });
        if (currentCol.length > 0) columns.push(currentCol);

        return columns;
    }, [matches]);

    return (
        <div className="mt-4 space-y-4">
            {loading ? (
                <div className="text-center py-4 text-xs text-casino-slate-500 animate-pulse">Loading trends...</div>
            ) : (
                <>
                    {/* Header: Trends Label & Stats */}
                    <div className="bg-[#1a2c38] rounded-t-xl p-3 border-b border-white/10 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Activity size={16} className="text-blue-400" />
                            <span className="text-sm font-bold text-white uppercase tracking-wider">Trends</span>
                        </div>
                        {/* Stats Bubbles */}
                        <div className="flex gap-4">
                            <div className="flex flex-col items-center">
                                <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white font-black text-xs shadow-lg shadow-red-900/50 mb-1">
                                    {stats.meron}
                                </div>
                                <span className="text-[9px] font-bold text-casino-slate-400 uppercase tracking-wider">Meron</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-black text-xs shadow-lg shadow-blue-900/50 mb-1">
                                    {stats.wala}
                                </div>
                                <span className="text-[9px] font-bold text-casino-slate-400 uppercase tracking-wider">Wala</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-black text-xs shadow-lg shadow-green-900/50 mb-1">
                                    {stats.draw}
                                </div>
                                <span className="text-[9px] font-bold text-casino-slate-400 uppercase tracking-wider">Draw</span>
                            </div>
                            {/* NEW: Cancelled Stat */}
                            {stats.cancelled > 0 && (
                                <div className="flex flex-col items-center">
                                    <div className="w-8 h-8 rounded-full bg-gray-500 flex items-center justify-center text-white font-black text-xs shadow-lg shadow-gray-900/50 mb-1">
                                        {stats.cancelled}
                                    </div>
                                    <span className="text-[9px] font-bold text-casino-slate-400 uppercase tracking-wider">Cncl</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Roads Container */}
                    <div className="bg-[#111] p-4 rounded-b-xl border border-[#1a2c38] space-y-6">

                        {/* Bead Road (Scrollable) */}
                        <div className="overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                            {renderBeadRoad()}
                        </div>

                        {/* Divider */}
                        <div className="h-px bg-white/5 w-full"></div>

                        {/* Big Road (Scrollable) */}
                        <div className="overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent min-h-[160px]">
                            <div className="flex gap-1 h-36">
                                {bigRoadColumns.map((col, i) => (
                                    <div key={i} className="flex flex-col gap-1 w-6 min-w-[24px]">
                                        {col.map((match, j) => {
                                            const isCancelled = match.status === 'cancelled';
                                            return (
                                                <div key={`${match.id}-${j}`} className="w-6 h-6 flex items-center justify-center">
                                                    <div className={clsx(
                                                        "w-5 h-5 rounded-full border-2 flex items-center justify-center text-[8px] font-black bg-transparent",
                                                        isCancelled ? "border-gray-500 text-gray-500" :
                                                            match.winner === 'meron' ? "border-red-500 text-red-500" :
                                                                match.winner === 'wala' ? "border-blue-500 text-blue-500" :
                                                                    "border-green-500 text-green-500"
                                                    )}>
                                                        {/* Big Road usually just hollow circles */}
                                                        {isCancelled && <div className="w-1 h-1 rounded-full bg-gray-500"></div>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                                {/* Fillers */}
                                {Array.from({ length: Math.max(0, 20 - bigRoadColumns.length) }).map((_, i) => (
                                    <div key={`empty-big-${i}`} className="w-6 min-w-[24px] h-full bg-white/[0.02]"></div>
                                ))}
                            </div>
                        </div>
                    </div>                </>
            )}
        </div>
    );
};
