import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { KareraRace, KareraHorse } from '../../types/karera';
import { ArrowLeft, RefreshCw, Calculator, DollarSign, Info } from 'lucide-react';
import { useAuthStore } from '../../lib/store';
import { useToast } from '../../components/ui/Toast';
import clsx from 'clsx';
import { BetReceiptModal, type BetReceiptData } from '../../components/karera/BetReceiptModal';
import { useKareraLobbySettings } from '../../hooks/useKareraLobbySettings';

const BET_CONFIG: Record<string, { label: string; raceCount: number }> = {
    'pick_4': { label: 'Pick 4', raceCount: 4 },
    'pick_5': { label: 'Pick 5', raceCount: 5 },
    'pick_6': { label: 'Pick 6', raceCount: 6 },
    'wta': { label: 'Winner Take All', raceCount: 7 },
};

const UNIT_COST = 2; // P2.00 per ticket

const formatPesoUi = (value: number) => {
    const safe = Number.isFinite(value) ? value : 0;
    return `₱${safe.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const KareraProgramBetting = () => {
    // We might pass an eventId or startRaceId, currently assuming we load ALL open races for the day
    // or filtering by a param. For now, let's load all active races.
    const { profile } = useAuthStore();
    const { showToast } = useToast();
    const { offline: isKareraOffline, nextRaceText, promoEnabled, promoPercent, promoBannerText, loading: kareraSettingsLoading } = useKareraLobbySettings();

    const [searchParams] = useSearchParams();
    const selectedTournamentId = String(searchParams.get('tournament') || '').trim();
    const tournamentQuery = selectedTournamentId ? `?tournament=${encodeURIComponent(selectedTournamentId)}` : '';

    const promoForReceipt = useMemo(() => {
        if (!promoEnabled) return null;
        const pct = Number(promoPercent);
        if (!Number.isFinite(pct) || pct <= 0) return null;
        const pctText = Number.isInteger(pct) ? String(pct) : String(pct);
        const template = String(promoBannerText || '').trim() || 'BOOKIS +{percent}% PER BET';
        const text = template.split('{percent}').join(pctText);
        return { pct, text };
    }, [promoBannerText, promoEnabled, promoPercent]);

    // State
    const [races, setRaces] = useState<KareraRace[]>([]);
    const [horsesMap, setHorsesMap] = useState<Record<string, KareraHorse[]>>({});
    const [loading, setLoading] = useState(true);

    const [selectedBetType, setSelectedBetType] = useState<keyof typeof BET_CONFIG>('wta');

    // Selections: { race_id: [horse_number_1, horse_number_2] }
    const [selections, setSelections] = useState<Record<string, number[]>>({});

    const [placingBet, setPlacingBet] = useState(false);

    const [receipt, setReceipt] = useState<BetReceiptData | null>(null);
    const [receiptOpen, setReceiptOpen] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch all open races (ordered by time)
                let query = supabase
                    .from('karera_races')
                    .select('*')
                    .eq('status', 'open');

                if (selectedTournamentId) {
                    query = query.eq('tournament_id', selectedTournamentId);
                }

                let { data: racesData, error: racesError } = await query.order('racing_time', { ascending: true });
                if (racesError && /column .*tournament_id.* does not exist/i.test(racesError.message || '')) {
                    ({ data: racesData, error: racesError } = await supabase
                        .from('karera_races')
                        .select('*')
                        .eq('status', 'open')
                        .order('racing_time', { ascending: true }));
                }

                if (racesError) throw racesError;

                if (racesData) {
                    setRaces(racesData as KareraRace[]);

                    // Fetch horses for these races
                    const raceIds = racesData.map(r => r.id);
                    const { data: horsesData, error: horsesError } = await supabase
                        .from('karera_horses')
                        .select('*')
                        .in('race_id', raceIds)
                        .order('horse_number');

                    if (horsesError) throw horsesError;

                    // Group horses by race
                    const hMap: Record<string, KareraHorse[]> = {};
                    horsesData?.forEach((h: KareraHorse) => {
                        if (!hMap[h.race_id]) hMap[h.race_id] = [];
                        hMap[h.race_id].push(h);
                    });
                    setHorsesMap(hMap);
                }
            } catch (err) {
                console.error("Error loading program:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [selectedTournamentId]);

    // Realtime horse updates (e.g., Scratch -S-) for currently loaded races
    useEffect(() => {
        if (races.length === 0) return;

        const raceIds = races.map(r => r.id);
        const channel = supabase.channel('karera_program_horses');

        raceIds.forEach((raceId) => {
            channel.on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'karera_horses',
                filter: `race_id=eq.${raceId}`
            }, (payload) => {
                const updated = payload.new as KareraHorse;
                if (!updated?.id) return;

                setHorsesMap((prev) => {
                    const list = prev[updated.race_id];
                    if (!list) return prev;
                    const next = list.map((h) => (h.id === updated.id ? { ...h, ...updated } : h));
                    next.sort((a, b) => a.horse_number - b.horse_number);
                    return { ...prev, [updated.race_id]: next };
                });

                if (updated.status === 'scratched') {
                    setSelections((prev) => {
                        const arr = prev[updated.race_id];
                        if (!arr || arr.length === 0) return prev;
                        const filtered = arr.filter((n) => n !== updated.horse_number);
                        if (filtered.length === arr.length) return prev;
                        return { ...prev, [updated.race_id]: filtered };
                    });
                }
            });
        });

        channel.subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [races]);

    // Filter relevant races based on Bet Type (Need consecutive races)
    // For simplicity, we assume the FIRST N OPEN RACES are the target sequence.
    // In a real app, we might need logic to select WHICH sequence (e.g., Races 1-7 or Races 2-8).
    // For this MVP, we take the first N races from the list.
    const betTypeDisabled = useMemo(() => {
        const out = {} as Record<keyof typeof BET_CONFIG, boolean>;
        (Object.keys(BET_CONFIG) as Array<keyof typeof BET_CONFIG>).forEach((k) => {
            const eligible = races.filter(r => r.bet_types_available?.includes(k as any));
            out[k] = eligible.length < BET_CONFIG[k].raceCount;
        });
        return out;
    }, [races]);

    useEffect(() => {
        const current = BET_CONFIG[selectedBetType];
        if (!current) return;
        const eligible = races.filter(r => r.bet_types_available?.includes(selectedBetType as any));
        if (eligible.length >= current.raceCount) return;

        const best = (Object.entries(BET_CONFIG) as Array<[keyof typeof BET_CONFIG, { label: string; raceCount: number }]>)
            .filter(([k, cfg]) => {
                const elig = races.filter(r => r.bet_types_available?.includes(k as any));
                return elig.length >= cfg.raceCount;
            })
            .sort((a, b) => b[1].raceCount - a[1].raceCount)[0];

        if (best && best[0] !== selectedBetType) {
            setSelectedBetType(best[0]);
            setSelections({});
        }
    }, [races, selectedBetType]);

    const activeRaces = useMemo(() => {
        const count = BET_CONFIG[selectedBetType].raceCount;
        const eligible = races.filter(r => r.bet_types_available?.includes(selectedBetType as any));
        return eligible.slice(0, count);
    }, [races, selectedBetType]);

    const handleHorseToggle = (raceId: string, horseNum: number) => {
        setSelections(prev => {
            const raceSelections = prev[raceId] || [];
            if (raceSelections.includes(horseNum)) {
                return { ...prev, [raceId]: raceSelections.filter(n => n !== horseNum) };
            } else {
                return { ...prev, [raceId]: [...raceSelections, horseNum] };
            }
        });
    };

    // Calculation
    const calculations = useMemo(() => {
        let combinations = 1;
        let isComplete = true;

        if (activeRaces.length === 0) return { combinations: 0, totalCost: 0, isComplete: false };

        activeRaces.forEach(race => {
            const count = selections[race.id]?.length || 0;
            if (count === 0) {
                combinations = 0; // If any race has 0 selections, practically 0 valid tickets (or invalid bet)
                isComplete = false;
            } else {
                combinations *= count;
            }
        });

        // Special case: if combinations became 0 during loop but we want to show 0 explicitly
        if (!isComplete) combinations = 0;

        return {
            combinations,
            totalCost: combinations * UNIT_COST,
            isComplete: isComplete && activeRaces.length === BET_CONFIG[selectedBetType].raceCount
        };
    }, [selections, activeRaces, selectedBetType]);

    const placeBet = async () => {
        if (!profile) return;
        if (!calculations.isComplete) {
            showToast('Please select at least one horse for every race', 'error');
            return;
        }

        setPlacingBet(true);
        try {
            // Check Balance (server will also enforce)
            if ((profile.balance || 0) < calculations.totalCost) {
                showToast('Insufficient balance', 'error');
                return;
            }

            // Place Bet via RPC (computes combos + cost server-side and deducts balance atomically)
            const primaryRaceId = activeRaces[0].id;
            const payload = {
                legs: activeRaces.map(r => ({
                    race_id: r.id,
                    horses: selections[r.id] || []
                }))
            };

            const { data, error } = await supabase.rpc('place_karera_bet', {
                p_race_id: primaryRaceId,
                p_bet_type: selectedBetType,
                p_payload: payload,
                p_units: 1
            });

            if (error) throw error;
            if (!data?.success) throw new Error(data?.error || 'Failed to place bet');

            const issuedAt = data?.created_at || new Date().toISOString();
            const combosFromServer = Number(data?.combos ?? calculations.combinations);
            const unitCostFromServer = Number(data?.unit_cost ?? UNIT_COST);
            const unitsFromServer = Number(data?.units ?? 1);
            const amountFromServer = Number(data?.amount ?? calculations.totalCost);

            const selectionLines: string[] = activeRaces.map((r, idx) => {
                const arr = selections[r.id] || [];
                return `RACE ${idx + 1} (${r.name}): ${arr.join(', ')}`;
            });

            setReceipt({
                website: 'www.sabong192.live',
                betId: data?.bet_id,
                issuedAt,
                raceName: BET_CONFIG[selectedBetType].label,
                betType: selectedBetType,
                selections: selectionLines,
                combos: combosFromServer,
                unitCost: unitCostFromServer,
                units: unitsFromServer,
                amount: amountFromServer,
                promoPercent: promoForReceipt?.pct,
                promoText: promoForReceipt?.text,
            });
            setReceiptOpen(true);

            // Optimistic Update
            useAuthStore.getState().refreshProfile();

            showToast('System Bet Placed Successfully!', 'success');
            setSelections({});

        } catch (err: any) {
            console.error(err);
            showToast(err.message || "Failed to place bet", 'error');
        } finally {
            setPlacingBet(false);
        }
    };

    if (kareraSettingsLoading) return <div className="p-12 text-center text-white">Loading...</div>;

    if (isKareraOffline) {
        const schedule = String(nextRaceText || '').trim();
        return (
            <div className="max-w-7xl mx-auto p-4 min-h-[70vh] flex flex-col">
                <div className="flex items-center gap-3">
                    <Link to={`/karera${tournamentQuery}`} className="inline-flex items-center gap-2 text-casino-slate-400 hover:text-white">
                        <ArrowLeft size={18} />
                        Back to Lobby
                    </Link>
                </div>

                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-4">
                        <div className="text-4xl sm:text-5xl md:text-6xl font-black uppercase tracking-widest animate-pulse text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-fuchsia-500 to-casino-gold-400 drop-shadow-[0_0_30px_rgba(255,0,85,0.35)]">
                            NO SCHEDULE FOR TODAY
                        </div>
                        <div className="text-xl sm:text-2xl md:text-3xl font-black uppercase tracking-[0.2em] text-white/80 animate-pulse">
                            NEXT RACE WILL BE
                        </div>
                        <div className="text-2xl sm:text-3xl md:text-4xl font-black text-casino-gold-400 drop-shadow-[0_0_35px_rgba(245,158,11,0.35)]">
                            {schedule || 'TBA'}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (loading) return <div className="p-12 text-center text-white">Loading Program...</div>;

    return (
        <div className="max-w-7xl mx-auto p-4 flex flex-col gap-6 min-h-screen pb-32">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link to={`/karera${tournamentQuery}`} className="text-casino-slate-400 hover:text-white">
                        <ArrowLeft />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-black text-white uppercase italic tracking-wider">
                            Program Betting
                        </h1>
                        <p className="text-casino-slate-400 text-sm">Create your system tickets for multiple races</p>
                    </div>
                </div>

                <div className="flex bg-casino-dark-800 rounded-xl p-1 gap-1 overflow-x-auto border border-white/5 scrollbar-thin">
                    {Object.entries(BET_CONFIG).map(([key, config]) => {
                        const k = key as keyof typeof BET_CONFIG;
                        const disabled = Boolean(betTypeDisabled[k]);
                        return (
                            <button
                                key={key}
                                type="button"
                                disabled={disabled}
                                onClick={() => {
                                    if (disabled) return;
                                    setSelectedBetType(k);
                                    setSelections({});
                                }}
                                title={disabled ? `Need at least ${config.raceCount} open races.` : undefined}
                                className={clsx(
                                    "px-4 py-2 rounded-lg text-xs font-bold uppercase whitespace-nowrap transition-all",
                                    disabled
                                        ? "opacity-30 cursor-not-allowed text-white/60"
                                        : selectedBetType === key
                                            ? "bg-casino-gold-500 text-black shadow-lg"
                                            : "text-casino-slate-400 hover:bg-white/5"
                                )}
                            >
                                {config.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Info Banner */}
            <div className="bg-blue-900/20 border border-blue-500/20 p-4 rounded-xl flex items-start gap-3">
                <Info className="text-blue-400 shrink-0 mt-0.5" size={18} />
                <div className="text-sm text-blue-200">
                    <span className="font-bold text-blue-100">System Betting:</span> Select multiple horses per race.
                    The cost is calculated by multiplying the number of selections in each race.
                    <br />
                    <span className="opacity-70 text-xs">Current Ticket Cost: {formatPesoUi(UNIT_COST)} / combination</span>
                </div>
            </div>

            {/* Races Grid */}
            <div className="grid grid-cols-1 gap-6">
                {activeRaces.length === 0 ? (
                    <div className="text-center py-12 text-casino-slate-500 border border-dashed border-white/10 rounded-xl">
                        No active races found for this sequence.
                    </div>
                ) : (
                    activeRaces.map((race, index) => {
                        const raceSelections = selections[race.id] || [];
                        const horses = horsesMap[race.id] || [];

                        return (
                            <div key={race.id} className="glass-panel p-6 rounded-xl border border-white/5 bg-casino-dark-800/50">
                                <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-bold text-white border border-white/10">
                                            R{index + 1}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-white">{race.name}</h3>
                                            <span className="text-xs text-casino-slate-500 font-mono">
                                                {new Date(race.racing_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="text-xs font-bold uppercase tracking-wider text-casino-gold-500">
                                        {raceSelections.length} Selected
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                    {horses.map(horse => {
                                        const isSelected = raceSelections.includes(horse.horse_number);
                                        const isScratched = horse.status === 'scratched';

                                        return (
                                            <button
                                                key={horse.id}
                                                disabled={isScratched}
                                                onClick={() => handleHorseToggle(race.id, horse.horse_number)}
                                                className={clsx(
                                                    "relative p-3 rounded-lg border transition-all flex flex-col items-center gap-2 group",
                                                    isScratched
                                                        ? "opacity-30 border-red-900/30 bg-red-900/10 cursor-not-allowed"
                                                        : isSelected
                                                            ? "border-casino-gold-500 bg-casino-gold-500/20 shadow-[inset_0_0_15px_rgba(234,179,8,0.2)]"
                                                            : "border-white/5 bg-black/20 hover:bg-white/5 hover:border-white/20"
                                                )}
                                            >
                                                {/* Checkbox Indicator */}
                                                <div className={clsx(
                                                    "absolute top-2 right-2 w-4 h-4 rounded border flex items-center justify-center transition-colors",
                                                    isSelected ? "bg-casino-gold-500 border-casino-gold-500" : "border-white/20"
                                                )}>
                                                    {isSelected && <div className="w-2 h-2 bg-black rounded-[1px]" />}
                                                </div>

                                                <div className={clsx(
                                                    "w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shadow-lg mb-1",
                                                    isScratched ? "bg-red-900 text-white" : "bg-white text-black"
                                                )}>
                                                    {horse.horse_number}
                                                </div>

                                                <div className="text-center w-full">
                                                    <div className={clsx(
                                                        "text-xs font-bold truncate w-full",
                                                        isSelected ? "text-casino-gold-400" : "text-white"
                                                    )}>
                                                        {horse.horse_name}{isScratched ? ' -S-' : ''}
                                                    </div>
                                                    <div className="text-[10px] text-casino-slate-500 font-mono mt-0.5">
                                                        Div: {horse.current_dividend || '-'}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Sticky Bet Slip Footer */}
            <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:bottom-0 left-0 right-0 lg:left-64 z-40 p-3 md:p-4 border-t border-casino-gold-500/30 bg-casino-dark-900/95 backdrop-blur-xl shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
                <div className="max-w-7xl mx-auto flex flex-col gap-3 md:gap-4">

                    {/* Row 1: Combinations + Total Cost (always visible) */}
                    <div className="flex items-center justify-between gap-3">
                        {/* Combinations */}
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="p-2 md:p-3 rounded-full bg-casino-gold-500/10 text-casino-gold-500 shrink-0">
                                <Calculator size={18} className="md:hidden" />
                                <Calculator size={24} className="hidden md:block" />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[9px] md:text-[10px] text-casino-slate-400 uppercase font-bold tracking-wider">Combinations</div>
                                <div className="text-sm md:text-xl font-mono font-bold text-white flex items-center flex-wrap gap-0.5 md:gap-2">
                                    {activeRaces.map((r, i) => (
                                        <span key={r.id} className={clsx((selections[r.id]?.length || 0) === 0 ? "text-red-500" : "text-white")}>
                                            {selections[r.id]?.length || 0}
                                            {i < activeRaces.length - 1 && <span className="text-casino-slate-600 mx-0.5">×</span>}
                                        </span>
                                    ))}
                                    <span className="text-casino-gold-500 mx-0.5">=</span>
                                    <span className="text-casino-gold-500">{calculations.combinations}</span>
                                </div>
                            </div>
                        </div>

                        {/* Total Cost - always visible */}
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="p-2 md:p-3 rounded-full bg-green-500/10 text-green-500 shrink-0">
                                <DollarSign size={18} className="md:hidden" />
                                <DollarSign size={24} className="hidden md:block" />
                            </div>
                            <div>
                                {promoForReceipt ? (
                                    <>
                                        <div className="text-[9px] md:text-[10px] text-red-200 uppercase font-black tracking-widest">Value (Promo)</div>
                                        <div className="text-lg md:text-3xl font-mono font-black text-casino-gold-400 leading-none">
                                            {formatPesoUi(calculations.totalCost * (1 + (promoForReceipt.pct / 100)))}
                                        </div>
                                        <div className="text-[9px] md:text-[10px] text-white/70 font-mono">
                                            Pay: <span className="text-white font-black">{formatPesoUi(calculations.totalCost)}</span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="text-[9px] md:text-[10px] text-casino-slate-400 uppercase font-bold tracking-wider">Total Cost</div>
                                        <div className="text-lg md:text-3xl font-mono font-black text-green-400 leading-none">
                                            {formatPesoUi(calculations.totalCost)}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Row 2: Action Button */}
                    <button
                        onClick={placeBet}
                        disabled={placingBet || !calculations.isComplete}
                        className="w-full py-3 md:py-4 px-8 bg-gradient-to-r from-casino-gold-600 to-casino-gold-400 text-black font-black uppercase tracking-wider rounded-xl shadow-lg hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {placingBet ? <RefreshCw className="animate-spin mx-auto" /> : 'Place System Bet'}
                    </button>
                </div>
            </div>

            <BetReceiptModal isOpen={receiptOpen} receipt={receipt} onClose={() => setReceiptOpen(false)} />
        </div>
    );
};
