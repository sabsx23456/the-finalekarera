import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { formatKareraSelectionLines, getKareraUnitCost } from '../../lib/kareraBetUtils';
import { useKareraLobbySettings } from '../../hooks/useKareraLobbySettings';
import type { KareraBet, KareraHorse, KareraRace, KareraTournament } from '../../types/karera';
import { Link, useSearchParams } from 'react-router-dom';
import { Clock, Tv, Trophy, X } from 'lucide-react';
import clsx from 'clsx';

export const KareraLobby = () => {
    const { profile } = useAuthStore();
    const { offline: isKareraOffline, nextRaceText, promoEnabled, promoPercent, promoBannerText, loading: kareraSettingsLoading } = useKareraLobbySettings();

    const [searchParams, setSearchParams] = useSearchParams();
    const selectedTournamentId = String(searchParams.get('tournament') || '').trim();

    const [tournaments, setTournaments] = useState<KareraTournament[]>([]);
    const [tournamentsLoading, setTournamentsLoading] = useState(false);

    const selectedTournament = useMemo(() => {
        if (!selectedTournamentId) return null;
        return tournaments.find((t) => t.id === selectedTournamentId) || null;
    }, [selectedTournamentId, tournaments]);

    const tournamentQuery = selectedTournamentId ? `?tournament=${encodeURIComponent(selectedTournamentId)}` : '';

    const [races, setRaces] = useState<KareraRace[]>([]);
    const [loading, setLoading] = useState(true);
    const [nowMs, setNowMs] = useState(() => Date.now());

    const featuredRaceId = useMemo(() => {
        const activeRaces = (races || []).filter((r) => ['open', 'closed'].includes(String(r?.status || '')));
        if (activeRaces.length === 0) return null;

        const postTimeReached = activeRaces.filter((r) => {
            const t = new Date(r.racing_time).getTime();
            return Number.isFinite(t) && t <= nowMs;
        });

        const candidates = postTimeReached.length > 0 ? postTimeReached : activeRaces;
        let best = candidates[0];
        let bestTime = new Date(best.racing_time).getTime();
        for (const r of candidates) {
            const t = new Date(r.racing_time).getTime();
            if (!Number.isFinite(t)) continue;
            if (!Number.isFinite(bestTime) || t < bestTime) {
                best = r;
                bestTime = t;
            }
        }
        return best?.id || null;
    }, [nowMs, races]);

    const [previousRace, setPreviousRace] = useState<KareraRace | null>(null);
    const [previousHorses, setPreviousHorses] = useState<KareraHorse[]>([]);
    const [myPreviousBets, setMyPreviousBets] = useState<KareraBet[]>([]);
    const [previousLoading, setPreviousLoading] = useState(false);
    const [isPreviousModalOpen, setIsPreviousModalOpen] = useState(false);

    const previousHorseByNumber = useMemo(() => {
        const map = new Map<number, KareraHorse>();
        (previousHorses || []).forEach((h) => {
            map.set(Number(h.horse_number), h);
        });
        return map;
    }, [previousHorses]);

    const getLocalDayBoundsIso = (d: Date = new Date()) => {
        // "Today" is based on the user's local timezone.
        const start = new Date(d);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        return { startIso: start.toISOString(), endIso: end.toISOString() };
    };

    const pad2 = (n: number) => String(n).padStart(2, '0');

    const formatCountdown = (ms: number) => {
        const total = Math.max(0, Math.floor(ms / 1000));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
        return `${m}:${pad2(s)}`;
    };

    const splitRaceTitle = (name: string) => {
        const raw = String(name || '').trim();
        const m = raw.match(/^(.*?)(\d+)\s*$/);
        if (!m) return { label: raw, number: null as string | null };
        const label = String(m[1] || '').trim();
        const num = String(m[2] || '').trim();
        return { label: label || raw, number: num || null };
    };

    useEffect(() => {
        const t = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(t);
    }, []);

    const promoBadgeText = useMemo(() => {
        if (!promoEnabled) return '';
        const pct = Number(promoPercent);
        if (!Number.isFinite(pct) || pct <= 0) return '';
        const pctText = Number.isInteger(pct) ? String(pct) : String(pct);
        const template = String(promoBannerText || '').trim() || 'BOOKIS +{percent}% PER BET';
        return template.split('{percent}').join(pctText);
    }, [promoBannerText, promoEnabled, promoPercent]);

    useEffect(() => {
        let cancelled = false;
        const fetchTournaments = async () => {
            setTournamentsLoading(true);
            try {
                const { data, error } = await supabase
                    .from('karera_tournaments')
                    .select('*')
                    .order('tournament_date', { ascending: false })
                    .order('created_at', { ascending: false });

                if (cancelled) return;
                if (error) throw error;
                setTournaments((data || []) as KareraTournament[]);
            } catch (err) {
                console.warn('Failed to load karera tournaments:', err);
                if (!cancelled) setTournaments([]);
            } finally {
                if (!cancelled) setTournamentsLoading(false);
            }
        };

        fetchTournaments();

        const channel = supabase
            .channel('public:karera_tournaments:lobby')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'karera_tournaments' }, () => fetchTournaments())
            .subscribe();

        return () => {
            cancelled = true;
            supabase.removeChannel(channel);
        };
    }, []);

    useEffect(() => {
        if (tournaments.length === 0) return;
        if (selectedTournamentId && tournaments.some((t) => t.id === selectedTournamentId)) return;
        const active = tournaments.find((t) => t.status === 'active') || tournaments[0];
        if (active?.id) {
            setSearchParams({ tournament: active.id }, { replace: true });
        }
    }, [selectedTournamentId, setSearchParams, tournaments]);

    useEffect(() => {
        let cancelled = false;
        let midnightTimer: number | null = null;

        const fetchActiveRaces = async () => {
            let query = supabase
                .from('karera_races')
                .select('*')
                .in('status', ['open', 'closed']) // Show upcoming and active
                .order('racing_time', { ascending: true });

            if (selectedTournamentId) {
                query = query.eq('tournament_id', selectedTournamentId);
            }

            let { data, error } = await query;
            if (error && /column .*tournament_id.* does not exist/i.test(error.message || '')) {
                // Legacy DB: load without tournament filter.
                ({ data, error } = await supabase
                    .from('karera_races')
                    .select('*')
                    .in('status', ['open', 'closed'])
                    .order('racing_time', { ascending: true }));
            }

            if (cancelled) return;
            if (!error && data) setRaces(data as KareraRace[]);
        };

        const fetchPreviousRace = async () => {
            setPreviousLoading(true);
            try {
                const { startIso, endIso } = getLocalDayBoundsIso();
                let query = supabase
                    .from('karera_races')
                    .select('*')
                    .eq('status', 'finished')
                    .gte('racing_time', startIso)
                    .lt('racing_time', endIso);

                if (selectedTournamentId) {
                    query = query.eq('tournament_id', selectedTournamentId);
                }

                let { data, error } = await query.order('racing_time', { ascending: false }).limit(1);
                if (error && /column .*tournament_id.* does not exist/i.test(error.message || '')) {
                    ({ data, error } = await supabase
                        .from('karera_races')
                        .select('*')
                        .eq('status', 'finished')
                        .gte('racing_time', startIso)
                        .lt('racing_time', endIso)
                        .order('racing_time', { ascending: false })
                        .limit(1));
                }

                if (cancelled) return;
                if (error) {
                    console.warn('Failed to load previous race:', error);
                    setPreviousRace(null);
                    setPreviousHorses([]);
                    setMyPreviousBets([]);
                    return;
                }

                const race = (data || [])[0] as KareraRace | undefined;
                setPreviousRace(race || null);

                if (!race?.id) {
                    setPreviousHorses([]);
                    setMyPreviousBets([]);
                    return;
                }

                const { data: horsesData, error: horsesErr } = await supabase
                    .from('karera_horses')
                    .select('*')
                    .eq('race_id', race.id)
                    .order('horse_number', { ascending: true });

                if (!cancelled) {
                    if (horsesErr) console.warn('Failed to load previous race horses:', horsesErr);
                    setPreviousHorses((horsesData || []) as KareraHorse[]);
                }

                if (!profile?.id) {
                    if (!cancelled) setMyPreviousBets([]);
                    return;
                }

                // Include:
                // 1) direct race bets (race_id = previousRace.id)
                // 2) program bets that include this race as a leg (combinations.legs[].race_id = previousRace.id)
                const [directRes, legsRes] = await Promise.all([
                    supabase
                        .from('karera_bets')
                        .select('*')
                        .eq('user_id', profile.id)
                        .eq('race_id', race.id)
                        .order('created_at', { ascending: false })
                        .limit(20),
                    supabase
                        .from('karera_bets')
                        .select('*')
                        .eq('user_id', profile.id)
                        .contains('combinations', { legs: [{ race_id: race.id }] })
                        .order('created_at', { ascending: false })
                        .limit(20),
                ]);

                if (cancelled) return;

                if (directRes.error) console.warn('Failed to load previous race direct bets:', directRes.error);
                if (legsRes.error) console.warn('Failed to load previous race leg bets:', legsRes.error);

                const merged = new Map<string, any>();
                (directRes.data || []).forEach((b: any) => b?.id && merged.set(String(b.id), b));
                (legsRes.data || []).forEach((b: any) => b?.id && merged.set(String(b.id), b));

                const list = Array.from(merged.values()) as KareraBet[];
                list.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                setMyPreviousBets(list);
            } finally {
                if (!cancelled) setPreviousLoading(false);
            }
        };

        const refresh = async (opts?: { initial?: boolean }) => {
            if (opts?.initial) setLoading(true);
            await Promise.all([fetchActiveRaces(), fetchPreviousRace()]);
            if (!cancelled && opts?.initial) setLoading(false);
        };

        refresh({ initial: true });

        const scheduleMidnightRefresh = () => {
            if (cancelled) return;
            const now = new Date();
            const nextMidnight = new Date(now);
            nextMidnight.setHours(24, 0, 0, 0);
            const ms = Math.max(0, nextMidnight.getTime() - now.getTime()) + 250;
            midnightTimer = window.setTimeout(() => {
                refresh();
                scheduleMidnightRefresh();
            }, ms);
        };

        scheduleMidnightRefresh();

        const channel = supabase
            .channel('public:karera_races:lobby')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'karera_races' }, () => refresh())
            .subscribe();

        return () => {
            cancelled = true;
            if (midnightTimer) window.clearTimeout(midnightTimer);
            supabase.removeChannel(channel);
        };
    }, [profile?.id, selectedTournamentId]);

    if (kareraSettingsLoading) {
        return <div className="p-8 text-center text-casino-slate-400">Loading...</div>;
    }

    if (isKareraOffline) {
        const schedule = String(nextRaceText || '').trim();

        return (
            <div className="max-w-7xl mx-auto p-4 min-h-[70vh] flex flex-col">
                <header className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Trophy className="text-casino-slate-400" />
                            KARERA <span className="text-xs bg-neutral-700 text-white px-2 py-0.5 rounded border border-white/10">OFFLINE</span>
                        </h1>
                        <p className="text-casino-slate-400">Online Horse Racing Betting</p>
                    </div>
                </header>

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

    if (loading) {
        return <div className="p-8 text-center text-casino-slate-400">Loading races...</div>;
    }

    const normalizeBetType = (bt: string) => (bt === 'winner_take_all' ? 'wta' : bt);

    const betTypeTag = (bt: string) => {
        const t = normalizeBetType(String(bt || '')).trim();
        if (t === 'daily_double') return 'DD';
        if (t === 'daily_double_plus_one') return 'DD+1';
        if (t === 'pick_4') return 'PICK 4';
        if (t === 'pick_5') return 'PICK 5';
        if (t === 'pick_6') return 'PICK 6';
        if (t === 'wta') return 'WTA';
        if (t === 'win') return 'WIN';
        if (t === 'place') return 'PLACE';
        return t.replace(/_/g, ' ').toUpperCase();
    };

    const prevResult = (() => {
        const raw: any = (previousRace as any)?.result;
        if (!raw) return null;
        if (typeof raw === 'string') {
            try {
                return JSON.parse(raw);
            } catch {
                return null;
            }
        }
        if (typeof raw === 'object') return raw;
        return null;
    })();

    const finish = (prevResult as any)?.finish_order ?? null;
    const oddsRaw = (prevResult as any)?.odds;
    const odds = oddsRaw && typeof oddsRaw === 'object' ? (oddsRaw as Record<string, any>) : null;

    const horseLabel = (n: number | null | undefined) => {
        if (!n || !Number.isFinite(Number(n))) return '-';
        const num = Number(n);
        const h = previousHorseByNumber.get(num);
        return h ? `#${num} ${h.horse_name}` : `#${num}`;
    };

    const myTotalStake = (myPreviousBets || []).reduce((sum, b: any) => sum + Number(b?.amount || 0), 0);
    const myTotalPayout = (myPreviousBets || []).reduce((sum, b: any) => sum + Number(b?.payout || 0), 0);

    const oddsOrder = ['win', 'place', 'forecast', 'trifecta', 'quartet', 'daily_double', 'daily_double_plus_one', 'pick_4', 'pick_5', 'pick_6', 'wta'];
    const oddsEntries = (() => {
        const dedup = new Map<string, number>();
        Object.entries(odds || {}).forEach(([k, v]) => {
            const key = normalizeBetType(String(k || '')).trim();
            const n = Number(v);
            if (!key || !Number.isFinite(n) || n <= 0) return;
            if (!dedup.has(key)) dedup.set(key, n);
        });

        const entries = Array.from(dedup.entries());
        entries.sort((a, b) => {
            const ia = oddsOrder.indexOf(a[0]);
            const ib = oddsOrder.indexOf(b[0]);
            if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });
        return entries as Array<[string, number]>;
    })();

    const oddsTypesToShow = (() => {
        const raw = Array.isArray(previousRace?.bet_types_available) ? previousRace!.bet_types_available : [];
        const norm = raw.map((t) => normalizeBetType(String(t || '')).trim()).filter(Boolean);
        const keys = Object.keys(odds || {}).map((t) => normalizeBetType(String(t || '')).trim()).filter(Boolean);
        const all = Array.from(new Set([...norm, ...keys]));
        all.sort((a, b) => {
            const ia = oddsOrder.indexOf(a);
            const ib = oddsOrder.indexOf(b);
            if (ia === -1 && ib === -1) return a.localeCompare(b);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });
        return all;
    })();

    const formatBoardNumber = (v: number) =>
        Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

    return (
        <div className="max-w-7xl mx-auto p-4 flex flex-col gap-6">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Trophy className="text-red-500" />
                        KARERA <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded">LIVE</span>
                    </h1>
                    <p className="text-casino-slate-400">Online Horse Racing Betting</p>
                </div>
                <Link to={`/karera/program${tournamentQuery}`} className="px-6 py-2 bg-gradient-to-r from-red-600 to-red-500 text-white font-black uppercase rounded-lg shadow-[0_0_20px_rgba(220,38,38,0.6)] hover:shadow-[0_0_30px_rgba(220,38,38,0.8)] hover:scale-105 transition-all flex items-center gap-2 animate-pulse border border-red-400">
                    <Trophy size={18} className="animate-bounce" />
                    PICK 4-6, WTA
                </Link>
            </header>

            {tournaments.length > 0 ? (
                <section className="glass-panel rounded-xl border border-white/5 overflow-hidden">
                    <div className="relative">
                        {selectedTournament?.banner_url ? (
                            <img src={selectedTournament.banner_url} alt="Tournament banner" className="w-full h-40 object-cover" />
                        ) : (
                            <div className="w-full h-40 bg-gradient-to-br from-neutral-900 to-neutral-800 flex items-center justify-center text-[10px] text-casino-slate-600 uppercase tracking-widest font-black">
                                No Banner
                            </div>
                        )}

                        {promoBadgeText ? (
                            <div className="absolute top-3 right-3 max-w-[75%]">
                                <div className="px-2 py-1 rounded-md bg-red-600/90 text-white text-[9px] font-black uppercase tracking-widest border border-red-300/30 shadow-lg animate-pulse text-center leading-tight">
                                    {promoBadgeText}
                                </div>
                            </div>
                        ) : null}
                    </div>
                    <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-casino-slate-500">Tournament Day</div>
                            <div className="text-white font-black text-lg truncate">
                                {selectedTournament ? selectedTournament.name : 'Select tournament'}
                            </div>
                            {selectedTournament?.tournament_date ? (
                                <div className="text-xs text-casino-slate-400 mt-1">{selectedTournament.tournament_date}</div>
                            ) : null}
                        </div>
                        <select
                            value={selectedTournamentId}
                            onChange={(e) => setSearchParams(e.target.value ? { tournament: e.target.value } : {}, { replace: true })}
                            disabled={tournamentsLoading}
                            className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-casino-gold-400 outline-none transition-all disabled:opacity-60"
                        >
                            <option value="">{tournamentsLoading ? 'Loading...' : 'Select tournament...'}</option>
                            {tournaments.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name} ({t.tournament_date})
                                </option>
                            ))}
                        </select>
                    </div>
                </section>
            ) : null}

            <div className="order-20">
                {previousRace ? (
                    <>
                    <button
                        type="button"
                        onClick={() => setIsPreviousModalOpen(true)}
                        className="glass-panel w-full text-left p-4 rounded-xl border border-white/5 hover:border-casino-gold-500/50 hover:bg-white/5 transition-all"
                        title="View previous race results"
                    >
                        <div className="flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-casino-slate-500">
                                    Previous Race (Today)
                                </div>
                                <div className="text-white font-black text-lg truncate">{previousRace.name}</div>
                                <div className="text-xs text-casino-slate-400 mt-1">
                                    {new Date(previousRace.racing_time).toLocaleString()}
                                </div>
                                </div>
                                <div className="shrink-0 flex items-center gap-2">
                                    {previousLoading ? (
                                        <div className="text-[10px] text-casino-slate-500">Loading...</div>
                                    ) : null}
                                    <div className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded bg-neutral-800/60 text-neutral-300 border border-white/10">
                                        finished
                                    </div>
                                </div>
                            </div>

                            {finish?.first ? (() => {
                                    const oddsByType = new Map<string, number>(oddsEntries);
                                    const winOdds = oddsByType.get('win');
                                    const raceNoMatch = String(previousRace?.name || '').match(/(?:^|\s)(\d+)\s*$/);
                                    const raceNo = raceNoMatch ? Number(raceNoMatch[1]) : null;
                                    const finishNums = [finish?.first, finish?.second, finish?.third, finish?.fourth].filter(
                                        (n) => n != null && Number.isFinite(Number(n)) && Number(n) > 0,
                                    ) as number[];
                                    const finishOrderText = finishNums.join('/');

                                    const placeOdds = oddsByType.get('place');

                                    const rows: Array<{ betType: string; label: string; combo?: string; value: number; unit: number }> = [];
                                    const pushRow = (bt: string, label: string, combo?: string) => {
                                        const odd = oddsByType.get(bt);
                                        if (!odd || !Number.isFinite(odd) || odd <= 0) return;
                                        const unit = getKareraUnitCost(bt);
                                        rows.push({ betType: bt, label, combo, value: unit * odd, unit });
                                    };

                                    // Single-race combos (where we know the finish order)
                                    if (finish?.first && finish?.second) {
                                        pushRow('forecast', 'FC', `${finish.first}/${finish.second}`);
                                    }
                                    if (finish?.first && finish?.second && finish?.third) {
                                        pushRow('trifecta', 'TRI', `${finish.first}/${finish.second}/${finish.third}`);
                                    }
                                    if (finish?.first && finish?.second && finish?.third && finish?.fourth) {
                                        pushRow('quartet', 'QRT', `${finish.first}/${finish.second}/${finish.third}/${finish.fourth}`);
                                    }

                                    // Program/multi-leg bet dividends (no reliable combo string here, so we show the amount only).
                                    pushRow('daily_double', 'DD');
                                    pushRow('daily_double_plus_one', 'DD+1');
                                    pushRow('pick_4', 'PK4');
                                    pushRow('pick_5', 'PK5');
                                    pushRow('pick_6', 'SIX');
                                    pushRow('wta', 'WTA');

                                    return (
                                        <>
                                            <div className="rounded-2xl border border-white/10 bg-black/70 p-3 sm:p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
                                                <div className="flex items-start justify-between gap-4 font-mono">
                                                    <div className="min-w-0">
                                                        <div className="text-red-500 font-black text-sm sm:text-base tracking-wide">OFFICIAL DIVIDENDS</div>
                                                        {finishOrderText ? (
                                                            <div className="text-green-400 font-black text-sm sm:text-base mt-1">{finishOrderText}</div>
                                                        ) : null}
                                                        <div className="mt-2 text-green-400 font-black text-sm sm:text-base">Results</div>
                                                        <div className="text-green-400 font-black leading-5 text-sm sm:text-base">
                                                            {(finishNums || []).slice(0, 4).map((n) => (
                                                                <div key={n}>{n}</div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="shrink-0 text-right">
                                                        <div className="text-yellow-300 font-black text-sm sm:text-base">
                                                            {Number.isFinite(Number(raceNo)) && Number(raceNo) > 0 ? `Race ${raceNo}` : 'Race'}
                                                        </div>
                                                        <div className="mt-4">
                                                            <div className="text-cyan-300 font-black text-sm sm:text-base">WIN</div>
                                                            <div className="text-white font-black text-xl sm:text-2xl tabular-nums">
                                                                {typeof winOdds === 'number' && Number.isFinite(winOdds) && winOdds > 0
                                                                    ? formatBoardNumber(winOdds)
                                                                    : '--'}
                                                            </div>
                                                            <div className="mt-2">
                                                                <div className="text-cyan-300 font-black text-sm sm:text-base">PLACE</div>
                                                                <div className="text-white font-black text-xl sm:text-2xl tabular-nums">
                                                                    {typeof placeOdds === 'number' && Number.isFinite(placeOdds) && placeOdds > 0
                                                                        ? formatBoardNumber(placeOdds)
                                                                        : '--'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {rows.length > 0 ? (
                                                    <div className="mt-4 space-y-1 font-mono text-sm sm:text-base">
                                                        {rows.map((r) => (
                                                            <div key={r.betType} className="flex items-center justify-between gap-4">
                                                                <div className="min-w-0">
                                                                    <span className="text-white font-black tabular-nums">{`P${r.unit}`}</span>{' '}
                                                                    <span className="text-cyan-300 font-black">{r.label}</span>{' '}
                                                                    {r.combo ? (
                                                                        <span className="text-green-400 font-black truncate">{r.combo}</span>
                                                                    ) : null}
                                                                </div>
                                                                <div className="shrink-0 text-white font-black tabular-nums">
                                                                    {formatBoardNumber(r.value)}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div className="mt-3 text-[10px] text-casino-slate-600 font-bold uppercase tracking-widest">
                                                Tap to view full breakdown
                                            </div>
                                        </>
                                    );
                                })() : (
                                    <div className="text-[10px] text-casino-slate-500 italic">
                                        {previousRace?.status === 'finished' ? 'Winner details not available.' : 'Result not announced yet.'}
                                    </div>
                                )}
                        </div>
                    </button>

                    {isPreviousModalOpen ? (
                        <div
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                            onMouseDown={() => setIsPreviousModalOpen(false)}
                        >
                            <div
                                className="bg-neutral-900 w-full max-w-4xl rounded-3xl border border-white/10 p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                <section className="glass-panel p-5 rounded-2xl border border-white/5">
                                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-casino-slate-500">
                                Previous Race
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                                <h2 className="text-xl font-black text-white truncate">{previousRace.name}</h2>
                                <Link
                                    to={`/karera/${previousRace.id}${tournamentQuery}`}
                                    className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-white/80 hover:text-white transition-colors"
                                    title="Open race page"
                                >
                                    View
                                </Link>
                            </div>
                            <div className="text-xs text-casino-slate-400 mt-1">
                                {new Date(previousRace.racing_time).toLocaleString()}
                            </div>
                            {prevResult?.announced_at ? (
                                <div className="text-[10px] text-casino-slate-500 mt-1">
                                    Announced: {new Date(prevResult.announced_at).toLocaleString()}
                                </div>
                            ) : null}
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setIsPreviousModalOpen(false)}
                                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                                aria-label="Close"
                            >
                                <X size={18} />
                            </button>
                            <div className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded bg-neutral-800/60 text-neutral-300 border border-white/10">
                                finished
                            </div>
                        </div>
                    </div>

                    {previousRace?.status === 'finished' && !prevResult ? (
                        <div className="mt-4 rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-yellow-200">
                                Missing Result Data
                            </div>
                            <div className="text-xs text-yellow-100/80 mt-2">
                                Winner and odds info was not saved for this finished race. If you are an admin, run the latest
                                migration in <span className="font-mono">scripts/sql/announce_karera_winner.sql</span> and use the
                                Event Console "Announce Winner" so results are stored on the race.
                            </div>
                        </div>
                    ) : null}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-5">
                        <div className="bg-black/30 rounded-2xl border border-white/5 p-4">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-casino-slate-400 mb-3">
                                Winners
                            </div>
                            {finish?.first ? (
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-casino-slate-500 font-bold uppercase text-[10px] tracking-widest">1st</span>
                                        <span className="text-white font-bold truncate">{horseLabel(finish.first)}</span>
                                    </div>
                                    {finish.second ? (
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-casino-slate-500 font-bold uppercase text-[10px] tracking-widest">2nd</span>
                                            <span className="text-white font-bold truncate">{horseLabel(finish.second)}</span>
                                        </div>
                                    ) : null}
                                    {finish.third ? (
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-casino-slate-500 font-bold uppercase text-[10px] tracking-widest">3rd</span>
                                            <span className="text-white font-bold truncate">{horseLabel(finish.third)}</span>
                                        </div>
                                    ) : null}
                                    {finish.fourth ? (
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-casino-slate-500 font-bold uppercase text-[10px] tracking-widest">4th</span>
                                            <span className="text-white font-bold truncate">{horseLabel(finish.fourth)}</span>
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div className="text-xs text-casino-slate-500 italic">
                                    {previousRace?.status === 'finished' ? 'Winner details not available.' : 'Result not available yet.'}
                                </div>
                            )}
                        </div>

                        <div className="bg-black/30 rounded-2xl border border-white/5 p-4">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-casino-slate-400 mb-3">
                                Final Odds
                            </div>
                            {oddsTypesToShow.length > 0 ? (
                                <div className="space-y-2 text-sm">
                                    {oddsTypesToShow.map((bt) => {
                                        const n = odds ? Number((odds as any)[bt]) : NaN;
                                        const ok = Number.isFinite(n) && n > 0;
                                        return (
                                        <div key={bt} className="flex items-center justify-between gap-3">
                                            <span className="text-casino-slate-500 font-bold uppercase text-[10px] tracking-widest">
                                                {betTypeTag(bt)}
                                            </span>
                                            {ok ? (
                                                <span className="text-casino-gold-400 font-mono font-black">
                                                    ₱{Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                                </span>
                                            ) : (
                                                <span className="text-white/40 font-mono font-black">-</span>
                                            )}
                                        </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-xs text-casino-slate-500 italic">
                                    Odds not available yet.
                                </div>
                            )}
                            <div className="text-[10px] text-casino-slate-600 mt-3">
                                Odds shown here are multipliers applied to your stake per winning combination.
                            </div>
                        </div>

                        <div className="bg-black/30 rounded-2xl border border-white/5 p-4">
                            <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-casino-slate-400">
                                    Your Bets
                                </div>
                                {previousLoading ? (
                                    <div className="text-[10px] text-casino-slate-500">Loading...</div>
                                ) : null}
                            </div>

                            {!profile?.id ? (
                                <div className="text-xs text-casino-slate-500 italic">
                                    Sign in to see your bets for this race.
                                </div>
                            ) : myPreviousBets.length === 0 ? (
                                <div className="text-xs text-casino-slate-500 italic">
                                    You have no bets on this race.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                                            <div className="text-[10px] font-black uppercase tracking-widest text-casino-slate-500">Total Stake</div>
                                            <div className="text-white font-black mt-1">₱{myTotalStake.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                                        </div>
                                        <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                                            <div className="text-[10px] font-black uppercase tracking-widest text-casino-slate-500">Total Winnings</div>
                                            <div className="text-casino-gold-400 font-black mt-1">₱{myTotalPayout.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        {(myPreviousBets || []).slice(0, 5).map((b: any) => {
                                            const betType = String(b?.bet_type || b?.betType || '');
                                            const status = String(b?.status || 'pending');
                                            const selectionLines = formatKareraSelectionLines({
                                                betType,
                                                combinations: b?.combinations,
                                            });

                                                            return (
                                                                <div key={String(b.id)} className="rounded-xl border border-white/5 bg-white/5 p-3">
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <div className="min-w-0">
                                                                            <div className="text-white font-black text-xs uppercase tracking-widest truncate">
                                                                {betTypeTag(betType) || 'BET'}
                                                            </div>
                                                            <div className="text-[10px] text-casino-slate-500 mt-1 truncate">
                                                                {selectionLines.join(' | ')}
                                                            </div>
                                                                        </div>
                                                                        <span
                                                            className={clsx(
                                                                'shrink-0 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border',
                                                                status === 'won'
                                                                    ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                                                    : status === 'lost'
                                                                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                                                        : status === 'refunded' || status === 'cancelled'
                                                                            ? 'bg-neutral-500/10 text-neutral-300 border-neutral-500/20'
                                                                            : 'bg-white/5 text-casino-slate-400 border-white/10'
                                                            )}
                                                        >
                                                            {status}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center justify-between gap-3 mt-2 text-[10px]">
                                                        <div className="text-casino-slate-500 font-bold uppercase tracking-widest">
                                                            Stake: <span className="text-white/80 font-mono">₱{Number(b?.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                                                        </div>
                                                        <div className="text-casino-slate-500 font-bold uppercase tracking-widest">
                                                            Payout:{' '}
                                                            <span className={clsx('font-mono', Number(b?.payout || 0) > 0 ? 'text-casino-gold-400' : 'text-white/60')}>
                                                                ₱{Number(b?.payout || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {myPreviousBets.length > 5 ? (
                                            <Link
                                                to="/history"
                                                className="inline-flex text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors"
                                            >
                                                View all in history
                                            </Link>
                                        ) : null}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </section>
                            </div>
                        </div>
                    ) : null}
                    </>
                ) : (
                    <div className="glass-panel w-full text-left p-4 rounded-xl border border-white/5">
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-casino-slate-500">
                            Previous Race (Today)
                        </div>
                        <div className="text-sm text-casino-slate-400 font-bold mt-1">
                            No finished race yet today.
                        </div>
                    </div>
                )}
            </div>

            <div className="order-10">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {races.length === 0 ? (
                        <div className="col-span-full text-center py-12 glass-panel rounded-xl">
                            <p className="text-casino-slate-400">No active races at the moment.</p>
                        </div>
                    ) : (
                        races.map((race) => {
                            const msToStart = new Date(race.racing_time).getTime() - nowMs;
                            const isLastCall = race.status === 'open' && msToStart > 0 && msToStart <= 5 * 60 * 1000;
                            const isPostTimeReached = Number.isFinite(msToStart) && msToStart <= 0;
                            const isLiveRace = ['open', 'closed'].includes(String(race.status || '')) && isPostTimeReached;
                            const isFeatured = featuredRaceId === race.id;
                            const { label: raceLabel, number: raceNo } = splitRaceTitle(race.name);
                            const tagOrder = ['forecast', 'trifecta', 'quartet', 'daily_double', 'daily_double_plus_one'];
                            const rawBetTypes = Array.isArray(race.bet_types_available) ? race.bet_types_available : [];
                            const betTags = Array.from(
                                new Set(
                                    rawBetTypes
                                        .map((t) => normalizeBetType(String(t || '')).trim())
                                        .filter(Boolean)
                                        // Keep tags aligned with what users can bet on this page
                                        .filter((t) => !['win', 'place', 'pick_4', 'pick_5', 'pick_6', 'wta'].includes(t)),
                                ),
                            );
                            betTags.sort((a, b) => {
                                const ia = tagOrder.indexOf(a);
                                const ib = tagOrder.indexOf(b);
                                if (ia === -1 && ib === -1) return a.localeCompare(b);
                                if (ia === -1) return 1;
                                if (ib === -1) return -1;
                                return ia - ib;
                            });

                            const statusClass =
                                race.status === 'open'
                                    ? 'bg-green-500/20 text-green-400'
                                    : race.status === 'closed'
                                        ? 'bg-yellow-500/20 text-yellow-400'
                                        : 'bg-red-500/20 text-red-400';

                            return (
                                <Link
                                    key={race.id}
                                    to={`/karera/${race.id}${tournamentQuery}`}
                                    className={clsx(
                                        "relative glass-panel p-4 rounded-xl transition-all border group",
                                        isFeatured
                                            ? "border-casino-gold-500/80 ring-2 ring-casino-gold-500/30 shadow-[0_0_0_1px_rgba(245,158,11,0.25),0_0_30px_rgba(245,158,11,0.10)] bg-gradient-to-br from-casino-gold-500/5 via-transparent to-transparent"
                                            : "border-white/5 hover:bg-white/5 hover:border-casino-gold-500/50",
                                    )}
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="min-w-0">
                                            <h3 className="font-black text-lg text-white transition-colors truncate flex items-baseline gap-2">
                                                <span className={clsx("truncate", isFeatured ? "text-casino-gold-200" : "group-hover:text-casino-gold-500")}>
                                                    {raceLabel}
                                                </span>
                                                {raceNo ? (
                                                    <span
                                                        className={clsx(
                                                            "shrink-0 text-2xl font-black tabular-nums tracking-tight",
                                                            isFeatured
                                                                ? "text-casino-gold-400 drop-shadow-[0_0_18px_rgba(245,158,11,0.35)]"
                                                                : "text-casino-gold-500/80",
                                                        )}
                                                    >
                                                        {raceNo}
                                                    </span>
                                                ) : null}
                                            </h3>
                                            <div className="flex items-center gap-2 text-sm text-casino-slate-400 mt-1 flex-wrap">
                                                <Clock size={14} />
                                                <span className="font-mono text-white/70">{new Date(race.racing_time).toLocaleString()}</span>
                                                {Number.isFinite(msToStart) ? (
                                                    msToStart > 0 ? (
                                                        <span className="font-mono font-black text-casino-gold-400 drop-shadow-[0_0_14px_rgba(245,158,11,0.25)]">
                                                            {formatCountdown(msToStart)} to start
                                                        </span>
                                                    ) : (
                                                        <span
                                                            className={clsx(
                                                                "px-2 py-0.5 rounded bg-red-500/15 text-red-200 border border-red-500/20 text-[10px] font-black uppercase tracking-widest",
                                                                isLiveRace ? "animate-pulse" : null,
                                                            )}
                                                        >
                                                            Post time reached
                                                        </span>
                                                    )
                                                ) : null}
                                                {isLastCall ? (
                                                    <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/20 text-[10px] font-black uppercase tracking-widest animate-pulse">
                                                        LAST CALL
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {isFeatured && isLiveRace ? (
                                                <div className="px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest bg-casino-gold-500 text-black shadow-lg shadow-casino-gold-500/20 animate-pulse">
                                                    Featured live
                                                </div>
                                            ) : isLiveRace ? (
                                                <div className="px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest bg-green-500/20 text-green-300 border border-green-500/20">
                                                    Live
                                                </div>
                                            ) : null}
                                            <div className={clsx('px-2 py-1 rounded text-xs font-bold uppercase', statusClass)}>{race.status}</div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 text-xs text-casino-slate-500 flex-wrap">
                                        {race.website_url && <Tv size={14} className="text-blue-400" />}
                                        {betTags.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {betTags.map((bt) => (
                                                    <span
                                                        key={bt}
                                                        className="px-2 py-0.5 rounded bg-black/30 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/70"
                                                    >
                                                        {betTypeTag(bt)}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-[10px] text-casino-slate-600 font-bold uppercase tracking-widest">
                                                No bet types
                                            </span>
                                        )}
                                    </div>
                                </Link>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};
