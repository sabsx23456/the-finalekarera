import { useEffect, useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { KareraRace, KareraHorse } from '../../types/karera';
import type { LiveBoardData } from '../../components/karera/KareraLiveBoard';
import { ArrowLeft, RefreshCw, Calculator, DollarSign, Info, Check, Minus } from 'lucide-react';
import { useAuthStore } from '../../lib/store';
import { useToast } from '../../components/ui/Toast';
import clsx from 'clsx';
import { BetReceiptModal, type BetReceiptData } from '../../components/karera/BetReceiptModal';
import { useKareraLobbySettings } from '../../hooks/useKareraLobbySettings';

type ProgramBetType = 'pick_4' | 'pick_5' | 'pick_6' | 'wta';

const BET_CONFIG: Record<string, { label: string; raceCount: number }> = {
    'pick_4': { label: 'Pick 4', raceCount: 4 },
    'pick_5': { label: 'Pick 5', raceCount: 5 },
    'pick_6': { label: 'Pick 6', raceCount: 6 },
    'wta': { label: 'Winner Take All', raceCount: 7 },
};

const BET_TYPE_ROWS: ProgramBetType[][] = [
    ['pick_4', 'pick_5', 'pick_6'],
    ['wta'],
];

const BET_TYPE_THEME: Record<ProgramBetType, { active: string; pill: string }> = {
    pick_4: {
        active: 'border-yellow-200 bg-gradient-to-r from-amber-300 via-yellow-300 to-orange-300 text-black shadow-[0_0_20px_rgba(251,191,36,0.45)]',
        pill: 'bg-amber-200 text-amber-900 border-amber-300',
    },
    pick_5: {
        active: 'border-sky-200 bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-300 text-black shadow-[0_0_20px_rgba(56,189,248,0.45)]',
        pill: 'bg-sky-200 text-sky-900 border-sky-300',
    },
    pick_6: {
        active: 'border-lime-200 bg-gradient-to-r from-lime-300 via-emerald-300 to-green-300 text-black shadow-[0_0_20px_rgba(74,222,128,0.45)]',
        pill: 'bg-lime-200 text-lime-900 border-lime-300',
    },
    wta: {
        active: 'border-pink-200 bg-gradient-to-r from-fuchsia-300 via-pink-300 to-rose-300 text-black shadow-[0_0_20px_rgba(244,114,182,0.45)]',
        pill: 'bg-pink-200 text-pink-900 border-pink-300',
    },
};

const UNIT_COST = 2; // P2.00 per ticket

const formatPesoUi = (value: number) => {
    const safe = Number.isFinite(value) ? value : 0;
    return `PHP ${safe.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatPesoCompact = (value: number) => {
    const safe = Number.isFinite(value) ? value : 0;
    if (safe >= 1_000_000) return `PHP ${(safe / 1_000_000).toFixed(1)}M`;
    if (safe >= 1_000) return `PHP ${(safe / 1_000).toFixed(0)}K`;
    return `PHP ${safe.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

// Parse live board data from the karera_live_boards table
const parseDDBoard = (raw: any): LiveBoardData | null => {
    if (!raw || typeof raw !== 'object') return null;
    // Check if root is a LiveBoardData directly
    if (Array.isArray(raw.cells)) return raw as LiveBoardData;
    // Check nested daily_double key
    if (raw.daily_double && Array.isArray(raw.daily_double.cells)) return raw.daily_double as LiveBoardData;
    return null;
};

export const KareraProgramBetting = () => {
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

    const [selectedBetType, setSelectedBetType] = useState<ProgramBetType>('wta');
    const [selectedRaceIds, setSelectedRaceIds] = useState<string[]>([]);

    // DD live board data per race: { race_id: LiveBoardData }
    const [ddBoardsMap, setDdBoardsMap] = useState<Record<string, LiveBoardData | null>>({});

    // Selections: { race_id: [horse_number_1, horse_number_2] }
    const [selections, setSelections] = useState<Record<string, number[]>>({});

    const [placingBet, setPlacingBet] = useState(false);

    const [receipt, setReceipt] = useState<BetReceiptData | null>(null);
    const [receiptOpen, setReceiptOpen] = useState(false);

    // ---------- Fetch Races + Horses + DD Boards ----------
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
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

                    const raceIds = racesData.map(r => r.id);

                    // Fetch horses + DD boards in parallel
                    const [horsesRes, boardsRes] = await Promise.all([
                        supabase
                            .from('karera_horses')
                            .select('*')
                            .in('race_id', raceIds)
                            .order('horse_number'),
                        supabase
                            .from('karera_live_boards')
                            .select('race_id, data')
                            .in('race_id', raceIds),
                    ]);

                    if (horsesRes.error) throw horsesRes.error;

                    // Group horses by race
                    const hMap: Record<string, KareraHorse[]> = {};
                    horsesRes.data?.forEach((h: KareraHorse) => {
                        if (!hMap[h.race_id]) hMap[h.race_id] = [];
                        hMap[h.race_id].push(h);
                    });
                    setHorsesMap(hMap);

                    // Group DD boards by race
                    const bMap: Record<string, LiveBoardData | null> = {};
                    (boardsRes.data || []).forEach((row: any) => {
                        if (!row?.race_id) return;
                        bMap[row.race_id] = parseDDBoard(row.data);
                    });
                    setDdBoardsMap(bMap);
                }
            } catch (err) {
                console.error("Error loading program:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [selectedTournamentId]);

    // ---------- Realtime: Horse updates ----------
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

    // ---------- Realtime: DD Live Board updates ----------
    useEffect(() => {
        if (races.length === 0) return;

        const raceIds = races.map(r => r.id);
        const channel = supabase.channel('karera_program_dd_boards');

        raceIds.forEach((raceId) => {
            channel.on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'karera_live_boards',
                filter: `race_id=eq.${raceId}`
            }, (payload) => {
                const row = payload.new as any;
                if (!row?.race_id) return;
                setDdBoardsMap((prev) => ({
                    ...prev,
                    [row.race_id]: parseDDBoard(row.data),
                }));
            });
        });

        channel.subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [races]);

    // ---------- Computed DD dividends per horse ----------
    const ddDividendsMap = useMemo(() => {
        // For each race, compute per-horse DD dividend from DD board row_totals
        // Dividend formula: DD_TOTAL / num_active_horses
        // Race 1 has no DD data → blank
        const result: Record<string, Record<number, number | null>> = {};

        races.forEach((race) => {
            const board = ddBoardsMap[race.id];
            const horses = horsesMap[race.id] || [];
            const activeHorses = horses.filter(h => h.status !== 'scratched');
            const numActive = activeHorses.length || 1;

            if (!board || !board.row_totals) {
                // No DD data available
                result[race.id] = {};
                return;
            }

            const poolGross = board.pool_gross || 0;
            const horseDividends: Record<number, number | null> = {};

            activeHorses.forEach((h) => {
                const rowTotal = Number(board.row_totals[h.horse_number] || 0);
                if (rowTotal > 0 && poolGross > 0) {
                    // Approx payout per P1: pool / rowTotal
                    horseDividends[h.horse_number] = Math.round(poolGross / rowTotal);
                } else {
                    // Fallback: pool / num_horses
                    horseDividends[h.horse_number] = poolGross > 0 ? Math.round(poolGross / numActive) : null;
                }
            });

            result[race.id] = horseDividends;
        });

        return result;
    }, [races, horsesMap, ddBoardsMap]);

    // ---------- Race selection logic (same as before) ----------
    const requiredLegCount = (betType: ProgramBetType) => {
        if (betType === 'pick_4') return 4;
        if (betType === 'pick_5') return 5;
        if (betType === 'pick_6') return 6;
        return null;
    };

    const minLegCount = (betType: ProgramBetType) => {
        if (betType === 'wta') return 2;
        return requiredLegCount(betType) || 1;
    };

    const eligibleRacesByType = useMemo(() => {
        const out = {} as Record<ProgramBetType, KareraRace[]>;
        (Object.keys(BET_CONFIG) as Array<ProgramBetType>).forEach((k) => {
            out[k] = races.filter(r => r.bet_types_available?.includes(k as any));
        });
        return out;
    }, [races]);

    const betTypeDisabled = useMemo(() => {
        const out = {} as Record<ProgramBetType, boolean>;
        (Object.keys(BET_CONFIG) as Array<ProgramBetType>).forEach((k) => {
            const needed = requiredLegCount(k) ?? minLegCount(k);
            const eligible = eligibleRacesByType[k];
            out[k] = eligible.length < needed;
        });
        return out;
    }, [eligibleRacesByType]);

    const raceById = useMemo(() => {
        const map = new Map<string, KareraRace>();
        races.forEach((r) => map.set(r.id, r));
        return map;
    }, [races]);

    const eligibleRaceIds = useMemo(
        () => (eligibleRacesByType[selectedBetType] || []).map((r) => r.id),
        [eligibleRacesByType, selectedBetType]
    );

    const isConsecutiveIds = (ids: string[]) => {
        if (ids.length <= 1) return true;
        const indexMap = new Map(eligibleRaceIds.map((id, idx) => [id, idx]));
        const idxs = ids.map((id) => indexMap.get(id)).filter((v): v is number => v !== undefined).sort((a, b) => a - b);
        if (idxs.length !== ids.length) return false;
        for (let i = 1; i < idxs.length; i += 1) {
            if (idxs[i] !== idxs[i - 1] + 1) return false;
        }
        return true;
    };

    useEffect(() => {
        const eligibleIds = eligibleRaceIds;
        const eligibleSet = new Set(eligibleIds);
        const required = requiredLegCount(selectedBetType);

        setSelectedRaceIds((prev) => {
            const next = prev.filter((id) => eligibleSet.has(id));

            if (required) {
                if (eligibleIds.length < required) return [];
                if (next.length === required && isConsecutiveIds(next)) return next;
                const anchor = next[0] ? eligibleIds.indexOf(next[0]) : 0;
                const start = anchor >= 0 && anchor + required <= eligibleIds.length ? anchor : 0;
                return eligibleIds.slice(start, start + required);
            }

            if (next.length === 0 && eligibleIds.length > 0) return eligibleIds.slice(0, Math.min(2, eligibleIds.length));
            if (!isConsecutiveIds(next)) return [next[0]].filter(Boolean) as string[];
            return next;
        });
    }, [eligibleRaceIds, selectedBetType]);

    useEffect(() => {
        const needed = requiredLegCount(selectedBetType) ?? minLegCount(selectedBetType);
        const eligible = eligibleRacesByType[selectedBetType];
        if (eligible.length >= needed) return;

        const best = (Object.entries(BET_CONFIG) as Array<[ProgramBetType, { label: string; raceCount: number }]>)
            .filter(([k]) => {
                const need = requiredLegCount(k) ?? minLegCount(k);
                return (eligibleRacesByType[k] || []).length >= need;
            })
            .sort((a, b) => {
                const aNeed = requiredLegCount(a[0]) ?? minLegCount(a[0]);
                const bNeed = requiredLegCount(b[0]) ?? minLegCount(b[0]);
                return bNeed - aNeed;
            })[0];

        if (best && best[0] !== selectedBetType) {
            setSelectedBetType(best[0]);
            setSelections({});
            setSelectedRaceIds([]);
        }
    }, [eligibleRacesByType, selectedBetType]);

    const activeRaces = useMemo(() => {
        const eligible = eligibleRacesByType[selectedBetType] || [];
        const selectedSet = new Set(selectedRaceIds);
        return eligible.filter((r) => selectedSet.has(r.id));
    }, [eligibleRacesByType, selectedBetType, selectedRaceIds]);

    const toggleRaceSelection = (raceId: string) => {
        const race = raceById.get(raceId);
        if (!race) return;
        if (!race.bet_types_available?.includes(selectedBetType as any)) return;

        const required = requiredLegCount(selectedBetType);
        setSelectedRaceIds((prev) => {
            const index = eligibleRaceIds.indexOf(raceId);
            if (index < 0) return prev;

            if (required) {
                if (index + required > eligibleRaceIds.length) {
                    showToast(`Not enough next races from this point for ${BET_CONFIG[selectedBetType].label}`, 'error');
                    return prev;
                }
                return eligibleRaceIds.slice(index, index + required);
            }

            const exists = prev.includes(raceId);
            const next = exists
                ? prev.filter((id) => id !== raceId)
                : [...prev, raceId];
            next.sort((a, b) => eligibleRaceIds.indexOf(a) - eligibleRaceIds.indexOf(b));

            if (next.length > 1 && !isConsecutiveIds(next)) {
                showToast('WTA race selection must be consecutive', 'error');
                return prev;
            }

            return next;
        });
    };

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

    // ---------- Calculation ----------
    const calculations = useMemo(() => {
        let combinations = 1;
        let isComplete = true;
        const required = requiredLegCount(selectedBetType);
        const minRequired = minLegCount(selectedBetType);

        if (activeRaces.length === 0) return { combinations: 0, totalCost: 0, isComplete: false };

        activeRaces.forEach(race => {
            const count = selections[race.id]?.length || 0;
            if (count === 0) {
                combinations = 0;
                isComplete = false;
            } else {
                combinations *= count;
            }
        });

        if (!isComplete) combinations = 0;

        return {
            combinations,
            totalCost: combinations * UNIT_COST,
            isComplete: isComplete && (required ? activeRaces.length === required : activeRaces.length >= minRequired)
        };
    }, [selections, activeRaces, selectedBetType]);

    // ---------- Place Bet ----------
    const placeBet = async () => {
        if (!profile) return;
        if (!calculations.isComplete) {
            const required = requiredLegCount(selectedBetType);
            const minRequired = minLegCount(selectedBetType);
            if (required && activeRaces.length !== required) {
                showToast(`Please choose exactly ${required} races for ${BET_CONFIG[selectedBetType].label}`, 'error');
            } else if (activeRaces.length < minRequired) {
                showToast(`Please choose at least ${minRequired} races for ${BET_CONFIG[selectedBetType].label}`, 'error');
            } else {
                showToast('Please select at least one horse for every chosen race', 'error');
            }
            return;
        }
        if (!isConsecutiveIds(selectedRaceIds)) {
            showToast('Please select consecutive races only', 'error');
            return;
        }

        setPlacingBet(true);
        try {
            if ((profile.balance || 0) < calculations.totalCost) {
                showToast('Insufficient balance', 'error');
                return;
            }

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

    // ---------- Render: Loading / Offline states ----------
    if (kareraSettingsLoading) return <div className="p-12 text-center text-white text-xl">Loading...</div>;

    if (isKareraOffline) {
        const schedule = String(nextRaceText || '').trim();
        return (
            <div className="max-w-7xl mx-auto p-4 min-h-[70vh] flex flex-col">
                <div className="flex items-center gap-3">
                    <Link to={`/karera${tournamentQuery}`} className="inline-flex items-center gap-2 text-casino-slate-400 hover:text-white text-lg">
                        <ArrowLeft size={22} />
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

    if (loading) return <div className="p-12 text-center text-white text-xl">Loading Program...</div>;

    // ---------- MAIN RENDER ----------
    return (
        <div className="max-w-7xl mx-auto p-4 flex flex-col gap-5 min-h-screen pb-36">

            {/* ── Header ── */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center gap-4">
                    <Link to={`/karera${tournamentQuery}`} className="text-casino-slate-400 hover:text-white">
                        <ArrowLeft size={26} />
                    </Link>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-black text-white uppercase italic tracking-wide">
                            Program Betting
                        </h1>
                        <p className="text-casino-slate-300 text-sm sm:text-base">System tickets for multiple races</p>
                    </div>
                </div>

                {/* ── Bet Type Tabs ── */}
                <div className="bg-casino-dark-800/80 rounded-2xl p-2 border-2 border-white/15 space-y-2">
                    {BET_TYPE_ROWS.map((row, rowIdx) => (
                        <div key={rowIdx} className={clsx("grid gap-2", row.length === 1 ? "grid-cols-1" : "grid-cols-3")}>
                            {row.map((k) => {
                                const config = BET_CONFIG[k];
                                const disabled = Boolean(betTypeDisabled[k]);
                                return (
                                    <button
                                        key={k}
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => {
                                            if (disabled) return;
                                            setSelectedBetType(k);
                                            setSelections({});
                                            setSelectedRaceIds([]);
                                        }}
                                        title={disabled ? `Not enough open races for ${config.label}.` : undefined}
                                        className={clsx(
                                            "min-h-11 px-3 py-2 rounded-xl text-sm sm:text-base font-black uppercase transition-all tracking-wide border-2",
                                            disabled
                                                ? "opacity-35 cursor-not-allowed text-white/60 border-white/10 bg-white/5"
                                                : selectedBetType === k
                                                    ? BET_TYPE_THEME[k].active
                                                    : "text-casino-slate-100 border-white/20 bg-white/5 hover:bg-white/15 hover:text-white"
                                        )}
                                    >
                                        {config.label}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* Info Banner */}
            <div className="bg-blue-900/35 border-2 border-blue-300/40 p-4 rounded-2xl flex items-start gap-3">
                <Info className="text-blue-300 shrink-0 mt-0.5" size={22} />
                <div className="text-sm sm:text-base text-blue-100">
                    <span className="font-black text-white">System Betting:</span> Select multiple horses per race.
                    Cost = selections multiplied across races.
                    <br />
                    <span className="opacity-90 text-sm sm:text-base">Ticket Cost: {formatPesoUi(UNIT_COST)} / combination</span>
                </div>
            </div>

            {/* ── Race Selector Panel ── */}
            <div className="p-4 rounded-2xl border-2 border-white/15 bg-casino-dark-800/75">
                <div className="flex items-center justify-between gap-3 mb-3">
                    <div>
                        <h3 className="text-sm sm:text-base font-black uppercase tracking-wide text-white">
                            Choose Races for {BET_CONFIG[selectedBetType].label}
                        </h3>
                        <p className="text-xs sm:text-sm text-casino-slate-300">
                            {requiredLegCount(selectedBetType)
                                ? `Select exactly ${requiredLegCount(selectedBetType)} races`
                                : `Select at least ${minLegCount(selectedBetType)} races`}
                        </p>
                    </div>
                    <div className={clsx("text-xs sm:text-sm font-black uppercase tracking-wider border px-3 py-1.5 rounded-lg", BET_TYPE_THEME[selectedBetType].pill)}>
                        {selectedRaceIds.length} Selected
                    </div>
                </div>

                {(eligibleRacesByType[selectedBetType] || []).length === 0 ? (
                    <div className="text-base text-casino-slate-500">No races available for this bet type.</div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {(eligibleRacesByType[selectedBetType] || []).map((race) => {
                            const isSelected = selectedRaceIds.includes(race.id);
                            return (
                                <button
                                    key={race.id}
                                    type="button"
                                    onClick={() => toggleRaceSelection(race.id)}
                                    className={clsx(
                                        "px-4 py-2.5 rounded-xl border-2 text-sm sm:text-base font-black uppercase tracking-wide transition-all",
                                        isSelected
                                            ? "border-yellow-200 bg-yellow-300 text-black shadow-[0_0_14px_rgba(253,224,71,0.45)]"
                                            : "border-white/20 bg-black/20 text-casino-slate-100 hover:border-white/40 hover:bg-white/10"
                                    )}
                                >
                                    {race.name}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ══════════════ Race Cards (LIST FORMAT) ══════════════ */}
            <div className="flex flex-col gap-5">
                {activeRaces.length === 0 ? (
                    <div className="text-center py-12 text-casino-slate-500 text-lg border-2 border-dashed border-white/10 rounded-2xl">
                        No selected races yet.
                    </div>
                ) : (
                    activeRaces.map((race, index) => {
                        const raceSelections = selections[race.id] || [];
                        const horses = horsesMap[race.id] || [];
                        const ddBoard = ddBoardsMap[race.id];
                        const ddPool = ddBoard?.pool_gross || 0;
                        const horseDividends = ddDividendsMap[race.id] || {};
                        const hasDDData = ddBoard !== null && ddBoard !== undefined;

                        return (
                            <div key={race.id} className="rounded-2xl border-2 border-white/15 bg-casino-dark-800/70 overflow-hidden">
                                {/* ── Race Header with gradient accent ── */}
                                <div className="bg-gradient-to-r from-cyan-500/25 via-sky-400/20 to-transparent border-b-2 border-white/15 px-4 sm:px-5 py-3 sm:py-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center font-black text-white text-base sm:text-lg shadow-lg">
                                                R{index + 1}
                                            </div>
                                            <div>
                                                <h3 className="font-black text-white text-lg sm:text-xl uppercase tracking-wide">{race.name}</h3>
                                                <span className="text-sm sm:text-base text-casino-slate-200 font-mono">
                                                    {new Date(race.racing_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            {hasDDData && ddPool > 0 && (
                                                <div className="text-[10px] sm:text-xs text-cyan-300/80 font-bold uppercase tracking-wider mb-0.5">
                                                    DD Pool: {formatPesoCompact(ddPool)}
                                                </div>
                                            )}
                                            <div className="flex items-center gap-1.5">
                                                <span className={clsx(
                                                    "text-base sm:text-lg font-black",
                                                    raceSelections.length > 0 ? "text-green-300" : "text-casino-slate-300"
                                                )}>
                                                    {raceSelections.length}
                                                </span>
                                                <span className="text-sm sm:text-base text-casino-slate-200 uppercase font-bold">Selected</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* ── Horse List (column headers) ── */}
                                <div className="px-3 sm:px-4 pt-2 pb-1">
                                    <div className="grid grid-cols-[48px_1fr_90px_64px] sm:grid-cols-[56px_1fr_110px_72px] items-center gap-2 sm:gap-3 px-2 py-2 text-xs sm:text-sm text-casino-slate-200 uppercase font-bold tracking-wide">
                                        <span className="text-center">#</span>
                                        <span>Horse Name</span>
                                        <span className="text-center">DD Div</span>
                                        <span className="text-center">Pick</span>
                                    </div>
                                </div>

                                {/* ── Horse Rows ── */}
                                <div className="px-3 sm:px-4 pb-3 sm:pb-4 flex flex-col gap-1.5">
                                    {horses.map(horse => {
                                        const isSelected = raceSelections.includes(horse.horse_number);
                                        const isScratched = horse.status === 'scratched';
                                        const ddDiv = horseDividends[horse.horse_number];

                                        return (
                                            <button
                                                key={horse.id}
                                                disabled={isScratched}
                                                onClick={() => handleHorseToggle(race.id, horse.horse_number)}
                                                className={clsx(
                                                    "w-full grid grid-cols-[48px_1fr_90px_64px] sm:grid-cols-[56px_1fr_110px_72px] items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-3.5 rounded-xl border-2 transition-all text-left",
                                                    isScratched
                                                        ? "opacity-45 border-red-700/40 bg-red-900/20 cursor-not-allowed"
                                                        : isSelected
                                                            ? "border-sky-200 bg-sky-300/20 shadow-[0_0_20px_rgba(56,189,248,0.25)]"
                                                            : "border-white/15 bg-white/5 hover:bg-white/12 hover:border-white/35 active:scale-[0.98]"
                                                )}
                                            >
                                                {/* Horse Number Circle */}
                                                <div className={clsx(
                                                    "w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-black text-lg sm:text-xl shadow-md mx-auto",
                                                    isScratched
                                                        ? "bg-red-800 text-white/80"
                                                        : isSelected
                                                            ? "bg-sky-400 text-black"
                                                            : "bg-white text-black"
                                                )}>
                                                    {horse.horse_number}
                                                </div>

                                                {/* Horse Name */}
                                                <div className="min-w-0">
                                                    <div className={clsx(
                                                        "text-base sm:text-lg font-bold truncate",
                                                        isScratched ? "line-through text-red-300" : isSelected ? "text-sky-200" : "text-white"
                                                    )}>
                                                        {horse.horse_name}
                                                        {isScratched && <span className="ml-1.5 text-red-400 text-xs font-black">SCR</span>}
                                                    </div>
                                                </div>

                                                {/* DD Dividend */}
                                                <div className="text-center">
                                                    {isScratched ? (
                                                        <Minus className="mx-auto text-red-500/50" size={16} />
                                                    ) : hasDDData && ddDiv !== null && ddDiv !== undefined ? (
                                                        <span className="text-base sm:text-lg font-black text-cyan-200 font-mono">
                                                            {ddDiv.toLocaleString()}
                                                        </span>
                                                    ) : (
                                                        <span className="text-sm sm:text-base text-casino-slate-400 font-mono">--</span>
                                                    )}
                                                </div>

                                                {/* Selection Indicator */}
                                                <div className="flex justify-center">
                                                    <div className={clsx(
                                                        "w-9 h-9 sm:w-11 sm:h-11 rounded-lg border-2 flex items-center justify-center transition-all",
                                                        isScratched
                                                            ? "border-red-800/30"
                                                            : isSelected
                                                                ? "border-sky-200 bg-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.4)]"
                                                                : "border-white/35 hover:border-sky-200"
                                                    )}>
                                                        {isSelected && <Check size={22} className="text-black" strokeWidth={3} />}
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

            {/* ══════════════ Sticky Bet Slip Footer ══════════════ */}
            <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:bottom-0 left-0 right-0 lg:left-64 z-40 p-3 md:p-4 border-t-2 border-green-400/30 bg-casino-dark-900/95 backdrop-blur-xl shadow-[0_-10px_40px_rgba(0,0,0,0.6)]">
                <div className="max-w-7xl mx-auto flex flex-col gap-3 md:gap-4">

                    {/* Row 1: Combinations + Total Cost */}
                    <div className="flex items-center justify-between gap-3">
                        {/* Combinations */}
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="p-2 md:p-3 rounded-full bg-violet-500/15 text-violet-400 shrink-0">
                                <Calculator size={20} className="md:hidden" />
                                <Calculator size={26} className="hidden md:block" />
                            </div>
                            <div className="min-w-0">
                                <div className="text-[10px] md:text-xs text-casino-slate-400 uppercase font-black tracking-wider">Combinations</div>
                                <div className="text-base md:text-xl font-mono font-black text-white flex items-center flex-wrap gap-0.5 md:gap-2">
                                    {activeRaces.map((r, i) => (
                                        <span key={r.id} className={clsx((selections[r.id]?.length || 0) === 0 ? "text-red-500" : "text-white")}>
                                            {selections[r.id]?.length || 0}
                                            {i < activeRaces.length - 1 && <span className="text-casino-slate-600 mx-0.5">x</span>}
                                        </span>
                                    ))}
                                    <span className="text-violet-400 mx-0.5">=</span>
                                    <span className="text-violet-400">{calculations.combinations}</span>
                                </div>
                            </div>
                        </div>

                        {/* Total Cost */}
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="p-2 md:p-3 rounded-full bg-green-500/15 text-green-400 shrink-0">
                                <DollarSign size={20} className="md:hidden" />
                                <DollarSign size={26} className="hidden md:block" />
                            </div>
                            <div>
                                {promoForReceipt ? (
                                    <>
                                        <div className="text-[10px] md:text-xs text-red-200 uppercase font-black tracking-widest">Value (Promo)</div>
                                        <div className="text-lg md:text-3xl font-mono font-black text-casino-gold-400 leading-none">
                                            {formatPesoUi(calculations.totalCost * (1 + (promoForReceipt.pct / 100)))}
                                        </div>
                                        <div className="text-[10px] md:text-xs text-white/70 font-mono">
                                            Pay: <span className="text-white font-black">{formatPesoUi(calculations.totalCost)}</span>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="text-[10px] md:text-xs text-casino-slate-400 uppercase font-black tracking-wider">Total Cost</div>
                                        <div className="text-lg md:text-3xl font-mono font-black text-green-400 leading-none">
                                            {formatPesoUi(calculations.totalCost)}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Row 2: ACTION BUTTON - Big, bright, neon green */}
                    <button
                        onClick={placeBet}
                        disabled={placingBet || !calculations.isComplete}
                        className={clsx(
                            "w-full py-4 md:py-5 px-8 font-black uppercase tracking-wider text-lg sm:text-xl rounded-2xl shadow-lg transition-all",
                            "active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
                            !placingBet && calculations.isComplete
                                ? "bg-gradient-to-r from-green-500 via-emerald-400 to-green-500 text-black border-2 border-green-300/50 shadow-[0_0_30px_rgba(34,197,94,0.3)] hover:shadow-[0_0_40px_rgba(34,197,94,0.5)] hover:brightness-110 animate-[pulse_3s_ease-in-out_infinite]"
                                : "bg-casino-dark-700 text-white/50 border-2 border-white/10"
                        )}
                    >
                        {placingBet ? <RefreshCw className="animate-spin mx-auto" size={28} /> : 'PLACE SYSTEM BET'}
                    </button>
                </div>
            </div>

            <BetReceiptModal isOpen={receiptOpen} receipt={receipt} onClose={() => setReceiptOpen(false)} />
        </div>
    );
};
