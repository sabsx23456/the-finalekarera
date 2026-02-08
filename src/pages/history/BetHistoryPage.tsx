import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import type { Bet, Match } from '../../types';
import type { KareraBet, KareraRace } from '../../types/karera';
import { Loader2, Calendar, ChevronLeft, ChevronRight, Trophy, Sword, Target, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import { BetReceiptModal, type BetReceiptData } from '../../components/karera/BetReceiptModal';
import {
    computeKareraCombos,
    deriveKareraUnits,
    formatKareraSelectionLines,
    getKareraProgramLabel,
    getKareraUnitCost,
} from '../../lib/kareraBetUtils';

interface BetWithMatch extends Bet {
    match?: Match;
}

type KareraBetWithRace = KareraBet & { race?: Pick<KareraRace, 'id' | 'name' | 'racing_time'> | null };

export const BetHistoryPage = () => {
    const { profile } = useAuthStore();
    const [tab, setTab] = useState<'sabong' | 'karera'>('sabong');
    const [bets, setBets] = useState<BetWithMatch[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalCount, setTotalCount] = useState(0);

    const [kareraBets, setKareraBets] = useState<KareraBetWithRace[]>([]);
    const [kareraLoading, setKareraLoading] = useState(true);
    const [kareraTotalCount, setKareraTotalCount] = useState(0);
    const [kareraRacesById, setKareraRacesById] = useState<Record<string, { name?: string; racing_time?: string }>>({});

    const [receipt, setReceipt] = useState<BetReceiptData | null>(null);
    const [receiptOpen, setReceiptOpen] = useState(false);

    useEffect(() => {
        if (profile?.id && tab === 'sabong') {
            fetchBets();

            const channel = supabase
                .channel(`bet-history:${profile.id}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'bets',
                    filter: `user_id=eq.${profile.id}`
                }, () => {
                    fetchBets();
                })
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [profile?.id, page, pageSize, tab]);

    useEffect(() => {
        if (profile?.id && tab === 'karera') {
            fetchKareraBets();

            const channel = supabase
                .channel(`karera-bet-history:${profile.id}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'karera_bets',
                    filter: `user_id=eq.${profile.id}`
                }, () => {
                    fetchKareraBets();
                })
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [profile?.id, page, pageSize, tab]);

    const fetchBets = async () => {
        setLoading(true);
        try {
            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;

            const { data, error, count } = await supabase
                .from('bets')
                .select('*, match:matches(*)', { count: 'exact' })
                .eq('user_id', profile!.id)
                .order('created_at', { ascending: false })
                .range(from, to);

            if (error) throw error;

            if (data) {
                setBets(data as BetWithMatch[]);
                setTotalCount(count || 0);
            }
        } catch (error) {
            console.error("Error fetching bet history:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchKareraBets = async () => {
        setKareraLoading(true);
        try {
            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;

            const { data, error, count } = await supabase
                .from('karera_bets')
                .select('*, race:karera_races(id, name, racing_time)', { count: 'exact' })
                .eq('user_id', profile!.id)
                .order('created_at', { ascending: false })
                .range(from, to);

            if (error) throw error;

            const rows = (data || []) as KareraBetWithRace[];
            setKareraBets(rows);
            setKareraTotalCount(count || 0);

            const legRaceIds = new Set<string>();
            rows.forEach((b) => {
                const legs = (b as any)?.combinations?.legs;
                if (!Array.isArray(legs)) return;
                legs.forEach((leg: any) => {
                    if (leg?.race_id) legRaceIds.add(String(leg.race_id));
                });
            });

            if (legRaceIds.size === 0) {
                setKareraRacesById({});
                return;
            }

            const { data: legsData, error: legsErr } = await supabase
                .from('karera_races')
                .select('id, name, racing_time')
                .in('id', Array.from(legRaceIds));

            if (legsErr) throw legsErr;

            const map: Record<string, { name?: string; racing_time?: string }> = {};
            (legsData || []).forEach((r: any) => {
                if (!r?.id) return;
                map[String(r.id)] = { name: String(r.name || ''), racing_time: String(r.racing_time || '') };
            });
            setKareraRacesById(map);
        } catch (error) {
            console.error("Error fetching karera bet history:", error);
        } finally {
            setKareraLoading(false);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            hour12: true
        });
    };

    const activeTotalCount = tab === 'sabong' ? totalCount : kareraTotalCount;
    const totalPages = Math.ceil(activeTotalCount / pageSize);

    const sabongStats = useMemo(() => {
        const totalWagered = bets.reduce((sum, bet) => sum + Number(bet.amount || 0), 0);
        const totalWon = bets.filter(b => b.status === 'won').reduce((sum, b) => sum + Number(b.payout || 0), 0);
        const winCount = bets.filter(b => b.status === 'won').length;
        const winRate = bets.length > 0 ? (winCount / bets.length) * 100 : 0;
        return { totalWagered, totalWon, winCount, winRate };
    }, [bets]);

    const kareraStats = useMemo(() => {
        const totalWagered = kareraBets.reduce((sum, bet) => sum + Number((bet as any)?.amount || 0), 0);
        const totalWon = kareraBets.filter(b => b.status === 'won').reduce((sum, b) => sum + Number((b as any)?.payout || 0), 0);
        const winCount = kareraBets.filter(b => b.status === 'won').length;
        const winRate = kareraBets.length > 0 ? (winCount / kareraBets.length) * 100 : 0;
        return { totalWagered, totalWon, winCount, winRate };
    }, [kareraBets]);

    const activeStats = tab === 'sabong' ? sabongStats : kareraStats;

    const openKareraReceipt = (bet: KareraBetWithRace) => {
        const betType = String((bet as any)?.bet_type || '');
        const unitCost = getKareraUnitCost(betType);
        const combos = computeKareraCombos(betType, (bet as any)?.combinations);
        const units = deriveKareraUnits((bet as any)?.amount, combos, unitCost);
        const amount = Number((bet as any)?.amount || 0);
        const betPromoPercent = Number((bet as any)?.promo_percent || 0);
        const betPromoTemplate = String((bet as any)?.promo_text || '').trim();
        const betPromoText = betPromoTemplate
            ? betPromoTemplate.replaceAll('{percent}', String(betPromoPercent))
            : `BOOKIS +${betPromoPercent}% PER BET`;

        const programLabel = getKareraProgramLabel(betType);
        const raceName = programLabel || (bet as any)?.race?.name || 'Karera';
        const raceTimeRaw = (bet as any)?.race?.racing_time;
        const raceTime = raceTimeRaw ? new Date(String(raceTimeRaw)).toLocaleString() : undefined;

        const selectionLines = formatKareraSelectionLines({
            betType,
            combinations: (bet as any)?.combinations,
            racesById: kareraRacesById,
        });

        setReceipt({
            website: 'www.sabong192.live',
            betId: String((bet as any)?.id || ''),
            issuedAt: String((bet as any)?.created_at || new Date().toISOString()),
            raceName,
            raceTime,
            betType,
            selections: selectionLines,
            combos,
            unitCost,
            units,
            amount,
            promoPercent: Number.isFinite(betPromoPercent) && betPromoPercent > 0 ? betPromoPercent : undefined,
            promoText: Number.isFinite(betPromoPercent) && betPromoPercent > 0 ? betPromoText : undefined,
        });
        setReceiptOpen(true);
    };

    return (
        <div className="space-y-4 max-w-7xl mx-auto pb-20 lg:pb-0">
            {/* Compact Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-casino-gold-500 to-yellow-600 flex items-center justify-center shadow-lg shadow-yellow-500/20">
                        <Trophy className="text-black" size={20} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-white uppercase tracking-tight">Bet History</h1>
                        <p className="text-casino-slate-500 text-xs">Sabong and Karera</p>
                    </div>
                </div>

                <div className="flex gap-1 bg-casino-dark-850 p-1 rounded-lg w-full sm:w-fit">
                    <button
                        type="button"
                        onClick={() => {
                            setTab('sabong');
                            setPage(1);
                        }}
                        className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'sabong'
                            ? 'bg-casino-gold-500 text-casino-dark-950'
                            : 'text-casino-slate-400 hover:bg-white/5 hover:text-white'
                            }`}
                    >
                        Sabong
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setTab('karera');
                            setPage(1);
                        }}
                        className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs font-semibold transition-all ${tab === 'karera'
                            ? 'bg-casino-gold-500 text-casino-dark-950'
                            : 'text-casino-slate-400 hover:bg-white/5 hover:text-white'
                            }`}
                    >
                        Karera
                    </button>
                </div>
            </div>

            {/* Stats Cards - Compact */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="glass-panel rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                        <Sword size={14} className="text-casino-gold-500" />
                        <span className="text-[10px] text-casino-slate-500 uppercase font-bold">Total Bets</span>
                    </div>
                    <div className="text-lg font-black text-white">{activeTotalCount}</div>
                </div>
                <div className="glass-panel rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                        <Target size={14} className="text-green-500" />
                        <span className="text-[10px] text-casino-slate-500 uppercase font-bold">Win Rate</span>
                    </div>
                    <div className="text-lg font-black text-green-500">{activeStats.winRate.toFixed(1)}%</div>
                </div>
                <div className="glass-panel rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                        <TrendingUp size={14} className="text-blue-500" />
                        <span className="text-[10px] text-casino-slate-500 uppercase font-bold">Wagered</span>
                    </div>
                    <div className="text-lg font-black text-white">P{activeStats.totalWagered.toLocaleString()}</div>
                </div>
                <div className="glass-panel rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1">
                        <Trophy size={14} className="text-casino-gold-500" />
                        <span className="text-[10px] text-casino-slate-500 uppercase font-bold">Total Won</span>
                    </div>
                    <div className={clsx("text-lg font-black", activeStats.totalWon >= activeStats.totalWagered ? "text-green-500" : "text-casino-gold-500")}>
                        P{activeStats.totalWon.toLocaleString()}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="glass-panel rounded-2xl overflow-hidden border-white/5">
                {/* Controls Bar - Compact */}
                <div className="p-3 border-b border-white/5 flex items-center justify-between bg-white/5">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-casino-slate-500 uppercase font-bold">Show:</span>
                        <select
                            value={pageSize}
                            onChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setPage(1);
                            }}
                            className="bg-casino-dark-800 border border-white/10 rounded-lg px-2 py-1 text-white text-xs outline-none focus:border-casino-gold-500/50 transition-colors cursor-pointer"
                        >
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                        </select>
                    </div>
                </div>

                {tab === 'sabong' ? (
                    <>
                        {/* Mobile Card View */}
                        <div className="lg:hidden">
                    {loading ? (
                        <div className="py-12 text-center">
                            <Loader2 className="animate-spin text-casino-gold-500 w-6 h-6 mx-auto mb-2" />
                            <span className="text-xs text-casino-slate-500">Loading...</span>
                        </div>
                    ) : bets.length === 0 ? (
                        <div className="py-12 text-center">
                            <span className="text-casino-slate-600 text-sm">No match history found</span>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {bets.map((bet) => (
                                <div key={bet.id} className="p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className={clsx(
                                                "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide",
                                                bet.selection === 'meron' ? "bg-red-500/20 text-red-500 border border-red-500/30" :
                                                    bet.selection === 'wala' ? "bg-blue-500/20 text-blue-500 border border-blue-500/30" :
                                                        "bg-white/10 text-casino-slate-400 border border-white/10"
                                            )}>
                                                {bet.selection}
                                            </span>
                                            <span className="text-[10px] text-casino-slate-500">
                                                #{bet.match?.fight_id || bet.match_id.substring(0, 6).toUpperCase()}
                                            </span>
                                        </div>
                                        <span className={clsx(
                                            "text-[10px] font-bold uppercase",
                                            bet.status === 'won' ? "text-green-500" :
                                                bet.status === 'lost' ? "text-red-500" :
                                                    bet.status === 'cancelled' ? "text-orange-500" :
                                                        "text-casino-slate-500"
                                        )}>
                                            {bet.status}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-1 text-casino-slate-400">
                                            <Calendar size={10} />
                                            {formatDate(bet.created_at)}
                                        </div>
                                        <div className="text-right">
                                            <div className="font-mono font-bold text-white">P {bet.amount.toLocaleString()}</div>
                                            {bet.status === 'won' && bet.payout && (
                                                <div className="text-[10px] text-green-500 font-bold">
                                                    +P {bet.payout.toLocaleString()}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                        </div>

                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-casino-dark-900/80 border-b border-white/5">
                                <th className="px-4 py-3 text-left text-[10px] font-black text-casino-slate-500 uppercase tracking-wider">Match</th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-casino-slate-500 uppercase tracking-wider">Date</th>
                                <th className="px-4 py-3 text-center text-[10px] font-black text-casino-slate-500 uppercase tracking-wider">Side</th>
                                <th className="px-4 py-3 text-center text-[10px] font-black text-casino-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-right text-[10px] font-black text-casino-slate-500 uppercase tracking-wider">Bet</th>
                                <th className="px-4 py-3 text-right text-[10px] font-black text-casino-slate-500 uppercase tracking-wider">Result</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center">
                                        <Loader2 className="animate-spin text-casino-gold-500 w-6 h-6 mx-auto mb-2" />
                                        <span className="text-xs text-casino-slate-500">Loading records...</span>
                                    </td>
                                </tr>
                            ) : bets.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center">
                                        <span className="text-casino-slate-600 text-sm">No match history found</span>
                                    </td>
                                </tr>
                            ) : (
                                bets.map((bet) => (
                                    <tr key={bet.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                <span className="font-bold text-white text-xs">SABONG</span>
                                                <span className="text-casino-slate-500 text-xs">#{bet.match?.fight_id || bet.match_id.substring(0, 6).toUpperCase()}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5 text-casino-slate-400 text-xs">
                                                <Calendar size={12} />
                                                {formatDate(bet.created_at)}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={clsx(
                                                "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide border",
                                                bet.selection === 'meron' ? "bg-red-500/10 text-red-500 border-red-500/20" :
                                                    bet.selection === 'wala' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                                                        "bg-white/5 text-casino-slate-400 border-white/10"
                                            )}>
                                                {bet.selection}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={clsx(
                                                "text-xs font-bold uppercase",
                                                bet.status === 'won' ? "text-green-500" :
                                                    bet.status === 'lost' ? "text-red-500" :
                                                        bet.status === 'cancelled' ? "text-orange-500" :
                                                            "text-casino-slate-500"
                                            )}>
                                                {bet.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <span className="font-mono font-bold text-casino-slate-200 text-sm">
                                                P {bet.amount.toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {bet.status === 'won' && bet.payout ? (
                                                <span className="text-green-500 font-bold font-mono text-sm">
                                                    +P {bet.payout.toLocaleString()}
                                                </span>
                                            ) : bet.status === 'lost' ? (
                                                <span className="text-red-500/50 font-mono text-sm">
                                                    -P {bet.amount.toLocaleString()}
                                                </span>
                                            ) : (
                                                <span className="text-casino-slate-600 text-xs">-</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                    </>
                ) : (
                    <>
                        {/* Mobile Card View */}
                        <div className="lg:hidden">
                            {kareraLoading ? (
                                <div className="py-12 text-center">
                                    <Loader2 className="animate-spin text-casino-gold-500 w-6 h-6 mx-auto mb-2" />
                                    <span className="text-xs text-casino-slate-500">Loading...</span>
                                </div>
                            ) : kareraBets.length === 0 ? (
                                <div className="py-12 text-center">
                                    <span className="text-casino-slate-600 text-sm">No karera history found</span>
                                </div>
                            ) : (
                                <div className="divide-y divide-white/5">
                                    {kareraBets.map((bet) => {
                                        const betType = String((bet as any)?.bet_type || '');
                                        const raceName = (bet as any)?.race?.name || getKareraProgramLabel(betType) || 'KARERA';
                                        const lines = formatKareraSelectionLines({
                                            betType,
                                            combinations: (bet as any)?.combinations,
                                            racesById: kareraRacesById,
                                        });

                                        return (
                                            <div key={String((bet as any)?.id || '')} className="p-3 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide bg-white/10 text-white border border-white/10">
                                                            {betType.replace(/_/g, ' ')}
                                                        </span>
                                                        <span className="text-[10px] text-casino-slate-500 truncate">{raceName}</span>
                                                    </div>
                                                    <span
                                                        className={clsx(
                                                            'text-[10px] font-bold uppercase',
                                                            bet.status === 'won'
                                                                ? 'text-green-500'
                                                                : bet.status === 'lost'
                                                                    ? 'text-red-500'
                                                                    : bet.status === 'cancelled' || bet.status === 'refunded'
                                                                        ? 'text-orange-500'
                                                                        : 'text-casino-slate-500',
                                                        )}
                                                    >
                                                        {String(bet.status || '')}
                                                    </span>
                                                </div>

                                                <div className="text-xs text-casino-slate-300 font-mono bg-black/20 border border-white/5 rounded-lg p-2 whitespace-pre-wrap">
                                                    {lines.slice(0, 3).join('\n')}
                                                    {lines.length > 3 ? '\n...' : ''}
                                                </div>

                                                <div className="flex items-center justify-between text-xs">
                                                    <div className="flex items-center gap-1 text-casino-slate-400">
                                                        <Calendar size={10} />
                                                        {formatDate(String(bet.created_at || ''))}
                                                    </div>
                                                    <div className="text-right flex items-center gap-2">
                                                        <div className="font-mono font-bold text-white">
                                                            P {Number((bet as any)?.amount || 0).toLocaleString()}
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => openKareraReceipt(bet)}
                                                            className="text-[10px] font-bold uppercase px-2 py-1 rounded bg-casino-gold-500/20 text-casino-gold-400 border border-casino-gold-500/20 hover:bg-casino-gold-500/30"
                                                        >
                                                            Receipt
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden lg:block overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-casino-dark-900/80 border-b border-white/5">
                                        <th className="px-4 py-3 text-left text-[10px] font-black text-casino-slate-500 uppercase tracking-wider">Race</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-black text-casino-slate-500 uppercase tracking-wider">Date</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-black text-casino-slate-500 uppercase tracking-wider">Type</th>
                                        <th className="px-4 py-3 text-left text-[10px] font-black text-casino-slate-500 uppercase tracking-wider">Selections</th>
                                        <th className="px-4 py-3 text-center text-[10px] font-black text-casino-slate-500 uppercase tracking-wider">Status</th>
                                        <th className="px-4 py-3 text-right text-[10px] font-black text-casino-slate-500 uppercase tracking-wider">Bet</th>
                                        <th className="px-4 py-3 text-right text-[10px] font-black text-casino-slate-500 uppercase tracking-wider">Result</th>
                                        <th className="px-4 py-3 text-right text-[10px] font-black text-casino-slate-500 uppercase tracking-wider">Receipt</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {kareraLoading ? (
                                        <tr>
                                            <td colSpan={8} className="py-12 text-center">
                                                <Loader2 className="animate-spin text-casino-gold-500 w-6 h-6 mx-auto mb-2" />
                                                <span className="text-xs text-casino-slate-500">Loading records...</span>
                                            </td>
                                        </tr>
                                    ) : kareraBets.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="py-12 text-center">
                                                <span className="text-casino-slate-600 text-sm">No karera history found</span>
                                            </td>
                                        </tr>
                                    ) : (
                                        kareraBets.map((bet) => {
                                            const betType = String((bet as any)?.bet_type || '');
                                            const raceName = (bet as any)?.race?.name || getKareraProgramLabel(betType) || 'KARERA';
                                            const selectionLines = formatKareraSelectionLines({
                                                betType,
                                                combinations: (bet as any)?.combinations,
                                                racesById: kareraRacesById,
                                            });

                                            return (
                                                <tr key={String((bet as any)?.id || '')} className="hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-casino-gold-500" />
                                                            <span className="font-bold text-white text-xs">KARERA</span>
                                                            <span className="text-casino-slate-500 text-xs truncate max-w-[240px]">{raceName}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-1.5 text-casino-slate-400 text-xs">
                                                            <Calendar size={12} />
                                                            {formatDate(String(bet.created_at || ''))}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide bg-white/10 text-white border border-white/10">
                                                            {betType.replace(/_/g, ' ')}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="text-[10px] text-casino-slate-300 font-mono whitespace-pre-wrap max-w-[380px]">
                                                            {selectionLines.slice(0, 3).join('\n')}
                                                            {selectionLines.length > 3 ? '\n...' : ''}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span
                                                            className={clsx(
                                                                'text-xs font-bold uppercase',
                                                                bet.status === 'won'
                                                                    ? 'text-green-500'
                                                                    : bet.status === 'lost'
                                                                        ? 'text-red-500'
                                                                        : bet.status === 'cancelled' || bet.status === 'refunded'
                                                                            ? 'text-orange-500'
                                                                            : 'text-casino-slate-500',
                                                            )}
                                                        >
                                                            {String(bet.status || '')}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <span className="font-mono font-bold text-casino-slate-200 text-sm">
                                                            P {Number((bet as any)?.amount || 0).toLocaleString()}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {bet.status === 'won' && (bet as any).payout ? (
                                                            <span className="text-green-500 font-bold font-mono text-sm">
                                                                +P {Number((bet as any).payout || 0).toLocaleString()}
                                                            </span>
                                                        ) : bet.status === 'lost' ? (
                                                            <span className="text-red-500/50 font-mono text-sm">
                                                                -P {Number((bet as any)?.amount || 0).toLocaleString()}
                                                            </span>
                                                        ) : (
                                                            <span className="text-casino-slate-600 text-xs">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            type="button"
                                                            onClick={() => openKareraReceipt(bet)}
                                                            className="text-[10px] font-bold uppercase px-3 py-1.5 rounded bg-casino-gold-500/20 text-casino-gold-400 border border-casino-gold-500/20 hover:bg-casino-gold-500/30"
                                                        >
                                                            Receipt
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {/* Pagination Footer - Compact */}
                {activeTotalCount > 0 && (
                    <div className="px-3 py-3 border-t border-white/5 bg-white/5 flex items-center justify-between">
                        <div className="text-xs text-casino-slate-500">
                            <span className="text-white font-bold">{((page - 1) * pageSize) + 1}-{Math.min(page * pageSize, activeTotalCount)}</span>
                            <span className="mx-1">of</span>
                            <span className="text-white font-bold">{activeTotalCount}</span>
                        </div>
                        <div className="flex gap-1">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="p-1.5 border border-white/10 rounded-lg hover:bg-white/5 text-casino-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            {Array.from({ length: Math.min(3, totalPages) }, (_, i) => {
                                let p = i + 1;
                                if (page > 2 && totalPages > 3) p = page - 1 + i;
                                if (p > totalPages) return null;

                                return (
                                    <button
                                        key={p}
                                        onClick={() => setPage(p)}
                                        className={clsx(
                                            "w-7 h-7 rounded-lg text-xs font-bold transition-all border",
                                            page === p
                                                ? "bg-casino-gold-500 text-black border-casino-gold-500"
                                                : "bg-transparent border-white/10 text-casino-slate-400 hover:bg-white/5 hover:text-white"
                                        )}
                                    >
                                        {p}
                                    </button>
                                );
                            })}
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="p-1.5 border border-white/10 rounded-lg hover:bg-white/5 text-casino-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <BetReceiptModal isOpen={receiptOpen} receipt={receipt} onClose={() => setReceiptOpen(false)} />
        </div>
    );
};
