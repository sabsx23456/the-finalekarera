import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { Swords, Flame, Trophy, ChevronRight, Gamepad2, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Match } from '../../types';
import clsx from 'clsx';

export const LiveMatchBanner = () => {
    const { profile } = useAuthStore();
    const [displayMatch, setDisplayMatch] = useState<Match | null>(null);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        fetchMatchData();

        const channel = supabase
            .channel('live_match_banner_enhanced')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
                fetchMatchData();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchMatchData = async () => {
        // 1. Get all relevant matches
        const { data: allMatches, error } = await supabase
            .from('matches')
            .select('*')
            .order('created_at', { ascending: false });

        if (error || !allMatches) return;

        // Priority 1: Ongoing or Closed matches (Highest Priority)
        const active = allMatches.find(m => m.status === 'ongoing' || m.status === 'closed');
        if (active) {
            setDisplayMatch(active);
            setLoading(false);
            return;
        }

        // Priority 2: Recently Finished (within last 15 seconds)
        const finished = allMatches.filter(m => m.status === 'finished' || m.status === 'cancelled')
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

        if (finished) {
            // For now, let's show the result if there are NO open matches.
            const openMatches = allMatches.filter(m => m.status === 'open').reverse(); // Oldest first for queue

            if (openMatches.length > 0) {
                setDisplayMatch(openMatches[0]);
            } else {
                setDisplayMatch(finished);
            }
        } else {
            const openMatches = allMatches.filter(m => m.status === 'open').reverse();
            if (openMatches.length > 0) {
                setDisplayMatch(openMatches[0]);
            } else {
                setDisplayMatch(null);
            }
        }

        setLoading(false);
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('Delete this match? (Only works if no bets exist)')) return;

        const { error } = await supabase.from('matches').delete().eq('id', id);
        if (error) alert('Cannot delete match: ' + error.message);
    };

    if (loading || !displayMatch) return null;

    const isAdmin = profile?.role === 'admin';
    const isOngoing = displayMatch.status === 'ongoing';
    const isClosed = displayMatch.status === 'closed';
    const isFinished = displayMatch.status === 'finished';
    const isOpen = displayMatch.status === 'open';

    return (
        <div className="relative group">
            <div className={clsx(
                "absolute -inset-0.5 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-1000 group-hover:duration-200",
                isOngoing ? "bg-red-600" : isFinished ? "bg-yellow-500" : "bg-casino-gold-400"
            )}></div>

            <div className="relative glass-panel rounded-2xl overflow-hidden border-white/10 flex flex-col md:flex-row items-center justify-between p-4 md:p-6 gap-6">
                <div className="flex items-center gap-6">
                    <div className={clsx(
                        "p-4 rounded-xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110",
                        isOngoing ? "bg-red-600 shadow-red-900/20" :
                            isFinished ? "bg-yellow-500 shadow-yellow-900/20" :
                                "bg-casino-gold-400 shadow-casino-gold-900/20"
                    )}>
                        {isFinished ? <Trophy className="w-6 h-6 text-casino-dark-950" /> : <Swords className={clsx("w-6 h-6", isOngoing ? "text-white" : "text-casino-dark-950")} />}
                    </div>

                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className={clsx(
                                "text-[10px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded",
                                isOngoing ? "bg-red-500/20 text-red-500" :
                                    isFinished ? "bg-yellow-500/20 text-yellow-500" :
                                        isClosed ? "bg-orange-500/20 text-orange-500" :
                                            isOpen ? "bg-blue-500/20 text-blue-500" :
                                                "bg-green-500/20 text-green-500"
                            )}>
                                {isOpen ? 'Next Match Up' : displayMatch.status}
                            </span>
                            {isOngoing && (
                                <div className="flex items-center gap-1.5 bg-red-500/10 px-2 py-0.5 rounded animate-pulse">
                                    <Flame size={10} className="text-red-500" />
                                    <span className="text-[10px] font-black text-red-500 uppercase">Live Fight</span>
                                </div>
                            )}
                            {isFinished && (
                                <div className="flex items-center gap-1.5 bg-yellow-500/10 px-2 py-0.5 rounded">
                                    <Trophy size={10} className="text-yellow-500" />
                                    <span className="text-[10px] font-black text-yellow-500 uppercase">Winner Declared</span>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            <h3 className="text-lg md:text-xl font-display font-black text-white flex items-center gap-3">
                                <span className={clsx(displayMatch.winner === 'meron' ? "text-yellow-400" : "text-red-500")}>
                                    {displayMatch.meron_name}
                                    {displayMatch.winner === 'meron' && " 🏆"}
                                </span>
                                <span className="text-casino-slate-500 text-sm font-bold">VS</span>
                                <span className={clsx(displayMatch.winner === 'wala' ? "text-yellow-400" : "text-blue-500")}>
                                    {displayMatch.wala_name}
                                    {displayMatch.winner === 'wala' && " 🏆"}
                                </span>
                            </h3>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto">
                    {isAdmin && (isOpen) && (
                        <button
                            onClick={(e) => handleDelete(e, displayMatch.id)}
                            className="p-3 text-casino-slate-500 hover:text-red-500 transition-colors"
                        >
                            <Trash2 size={20} />
                        </button>
                    )}

                    {isAdmin ? (
                        <button
                            onClick={() => navigate('/betting')}
                            className="flex-1 md:flex-none btn-casino-primary py-3 px-6 rounded-xl flex items-center justify-center gap-2 text-sm font-black uppercase tracking-widest transition-all active:scale-95"
                        >
                            <Gamepad2 size={18} />
                            {isOpen ? 'Adjust Queue' : 'Manage Arena'}
                        </button>
                    ) : (
                        <button
                            onClick={() => navigate('/')}
                            className="flex-1 md:flex-none btn-casino-primary py-3 px-8 rounded-xl flex items-center justify-center gap-2 text-sm font-black uppercase tracking-widest transition-all active:scale-95 shadow-xl shadow-casino-gold-900/20"
                        >
                            <Trophy size={18} />
                            {isFinished ? 'View Arena Results' : 'Enter Arena'}
                            <ChevronRight size={16} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
