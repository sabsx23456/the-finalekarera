import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trophy, Clock, Tv } from 'lucide-react';

import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { useToast } from '../../components/ui/Toast';
import { KareraLiveBoard } from '../../components/karera/KareraLiveBoard';
import type { LiveBoardData } from '../../components/karera/KareraLiveBoard';
import { KareraProgramBoard, type ProgramBoardData } from '../../components/karera/KareraProgramBoard';
import { KareraDividendsBoard } from '../../components/karera/KareraDividendsBoard';
import { BetReceiptModal, type BetReceiptData } from '../../components/karera/BetReceiptModal';
import { fetchVisionData } from '../../services/visionAi';
import type { BetType, KareraBet, KareraHorse, KareraRace } from '../../types/karera';
import { estimateHorseDividendFromRowTotal } from '../../lib/kareraCalculations';
import { useKareraLobbySettings } from '../../hooks/useKareraLobbySettings';
import {
  computeKareraCombos,
  deriveKareraUnits,
  formatKareraSelectionLines,
  getKareraUnitCost,
  normalizeHorseNumbers,
} from '../../lib/kareraBetUtils';

type OpenRace = Pick<KareraRace, 'id' | 'name' | 'racing_time' | 'status'>;

export const KareraBetting = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const tournamentIdFromUrl = String(searchParams.get('tournament') || '').trim();
  const { profile } = useAuthStore();
  const { showToast } = useToast();
  const { offline: isKareraOffline, nextRaceText, promoEnabled, promoPercent, promoBannerText, loading: kareraSettingsLoading } = useKareraLobbySettings();

  const [race, setRace] = useState<KareraRace | null>(null);
  const [horses, setHorses] = useState<KareraHorse[]>([]);
  const [openRaces, setOpenRaces] = useState<OpenRace[]>([]);

  // Live boards (latest snapshots)
  const [liveBoards, setLiveBoards] = useState<{
    daily_double: LiveBoardData | null;
    forecast: LiveBoardData | null;
    pick_4: ProgramBoardData | null;
    pick_5: ProgramBoardData | null;
    pick_6: ProgramBoardData | null;
    wta: ProgramBoardData | null;
  }>(() => ({
    daily_double: null,
    forecast: null,
    pick_4: null,
    pick_5: null,
    pick_6: null,
    wta: null,
  }));
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Betting
  const [selectedBetType, setSelectedBetType] = useState<BetType>('forecast');
  const [comboSelections, setComboSelections] = useState<Record<number, number[]>>({});
  const [multiSelections, setMultiSelections] = useState<number[]>([]);

  // DD / DD+1
  const [legsRaces, setLegsRaces] = useState<OpenRace[]>([]);
  const [legsHorses, setLegsHorses] = useState<Record<string, KareraHorse[]>>({});
  const [legsSelections, setLegsSelections] = useState<Record<string, number[]>>({});

  const [units, setUnits] = useState<number>(1);
  const [placingBet, setPlacingBet] = useState(false);

  // Receipt
  const [receipt, setReceipt] = useState<BetReceiptData | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  // My bets (for this race)
  const [myBets, setMyBets] = useState<KareraBet[]>([]);
  const [myBetsLoading, setMyBetsLoading] = useState(false);

  // Last Race Logic (used for live board context label only)
  const [isLastRace, setIsLastRace] = useState(false);
  const isLastRaceRef = useRef(false);

  // Data visuals tab (DD pays vs Forecast pays vs AI dividends)
  const [visualTab, setVisualTab] = useState<'dd' | 'forecast' | 'pick_4' | 'pick_5' | 'pick_6' | 'wta' | 'dividends'>('dd');
  const visualTabUserSelectedRef = useRef(false);

  const isOrderCapableBet = ['forecast', 'trifecta', 'quartet'].includes(selectedBetType);
  const isMultiRaceBet = ['daily_double', 'daily_double_plus_one'].includes(selectedBetType);

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const formatCountdown = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
    return `${m}:${pad2(s)}`;
  };

  const betTypeTabLabel = (bt: BetType | string) => {
    const t = String(bt || '').trim();
    if (t === 'daily_double') return 'DD';
    if (t === 'daily_double_plus_one') return 'DD+1';
    return t.replace(/_/g, ' ');
  };

  const formatPesoUi = (value: number) => {
    const safe = Number.isFinite(value) ? value : 0;
    return `\u20B1${safe.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const promoForReceipt = useMemo(() => {
    if (!promoEnabled) return null;
    const pct = Number(promoPercent);
    if (!Number.isFinite(pct) || pct <= 0) return null;
    const pctText = Number.isInteger(pct) ? String(pct) : String(pct);
    const template = String(promoBannerText || '').trim() || 'BOOKIS +{percent}% PER BET';
    const text = template.split('{percent}').join(pctText);
    return { pct, text };
  }, [promoBannerText, promoEnabled, promoPercent]);

  const watchLiveUrl = useMemo(() => {
    const raw = String(race?.website_url || '').trim();
    if (!raw) return null;

    try {
      const u = new URL(raw);
      if (!['http:', 'https:'].includes(u.protocol)) return null;
      return u.toString();
    } catch {
      // Common admin input: "domain.com/path" without a scheme.
      try {
        const u = new URL(`https://${raw}`);
        if (!['http:', 'https:'].includes(u.protocol)) return null;
        return u.toString();
      } catch {
        return null;
      }
    }
  }, [race?.website_url]);

  const handleWatchLive = () => {
    if (!watchLiveUrl) {
      showToast('No live link available for this race.', 'error');
      return;
    }

    // Keep the betting page intact. If popups are blocked, just show a message.
    const w = window.open(watchLiveUrl, '_blank', 'noopener,noreferrer');
    if (!w) {
      showToast('Popup blocked. Please allow popups to watch live.', 'error');
    }
  };

  const requiredSlots =
    selectedBetType === 'forecast' ? 2 : selectedBetType === 'trifecta' ? 3 : selectedBetType === 'quartet' ? 4 : 1;

  const unitCost = useMemo(() => {
    // PH minimum ticket pricing
    return ['win', 'place', 'forecast', 'daily_double', 'daily_double_plus_one'].includes(selectedBetType) ? 5 : 2;
  }, [selectedBetType]);

  const safeUnits = useMemo(() => {
    if (!Number.isFinite(units)) return 1;
    return Math.max(1, Math.floor(units));
  }, [units]);

  const bumpTickets = (delta: number) => {
    setUnits((prev) => {
      const base = Number.isFinite(prev) ? Math.max(1, Math.floor(prev)) : 1;
      const next = base + delta;
      return Math.max(1, next);
    });
  };

  const racesById = useMemo(() => {
    const map: Record<string, { name?: string; racing_time?: string }> = {};
    if (race?.id) map[race.id] = { name: race.name, racing_time: race.racing_time };
    (openRaces || []).forEach((r) => {
      if (!r?.id) return;
      map[r.id] = { name: r.name, racing_time: r.racing_time };
    });
    return map;
  }, [race, openRaces]);

  const buildCellMap = (board: LiveBoardData | null) => {
    const map = new Map<string, { display: number; is_capped?: boolean }>();
    if (!board) return map;
    (board.cells || []).forEach((c) => {
      if (!c) return;
      map.set(`${c.i}-${c.j}`, { display: Number(c.display), is_capped: Boolean((c as any).is_capped) });
    });
    return map;
  };

  const ddCellMap = useMemo(() => buildCellMap(liveBoards.daily_double), [liveBoards.daily_double]);
  const forecastCellMap = useMemo(() => buildCellMap(liveBoards.forecast), [liveBoards.forecast]);

  const isStoredBoardLike = (v: any): v is LiveBoardData => {
    if (!v || typeof v !== 'object') return false;
    return Array.isArray((v as any).cells);
  };

  const isStoredProgramBoardLike = (v: any): v is ProgramBoardData => {
    if (!v || typeof v !== 'object') return false;
    return Array.isArray((v as any).entries);
  };

  const emptyStoredBoards = () => ({
    daily_double: null as LiveBoardData | null,
    forecast: null as LiveBoardData | null,
    pick_4: null as ProgramBoardData | null,
    pick_5: null as ProgramBoardData | null,
    pick_6: null as ProgramBoardData | null,
    wta: null as ProgramBoardData | null,
  });

  const parseStoredLiveBoards = (raw: any) => {
    if (!raw || typeof raw !== 'object') return emptyStoredBoards();

    // Legacy shape: board object directly stored as `data`
    if (
      isStoredBoardLike(raw) &&
      !('daily_double' in raw) &&
      !('forecast' in raw) &&
      !('pick_4' in raw) &&
      !('pick_5' in raw) &&
      !('pick_6' in raw) &&
      !('wta' in raw)
    ) {
      const out = emptyStoredBoards();
      out.daily_double = raw as LiveBoardData;
      return out;
    }

    const dd = isStoredBoardLike((raw as any).daily_double) ? ((raw as any).daily_double as LiveBoardData) : null;
    const fc = isStoredBoardLike((raw as any).forecast) ? ((raw as any).forecast as LiveBoardData) : null;
    const p4 = isStoredProgramBoardLike((raw as any).pick_4) ? ((raw as any).pick_4 as ProgramBoardData) : null;
    const p5 = isStoredProgramBoardLike((raw as any).pick_5) ? ((raw as any).pick_5 as ProgramBoardData) : null;
    const p6 = isStoredProgramBoardLike((raw as any).pick_6) ? ((raw as any).pick_6 as ProgramBoardData) : null;
    const wta = isStoredProgramBoardLike((raw as any).wta) ? ((raw as any).wta as ProgramBoardData) : null;

    return { daily_double: dd, forecast: fc, pick_4: p4, pick_5: p5, pick_6: p6, wta };
  };

  // Keep the visual tab on an available board if only one exists.
  useEffect(() => {
    if (visualTabUserSelectedRef.current) return;
    if (visualTab === 'dividends') return;

    const hasData = (tab: typeof visualTab) => {
      if (tab === 'dd') return Boolean(liveBoards.daily_double);
      if (tab === 'forecast') return Boolean(liveBoards.forecast);
      if (tab === 'pick_4') return Boolean(liveBoards.pick_4);
      if (tab === 'pick_5') return Boolean(liveBoards.pick_5);
      if (tab === 'pick_6') return Boolean(liveBoards.pick_6);
      if (tab === 'wta') return Boolean(liveBoards.wta);
      return false;
    };

    if (hasData(visualTab)) return;

    const next = (['dd', 'forecast', 'pick_4', 'pick_5', 'pick_6', 'wta'] as const).find((t) => hasData(t));
    if (next && next !== visualTab) setVisualTab(next);
  }, [
    liveBoards.daily_double,
    liveBoards.forecast,
    liveBoards.pick_4,
    liveBoards.pick_5,
    liveBoards.pick_6,
    liveBoards.wta,
    visualTab,
  ]);

  const dividendByHorse = useMemo(() => {
    const map = new Map<number, number>();
    (horses || []).forEach((h) => {
      const v = Number((h as any)?.current_dividend ?? 0);
      if (!Number.isFinite(v)) return;
      map.set(h.horse_number, v);
    });
    return map;
  }, [horses]);

  const resolvedTournamentId = String(tournamentIdFromUrl || (race as any)?.tournament_id || '').trim();
  const tournamentQuery = resolvedTournamentId ? `?tournament=${encodeURIComponent(resolvedTournamentId)}` : '';

  // Load the user's existing bets for this race.
  useEffect(() => {
    if (!id) return;
    if (!profile?.id) return;

    let cancelled = false;

    (async () => {
      setMyBetsLoading(true);
      try {
        const { data, error } = await supabase
          .from('karera_bets')
          .select('*')
          .eq('race_id', id)
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) throw error;
        if (cancelled) return;
        setMyBets((data || []) as KareraBet[]);
      } catch (err) {
        console.error('Failed to load my karera bets:', err);
      } finally {
        if (!cancelled) setMyBetsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, profile?.id]);

  // Fetch race + horses + open race sequence (for DD legs)
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);
      try {
        const raceRes = await supabase.from('karera_races').select('*').eq('id', id).single();
        if (raceRes.error) throw raceRes.error;

        const raceRow = raceRes.data as KareraRace;
        const tournamentId = String((raceRow as any)?.tournament_id || tournamentIdFromUrl || '').trim();

        const fetchOpenRaces = async () => {
          let query = supabase.from('karera_races').select('id, name, racing_time, status').eq('status', 'open');
          if (tournamentId) query = query.eq('tournament_id', tournamentId);

          let res = await query.order('racing_time', { ascending: true });
          if (res.error && /column .*tournament_id.* does not exist/i.test(res.error.message || '')) {
            res = await supabase
              .from('karera_races')
              .select('id, name, racing_time, status')
              .eq('status', 'open')
              .order('racing_time', { ascending: true });
          }
          return res;
        };

        const [horsesRes, openRes, boardRes] = await Promise.all([
          supabase.from('karera_horses').select('*').eq('race_id', id).order('horse_number'),
          fetchOpenRaces(),
          supabase.from('karera_live_boards').select('data').eq('race_id', id).maybeSingle(),
        ]);

        if (cancelled) return;

        setRace(raceRow);
        if (horsesRes.data) setHorses(horsesRes.data as KareraHorse[]);
        if (openRes.data) setOpenRaces(openRes.data as OpenRace[]);

        if (openRes.data) {
          const races = openRes.data as OpenRace[];
          const currentIdx = races.findIndex((r) => r.id === id);
          const last = currentIdx >= 0 && currentIdx === races.length - 1;
          setIsLastRace(last);
          isLastRaceRef.current = last;
        }

        setLiveBoards(parseStoredLiveBoards(boardRes.data?.data));
      } catch (err) {
        console.error('Failed to load karera race:', err);
        if (!cancelled) {
          setRace(null);
          setHorses([]);
          setOpenRaces([]);
          setLiveBoards({ daily_double: null, forecast: null, pick_4: null, pick_5: null, pick_6: null, wta: null });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [id, tournamentIdFromUrl]);

  // Realtime race updates (status / racing_time / etc)
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`karera_race_watch:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'karera_races', filter: `id=eq.${id}` }, (payload) => {
        const updated = payload.new as KareraRace;
        if (!updated?.id) return;
        setRace((prev) => (prev ? ({ ...prev, ...updated } as KareraRace) : (updated as KareraRace)));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  // Realtime live board updates (from admin AI image uploads)
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`karera_live_board:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'karera_live_boards', filter: `race_id=eq.${id}` }, (payload) => {
        const row = payload.new as any;
        if (!row) {
          setLiveBoards({ daily_double: null, forecast: null, pick_4: null, pick_5: null, pick_6: null, wta: null });
          return;
        }
        setLiveBoards(parseStoredLiveBoards(row.data));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  // Realtime horses (current race + DD legs)
  useEffect(() => {
    if (!id) return;

    const watchRaceIds = Array.from(new Set([id, ...legsRaces.map((r) => r.id)].filter(Boolean)));

    const handleHorseUpdate = (updated: KareraHorse) => {
      if (!updated?.id) return;

      if (updated.race_id === id) {
        setHorses((prev) => {
          const next = prev.map((h) => (h.id === updated.id ? { ...h, ...updated } : h));
          next.sort((a, b) => a.horse_number - b.horse_number);
          return next;
        });
      }

      setLegsHorses((prev) => {
        const list = prev[updated.race_id];
        if (!list) return prev;
        const next = list.map((h) => (h.id === updated.id ? { ...h, ...updated } : h));
        next.sort((a, b) => a.horse_number - b.horse_number);
        return { ...prev, [updated.race_id]: next };
      });

      if (updated.status === 'scratched') {
        // If user had this horse selected, remove it (avoids a bet slip that can't be placed)
        if (updated.race_id === id) {
          setMultiSelections((prev) => prev.filter((n) => n !== updated.horse_number));
          setComboSelections((prev) => {
            let changed = false;
            const next: Record<number, number[]> = {};
            for (const [k, arr] of Object.entries(prev)) {
              const a = arr || [];
              const filtered = a.filter((n) => n !== updated.horse_number);
              if (filtered.length !== a.length) changed = true;
              next[Number(k)] = filtered;
            }
            return changed ? next : prev;
          });
        }

        setLegsSelections((prev) => {
          const arr = prev[updated.race_id];
          if (!arr || arr.length === 0) return prev;
          const filtered = arr.filter((n) => n !== updated.horse_number);
          if (filtered.length === arr.length) return prev;
          return { ...prev, [updated.race_id]: filtered };
        });
      }
    };

    const channel = supabase.channel(`karera_horses_watch:${id}`);
    watchRaceIds.forEach((raceId) => {
      channel.on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'karera_horses', filter: `race_id=eq.${raceId}` },
        (payload) => handleHorseUpdate(payload.new as KareraHorse),
      );
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, legsRaces]);

  // Vision poll (optional)
  useEffect(() => {
    if (!id) return;

    const functionUrl = import.meta.env.VITE_SUPABASE_FUNCTION_URL as string | undefined;
    if (!functionUrl || functionUrl.includes('YOUR_PROJECT_REF')) return;

    const streamUrl = race?.website_url || '';
    if (!streamUrl) return;

    let cancelled = false;
    let timeout: number | undefined;
    let backoffMs = 5000;

    const tick = async () => {
      if (cancelled) return;

      // Don't hammer the backend (and don't waste CPU) while the tab is hidden.
      if (document.visibilityState !== 'visible') {
        timeout = window.setTimeout(tick, Math.max(backoffMs, 15000));
        return;
      }

      const contextType = isLastRaceRef.current ? 'FORECAST' : 'DAILY_DOUBLE';
      const newData = await fetchVisionData(id, streamUrl, contextType);
      if (cancelled) return;

      if (!newData) {
        backoffMs = Math.min(backoffMs * 2, 30000);
        timeout = window.setTimeout(tick, backoffMs);
        return;
      }

      backoffMs = 5000;

      setLiveBoards((prev) => ({
        ...prev,
        daily_double: contextType === 'DAILY_DOUBLE' ? (newData as LiveBoardData) : prev.daily_double,
        forecast: contextType === 'FORECAST' ? (newData as LiveBoardData) : prev.forecast,
      }));

      // Best-effort: update dividends from row totals (current race)
      setHorses((prev) =>
        prev.map((h) => {
          const totalBet = newData.row_totals[h.horse_number] || 1000;
          return { ...h, current_dividend: estimateHorseDividendFromRowTotal(totalBet) };
        }),
      );

      timeout = window.setTimeout(tick, backoffMs);
    };

    tick();

    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [id, race?.website_url]);

  // Reset selections when bet type changes
  useEffect(() => {
    setComboSelections({});
    setMultiSelections([]);
    setLegsSelections({});
    setUnits(1);
  }, [selectedBetType]);

  const hasNextLeg = useMemo(() => {
    if (!id) return false;
    const idx = openRaces.findIndex((r) => r.id === id);
    return idx >= 0 && idx + 1 < openRaces.length;
  }, [id, openRaces]);

  const hasNext2Leg = useMemo(() => {
    if (!id) return false;
    const idx = openRaces.findIndex((r) => r.id === id);
    return idx >= 0 && idx + 2 < openRaces.length;
  }, [id, openRaces]);

  const normalizedAvailableBetTypes = useMemo(() => {
    const raw = (race?.bet_types_available || []) as unknown as string[];
    const normalized = raw.map((bt) => (bt === 'winner_take_all' ? 'wta' : bt));

    // Pick tickets live on /karera/program
    const withoutProgram = normalized.filter((bt) => !['pick_4', 'pick_5', 'pick_6', 'wta', 'win', 'place'].includes(bt));

    return withoutProgram
      .sort((a, b) => {
        const order = ['forecast', 'trifecta', 'quartet', 'daily_double', 'daily_double_plus_one'];
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        if (ia === -1 && ib === -1) return a.localeCompare(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
       return ia - ib;
      }) as BetType[];
  }, [race?.bet_types_available]);

  const betTypeDisabled = useMemo(() => {
    const map: Record<string, boolean> = {};
    (normalizedAvailableBetTypes as unknown as string[]).forEach((bt) => {
      if (bt === 'daily_double') map[bt] = !hasNextLeg;
      else if (bt === 'daily_double_plus_one') map[bt] = !hasNext2Leg;
      else map[bt] = false;
    });
    return map;
  }, [hasNext2Leg, hasNextLeg, normalizedAvailableBetTypes]);

  useEffect(() => {
    if (!race) return;
    if (normalizedAvailableBetTypes.length === 0) return;

    if (!normalizedAvailableBetTypes.includes(selectedBetType)) {
      setSelectedBetType(normalizedAvailableBetTypes[0]);
      return;
    }

    if (betTypeDisabled[String(selectedBetType)]) {
      const next = normalizedAvailableBetTypes.find((bt) => !betTypeDisabled[String(bt)]);
      if (next && next !== selectedBetType) setSelectedBetType(next);
    }
  }, [betTypeDisabled, race, normalizedAvailableBetTypes, selectedBetType]);

  // DD / DD+1: build legs based on open-race sequence and load horses for all legs
  useEffect(() => {
    if (!id) return;
    if (!isMultiRaceBet) {
      setLegsRaces([]);
      setLegsHorses({});
      setLegsSelections({});
      return;
    }

    const need = selectedBetType === 'daily_double' ? 2 : 3;
    const idx = openRaces.findIndex((r) => r.id === id);
    if (idx < 0 || idx + need - 1 >= openRaces.length) {
      setLegsRaces([]);
      setLegsHorses({});
      setLegsSelections({});
      return;
    }

    const legRaces = openRaces.slice(idx, idx + need);
    const legIds = legRaces.map((r) => r.id);
    setLegsRaces(legRaces);

    setLegsSelections((prev) => {
      const next: Record<string, number[]> = {};
      legIds.forEach((rid) => (next[rid] = prev[rid] || []));
      return next;
    });

    (async () => {
      const { data, error } = await supabase.from('karera_horses').select('*').in('race_id', legIds).order('horse_number');
      if (error) {
        console.error('Failed to load DD legs horses:', error);
        return;
      }

      const map: Record<string, KareraHorse[]> = {};
      (data as KareraHorse[] | null)?.forEach((h) => {
        if (!map[h.race_id]) map[h.race_id] = [];
        map[h.race_id].push(h);
      });
      setLegsHorses(map);
    })();
  }, [id, isMultiRaceBet, openRaces, selectedBetType]);

  const comboPositions = useMemo(() => {
    return Array.from({ length: requiredSlots }).map((_, i) => comboSelections[i] || []);
  }, [comboSelections, requiredSlots]);

  const combos = useMemo(() => {
    // Win/Place: one combo per selected horse
    if (selectedBetType === 'win' || selectedBetType === 'place') return multiSelections.length;

    // Forecast/Trifecta/Quartet:
    // Straight = 1 (exact order)
    // Combo = choose horses per finishing position (invalid duplicates auto-excluded)
    if (isOrderCapableBet) {
      if (comboPositions.some((arr) => arr.length === 0)) return 0;

      let total = 0;
      const used = new Set<number>();

      const walk = (idx: number) => {
        if (idx >= comboPositions.length) {
          total += 1;
          return;
        }

        for (const horseNumber of comboPositions[idx]) {
          if (used.has(horseNumber)) continue;
          used.add(horseNumber);
          walk(idx + 1);
          used.delete(horseNumber);
        }
      };

      walk(0);
      return total;
    }

    // DD/DD+1: product of selections per leg
    if (isMultiRaceBet) {
      if (legsRaces.length === 0) return 0;
      let total = 1;
      for (const leg of legsRaces) {
        const count = legsSelections[leg.id]?.length || 0;
        if (count === 0) return 0;
        total *= count;
      }
      return total;
    }

    return 0;
  }, [
    isMultiRaceBet,
    isOrderCapableBet,
    comboSelections,
    comboPositions,
    legsRaces,
    legsSelections,
    multiSelections,
    requiredSlots,
    selectedBetType,
  ]);

  const comboImpossibleReason = useMemo(() => {
    if (!isOrderCapableBet) return null;
    if (comboPositions.some((arr) => arr.length === 0)) return null; // incomplete selection

    const labels = ['1ST', '2ND', '3RD', '4TH'];

    const used = new Set<number>();
    const path: number[] = [];
    const memo = new Map<string, boolean>();

    const keyFor = (idx: number) => {
      const usedKey = Array.from(used).sort((a, b) => a - b).join(',');
      return `${idx}|${usedKey}`;
    };

    const hasCompletion = (idx: number): boolean => {
      if (idx >= comboPositions.length) return true;
      const key = keyFor(idx);
      const cached = memo.get(key);
      if (cached !== undefined) return cached;

      for (const v of comboPositions[idx]) {
        if (used.has(v)) continue;
        used.add(v);
        const ok = hasCompletion(idx + 1);
        used.delete(v);
        if (ok) {
          memo.set(key, true);
          return true;
        }
      }

      memo.set(key, false);
      return false;
    };

    const explore = (idx: number): string | null => {
      if (idx >= comboPositions.length - 1) return null;

      for (const v of comboPositions[idx]) {
        if (used.has(v)) continue;
        used.add(v);
        path.push(v);

        if (!hasCompletion(idx + 1)) {
          const prefixText = path.map((n, i) => `${labels[i]}: ${n}`).join(' | ');
          const msg = `Impossible bet: if ${prefixText}, there is no valid completion.`;
          path.pop();
          used.delete(v);
          return msg;
        }

        const deeper = explore(idx + 1);
        path.pop();
        used.delete(v);
        if (deeper) return deeper;
      }

      return null;
    };

    return explore(0);
  }, [comboPositions, isOrderCapableBet]);

  const totalCost = useMemo(() => combos * unitCost * safeUnits, [combos, safeUnits, unitCost]);

  const livePaysPreview = useMemo(() => {
    const isForecastBet = selectedBetType === 'forecast';
    const isDdBet = selectedBetType === 'daily_double' || selectedBetType === 'daily_double_plus_one';

    const board = isForecastBet ? liveBoards.forecast : isDdBet ? liveBoards.daily_double : null;
    const cellMap = isForecastBet ? forecastCellMap : isDdBet ? ddCellMap : null;
    if (!board || !cellMap) return null;

    // Determine which selections map to the current live board (FORECAST matrix for last race, DD matrix otherwise).
    let rows: number[] = [];
    let cols: number[] = [];
    let label = 'Live pays';
    let excludeSameHorse = false;

    if (isForecastBet) {
      rows = comboPositions[0] || [];
      cols = comboPositions[1] || [];
      excludeSameHorse = true;
    } else if (isDdBet && legsRaces.length >= 2) {
      rows = legsSelections[legsRaces[0].id] || [];
      cols = legsSelections[legsRaces[1].id] || [];
      label = selectedBetType === 'daily_double_plus_one' ? 'Live pays (L1-L2)' : 'Live pays';
    } else {
      return null;
    }

    const values: number[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      for (const c of cols) {
        const i = Number(r);
        const j = Number(c);
        if (!Number.isFinite(i) || !Number.isFinite(j) || i <= 0 || j <= 0) continue;
        if (excludeSameHorse && i === j) continue;
        const key = `${i}-${j}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const cell = cellMap.get(key);
        const d = cell ? Number(cell.display) : NaN;
        if (!Number.isFinite(d) || d <= 0) continue;
        values.push(d);
      }
    }

    if (values.length === 0) return null;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const pct = promoForReceipt?.pct;
    const promoFactor = typeof pct === 'number' && Number.isFinite(pct) && pct > 0 ? 1 + pct / 100 : 1;
    const stakePerComboPromo = unitCost * safeUnits * promoFactor;
    const minPay = stakePerComboPromo * min;
    const maxPay = stakePerComboPromo * max;

    return {
      label,
      min,
      max,
      minPay,
      maxPay,
      promoPct: typeof pct === 'number' && Number.isFinite(pct) && pct > 0 ? pct : null,
    };
  }, [
    comboPositions,
    legsRaces,
    legsSelections,
    liveBoards.daily_double,
    liveBoards.forecast,
    ddCellMap,
    forecastCellMap,
    promoForReceipt?.pct,
    safeUnits,
    selectedBetType,
    unitCost,
  ]);

  const toggleMultiSelection = (horseNumber: number) => {
    setMultiSelections((prev) => {
      const next = prev.includes(horseNumber) ? prev.filter((n) => n !== horseNumber) : [...prev, horseNumber];
      next.sort((a, b) => a - b);
      return next;
    });
  };

  const toggleComboSelection = (horseNumber: number, positionIndex: number) => {
    setComboSelections((prev) => {
      const current = prev[positionIndex] || [];
      const next = current.includes(horseNumber) ? current.filter((n) => n !== horseNumber) : [...current, horseNumber];
      next.sort((a, b) => a - b);
      return { ...prev, [positionIndex]: next };
    });
  };

  const toggleLegSelection = (raceId: string, horseNumber: number) => {
    setLegsSelections((prev) => {
      const current = prev[raceId] || [];
      const next = current.includes(horseNumber) ? current.filter((n) => n !== horseNumber) : [...current, horseNumber];
      next.sort((a, b) => a - b);
      return { ...prev, [raceId]: next };
    });
  };

  const clearCurrentSelection = () => {
    if (selectedBetType === 'win' || selectedBetType === 'place') {
      setMultiSelections([]);
      return;
    }

    if (isOrderCapableBet) {
      setComboSelections({});
      return;
    }

    if (isMultiRaceBet) {
      setLegsSelections({});
      return;
    }
  };

  const selectionsLabel = useMemo(() => {
    if (selectedBetType === 'win' || selectedBetType === 'place') {
      return multiSelections.length > 0 ? multiSelections.map((n) => `#${n}`).join(', ') : null;
    }

    if (isOrderCapableBet) {
      const any = comboPositions.some((arr) => arr.length > 0);
      if (!any) return null;

      return comboPositions
        .map((arr, idx) => {
          const label = idx === 0 ? '1st' : idx === 1 ? '2nd' : idx === 2 ? '3rd' : '4th';
          const text = arr.length > 0 ? arr.map((n) => `#${n}`).join(', ') : '-';
          return `${label}: ${text}`;
        })
        .join(' | ');
    }

    if (isMultiRaceBet) {
      if (legsRaces.length === 0) return null;
      return legsRaces
        .map((r, idx) => {
          const sel = legsSelections[r.id] || [];
          const text = sel.length > 0 ? sel.map((n) => `#${n}`).join(', ') : '-';
          return `L${idx + 1}: ${text}`;
        })
        .join(' | ');
    }

    return null;
  }, [
    isMultiRaceBet,
    isOrderCapableBet,
    comboPositions,
    legsRaces,
    legsSelections,
    multiSelections,
    selectedBetType,
  ]);

  const placeBet = async () => {
    if (!profile || !race) return;

    if (race.status !== 'open') {
      showToast('Betting is closed for this race.', 'error');
      return;
    }

    if (combos <= 0 || totalCost <= 0) {
      showToast('Please complete your selections.', 'error');
      return;
    }

    if (isOrderCapableBet && comboImpossibleReason) {
      showToast(comboImpossibleReason, 'error');
      return;
    }

    setPlacingBet(true);
    try {
      if ((profile.balance || 0) < totalCost) {
        showToast('Insufficient balance', 'error');
        return;
      }

      let payload: any = {};
      if (selectedBetType === 'win' || selectedBetType === 'place') {
        payload = { horses: multiSelections };
      } else if (isOrderCapableBet) {
        payload = { mode: 'combo', positions: comboPositions };
      } else if (isMultiRaceBet) {
        payload = {
          legs: legsRaces.map((r) => ({
            race_id: r.id,
            horses: legsSelections[r.id] || [],
          })),
        };
      } else {
        showToast('This bet type is not supported on this page. Use Program Betting.', 'error');
        return;
      }

      const { data, error } = await supabase.rpc('place_karera_bet', {
        p_race_id: race.id,
        p_bet_type: selectedBetType,
        p_payload: payload,
        p_units: safeUnits,
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to place bet');

      const issuedAt = data?.created_at || new Date().toISOString();
      const combosFromServer = Number(data?.combos ?? combos);
      const unitCostFromServer = Number(data?.unit_cost ?? unitCost);
      const unitsFromServer = Number(data?.units ?? safeUnits);
      const amountFromServer = Number(data?.amount ?? totalCost);

      const selectionLines: string[] = [];
      if (selectedBetType === 'win' || selectedBetType === 'place') {
        selectionLines.push(`HORSES: ${(multiSelections || []).join(', ')}`);
      } else if (isOrderCapableBet) {
        const labels = ['1ST', '2ND', '3RD', '4TH'];
        comboPositions.forEach((arr, idx) => {
          selectionLines.push(`${labels[idx]}: ${arr.join(', ')}`);
        });
      } else if (isMultiRaceBet) {
        legsRaces.forEach((leg, idx) => {
          const arr = legsSelections[leg.id] || [];
          selectionLines.push(`LEG ${idx + 1} (${leg.name}): ${arr.join(', ')}`);
        });
      }

      setReceipt({
        website: 'www.sabong192.live',
        betId: data?.bet_id,
        issuedAt,
        raceName: race.name,
        raceTime: new Date(race.racing_time).toLocaleString(),
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

      const newBetId = String(data?.bet_id || '');
      if (newBetId) {
        setMyBets((prev) => [
          {
            id: newBetId,
            user_id: profile.id,
            race_id: race.id,
            amount: amountFromServer,
            bet_type: selectedBetType,
            combinations: payload,
            status: 'pending',
            payout: 0,
            created_at: issuedAt,
            promo_percent: promoForReceipt?.pct ?? 0,
            promo_text: promoForReceipt?.text ?? null,
          } as KareraBet,
          ...prev,
        ]);
      }

      useAuthStore.getState().refreshProfile();
      showToast('Bet placed successfully!', 'success');

      setMultiSelections([]);
      setLegsSelections({});
      setComboSelections({});
      setUnits(1);
    } catch (err: any) {
      console.error(err);
      showToast('Failed to place bet: ' + err.message, 'error');
    } finally {
      setPlacingBet(false);
    }
  };

  const refreshMyBets = async () => {
    if (!id) return;
    if (!profile?.id) return;

    setMyBetsLoading(true);
    try {
      const { data, error } = await supabase
        .from('karera_bets')
        .select('*')
        .eq('race_id', id)
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      setMyBets((data || []) as KareraBet[]);
    } catch (err) {
      console.error('Failed to refresh my karera bets:', err);
    } finally {
      setMyBetsLoading(false);
    }
  };

  const openReceiptForMyBet = (bet: KareraBet) => {
    if (!race) return;

    const betType = String((bet as any)?.bet_type || '');
    const unitCostForType = getKareraUnitCost(betType);
    const combosForType = computeKareraCombos(betType, (bet as any)?.combinations);
    const unitsForType = deriveKareraUnits((bet as any)?.amount, combosForType, unitCostForType);

    const amount = Number((bet as any)?.amount || 0);
    const betPromoPercent = Number((bet as any)?.promo_percent || 0);
    const betPromoTemplate = String((bet as any)?.promo_text || '').trim();
    const betPromoText = betPromoTemplate
      ? betPromoTemplate.split('{percent}').join(Number.isInteger(betPromoPercent) ? String(betPromoPercent) : String(betPromoPercent))
      : promoForReceipt?.text;
    const selectionLines = formatKareraSelectionLines({
      betType,
      combinations: (bet as any)?.combinations,
      racesById,
    });

    setReceipt({
      website: 'www.sabong192.live',
      betId: String((bet as any)?.id || ''),
      issuedAt: String((bet as any)?.created_at || new Date().toISOString()),
      raceName: race.name,
      raceTime: new Date(race.racing_time).toLocaleString(),
      betType,
      selections: selectionLines,
      combos: combosForType,
      unitCost: unitCostForType,
      units: unitsForType,
      amount,
      promoPercent: Number.isFinite(betPromoPercent) && betPromoPercent > 0 ? betPromoPercent : undefined,
      promoText: Number.isFinite(betPromoPercent) && betPromoPercent > 0 ? betPromoText : undefined,
    });
    setReceiptOpen(true);
  };

  const getMyBetLiveSummary = (bet: KareraBet): string | null => {
    const betType = String((bet as any)?.bet_type || '');
    const combosForType = computeKareraCombos(betType, (bet as any)?.combinations);
    const unitCostForType = getKareraUnitCost(betType);
    const unitsForType = deriveKareraUnits((bet as any)?.amount, combosForType, unitCostForType);
    const stakePerCombo = unitCostForType * unitsForType;
    const promoPct = Number((bet as any)?.promo_percent || 0);
    const promoFactor = Number.isFinite(promoPct) && promoPct > 0 ? 1 + promoPct / 100 : 1;
    const stakePerComboPromo = stakePerCombo * promoFactor;

    if (betType === 'win' || betType === 'place') {
      const picks = normalizeHorseNumbers((bet as any)?.combinations?.horses);
      const dividends = picks
        .map((n) => dividendByHorse.get(n))
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
      if (dividends.length === 0) return null;

      const minD = Math.min(...dividends);
      const maxD = Math.max(...dividends);
      const minPay = stakePerComboPromo * minD;
      const maxPay = stakePerComboPromo * maxD;

      if (dividends.length === 1) return `Live div: ${minD.toFixed(2)} | Est payout: ₱${minPay.toFixed(2)}`;
      return `Live div: ${minD.toFixed(2)}-${maxD.toFixed(2)} | Est payout: ₱${minPay.toFixed(2)}-₱${maxPay.toFixed(2)}`;
    }

    if (betType === 'forecast') {
      if (!liveBoards.forecast) return null;
      const pos = Array.isArray((bet as any)?.combinations?.positions) ? (bet as any).combinations.positions : [];
      const rows = normalizeHorseNumbers(pos?.[0]);
      const cols = normalizeHorseNumbers(pos?.[1]);
      const values: number[] = [];
      for (const r of rows) {
        for (const c of cols) {
          if (r === c) continue;
          const cell = forecastCellMap.get(`${r}-${c}`);
          const d = cell ? Number(cell.display) : NaN;
          if (!Number.isFinite(d) || d <= 0) continue;
          values.push(d);
        }
      }
      if (values.length === 0) return null;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const minPay = stakePerComboPromo * min;
      const maxPay = stakePerComboPromo * max;
      if (values.length === 1) return `Live pays: ${values[0]} | Est payout: ₱${minPay.toFixed(2)}`;
      return `Live pays: ${min}-${max} | Est payout: ₱${minPay.toFixed(2)}-₱${maxPay.toFixed(2)}`;
    }

    if (betType === 'daily_double' || betType === 'daily_double_plus_one') {
      if (!liveBoards.daily_double) return null;
      const legs = Array.isArray((bet as any)?.combinations?.legs) ? (bet as any).combinations.legs : [];
      const rows = normalizeHorseNumbers(legs?.[0]?.horses);
      const cols = normalizeHorseNumbers(legs?.[1]?.horses);
      const values: number[] = [];
      for (const r of rows) {
        for (const c of cols) {
          const cell = ddCellMap.get(`${r}-${c}`);
          const d = cell ? Number(cell.display) : NaN;
          if (!Number.isFinite(d) || d <= 0) continue;
          values.push(d);
        }
      }
      if (values.length === 0) return null;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const minPay = stakePerComboPromo * min;
      const maxPay = stakePerComboPromo * max;
      const prefix = betType === 'daily_double_plus_one' ? 'Live pays (L1-L2):' : 'Live pays:';
      if (values.length === 1) return `${prefix} ${values[0]} | Est payout: ₱${minPay.toFixed(2)}`;
      return `${prefix} ${min}-${max} | Est payout: ₱${minPay.toFixed(2)}-₱${maxPay.toFixed(2)}`;
    }

    return null;
  };

  if (kareraSettingsLoading) return <div className="p-8 text-center text-white">Loading...</div>;

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

  if (loading || !race) return <div className="p-8 text-center text-white">Loading...</div>;

  const msToStart = new Date(race.racing_time).getTime() - nowMs;
  const minutesToStart = Number.isFinite(msToStart) && msToStart > 0 ? Math.max(1, Math.ceil(msToStart / 60000)) : null;
  const raceNumber = (() => {
    const raw = String(race?.name || '');
    const m = raw.match(/(?:^|\s)(\d+)\s*$/);
    const n = m ? Number(m[1]) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  const isLastCall = race.status === 'open' && msToStart > 0 && msToStart <= 5 * 60 * 1000;
  const statusClass =
    race.status === 'open'
      ? 'bg-green-500/20 text-green-400 border-green-500/20'
      : race.status === 'closed'
        ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/20'
        : race.status === 'finished'
          ? 'bg-blue-500/20 text-blue-300 border-blue-500/20'
          : 'bg-red-500/20 text-red-400 border-red-500/20';

  return (
    <div className="max-w-7xl mx-auto p-4 flex flex-col lg:flex-row gap-6 h-auto min-h-[calc(100vh-80px)]">
      <div className="flex-1 flex flex-col gap-4">
        <div className="flex flex-col gap-2 mb-2">
          <div className="flex items-center gap-4 flex-wrap">
            <Link to={`/karera${tournamentQuery}`} className="text-casino-slate-400 hover:text-white">
              <ArrowLeft />
            </Link>
            <h1 className="text-xl font-bold text-white">{race.name}</h1>
            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase border ${statusClass}`}>{race.status}</span>
            {isLastRace && (
              <span className="text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded uppercase">Last Race</span>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm text-casino-slate-400 flex-wrap">
            <Clock size={14} />
            <span>{new Date(race.racing_time).toLocaleString()}</span>
            {Number.isFinite(msToStart) ? (
              msToStart > 0 ? (
                <span className="font-mono text-casino-gold-400">{formatCountdown(msToStart)} to start</span>
              ) : (
                <span className="font-mono text-red-300">Post time reached</span>
              )
            ) : null}
            {isLastCall ? (
              <span className="px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/20 text-[10px] font-black uppercase tracking-widest animate-pulse">
                LAST CALL
              </span>
            ) : null}
          </div>

          <div className="flex gap-1 bg-casino-dark-850 p-1 rounded-lg w-full sm:w-fit overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            <button
              type="button"
              onClick={() => {
                visualTabUserSelectedRef.current = true;
                setVisualTab('dd');
              }}
              className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                visualTab === 'dd'
                  ? 'bg-casino-gold-500 text-casino-dark-950'
                  : 'text-casino-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              DD Pays
            </button>
            <button
              type="button"
              onClick={() => {
                visualTabUserSelectedRef.current = true;
                setVisualTab('forecast');
              }}
              className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                visualTab === 'forecast'
                  ? 'bg-casino-gold-500 text-casino-dark-950'
                  : 'text-casino-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              Forecast Pays
            </button>
            <button
              type="button"
              onClick={() => {
                visualTabUserSelectedRef.current = true;
                setVisualTab('pick_4');
              }}
              className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                visualTab === 'pick_4'
                  ? 'bg-casino-gold-500 text-casino-dark-950'
                  : 'text-casino-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              Pick 4
            </button>
            <button
              type="button"
              onClick={() => {
                visualTabUserSelectedRef.current = true;
                setVisualTab('pick_5');
              }}
              className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                visualTab === 'pick_5'
                  ? 'bg-casino-gold-500 text-casino-dark-950'
                  : 'text-casino-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              Pick 5
            </button>
            <button
              type="button"
              onClick={() => {
                visualTabUserSelectedRef.current = true;
                setVisualTab('pick_6');
              }}
              className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                visualTab === 'pick_6'
                  ? 'bg-casino-gold-500 text-casino-dark-950'
                  : 'text-casino-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              Pick 6
            </button>
            <button
              type="button"
              onClick={() => {
                visualTabUserSelectedRef.current = true;
                setVisualTab('wta');
              }}
              className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                visualTab === 'wta'
                  ? 'bg-casino-gold-500 text-casino-dark-950'
                  : 'text-casino-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              WTA
            </button>
            <button
              type="button"
              onClick={() => {
                visualTabUserSelectedRef.current = true;
                setVisualTab('dividends');
              }}
              className={`flex-1 sm:flex-none px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                visualTab === 'dividends'
                  ? 'bg-casino-gold-500 text-casino-dark-950'
                  : 'text-casino-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              Dividends
            </button>
          </div>
        </div>

        {race.status === 'closed' ? (
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4">
            <div className="text-xs font-black uppercase tracking-widest text-yellow-200">Betting Closed</div>
            <div className="text-xs text-yellow-100/80 mt-1">Waiting for winner announcement.</div>
          </div>
        ) : null}

        {visualTab === 'dividends' ? (
          <KareraDividendsBoard horses={horses} title="Race Dividends" subHeader="AI VISION (LATEST)" />
        ) : visualTab === 'dd' || visualTab === 'forecast' ? (
          <KareraLiveBoard
            data={visualTab === 'forecast' ? liveBoards.forecast : liveBoards.daily_double}
            loading={false}
            title={visualTab === 'forecast' ? 'FORECAST PAYS' : 'DAILY DOUBLE PAYS'}
            minutesToStart={minutesToStart}
            raceNumber={raceNumber}
            highlightCells={(() => {
              const out: Array<{ i: number; j: number }> = [];

              const push = (a: number[], b: number[]) => {
                const seen = new Set<string>();
                for (const i of a) {
                  for (const j of b) {
                    const ii = Number(i);
                    const jj = Number(j);
                    if (!Number.isFinite(ii) || !Number.isFinite(jj) || ii <= 0 || jj <= 0) continue;
                    const key = `${ii}-${jj}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    out.push({ i: ii, j: jj });
                  }
                }
              };

              if (visualTab === 'forecast' && selectedBetType === 'forecast') {
                push(comboPositions[0] || [], comboPositions[1] || []);
              } else if (visualTab === 'dd' && isMultiRaceBet && legsRaces.length >= 2) {
                push(legsSelections[legsRaces[0].id] || [], legsSelections[legsRaces[1].id] || []);
              }

              return out;
            })()}
            highlightRows={(() => {
              if (visualTab === 'forecast' && selectedBetType === 'forecast') return comboPositions[0] || [];
              if (visualTab === 'dd' && isMultiRaceBet && legsRaces.length >= 2) return legsSelections[legsRaces[0].id] || [];
              return [];
            })()}
            highlightCols={(() => {
              if (visualTab === 'forecast' && selectedBetType === 'forecast') return comboPositions[1] || [];
              if (visualTab === 'dd' && isMultiRaceBet && legsRaces.length >= 2) return legsSelections[legsRaces[1].id] || [];
              return [];
            })()}
          />
        ) : (
          <KareraProgramBoard
            data={
              visualTab === 'pick_4'
                ? liveBoards.pick_4
                : visualTab === 'pick_5'
                  ? liveBoards.pick_5
                  : visualTab === 'pick_6'
                    ? liveBoards.pick_6
                    : liveBoards.wta
            }
            loading={false}
            title={
              visualTab === 'pick_4'
                ? 'PICK 4'
                : visualTab === 'pick_5'
                  ? 'PICK 5'
                  : visualTab === 'pick_6'
                    ? 'PICK 6'
                    : 'WTA'
            }
            subHeader="LIVE RACE RESULTS"
          />
        )}

        <button
          type="button"
          onClick={handleWatchLive}
          disabled={!watchLiveUrl}
          className={`w-full py-3 rounded-xl font-black uppercase tracking-widest text-sm transition-all flex items-center justify-center gap-2 ${
            watchLiveUrl
              ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20 active:scale-[0.99]'
              : 'bg-white/5 text-white/30 cursor-not-allowed'
          }`}
          title={watchLiveUrl ? 'Open live website' : 'No live website set for this race'}
        >
          <Tv size={18} />
          Watch Live
        </button>

        <div className="glass-panel p-6 rounded-xl flex-1 border border-white/5 bg-casino-dark-800/50 space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-casino-gold-500/20">
            {normalizedAvailableBetTypes.map((bt) => {
              const disabled = Boolean(betTypeDisabled[String(bt)]);
              const title =
                disabled && String(bt) === 'daily_double'
                  ? 'Need at least 1 more upcoming race for DD.'
                  : disabled && String(bt) === 'daily_double_plus_one'
                    ? 'Need at least 2 more upcoming races for DD+1.'
                    : undefined;

              return (
                <button
                  key={bt}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedBetType(bt)}
                  title={title}
                  className={`px-4 py-2 rounded-lg text-xs font-bold uppercase whitespace-nowrap transition-all border ${
                    disabled
                      ? 'bg-white/5 text-white/30 border-white/10 cursor-not-allowed'
                      : selectedBetType === bt
                        ? 'bg-casino-gold-500 text-black border-casino-gold-500 shadow-lg scale-105'
                        : 'bg-transparent text-casino-slate-400 border-white/10 hover:border-white/30'
                  }`}
                >
                  {betTypeTabLabel(bt)}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-casino-gold-500 uppercase tracking-widest">
              {isMultiRaceBet
                ? 'Select Horses Per Race'
                : isOrderCapableBet
                  ? 'Select Horses Per Position'
                  : 'Select Horses'}
            </h3>
            <div className="text-[10px] text-casino-slate-500 uppercase flex items-center gap-3">
              <span>
                Combos: <span className="text-white font-bold">{combos.toLocaleString()}</span>
              </span>
              <span>
                Ticket: <span className="text-white font-bold">{formatPesoUi(unitCost)}</span>
              </span>
              <button
                type="button"
                onClick={clearCurrentSelection}
                className="text-[10px] font-bold uppercase px-2 py-1 rounded border border-white/10 text-casino-slate-300 hover:bg-white/5"
              >
                Clear
              </button>
            </div>
          </div>

          {isMultiRaceBet ? (
            <div className="space-y-4">
              {legsRaces.length === 0 ? (
                <div className="text-xs text-casino-slate-500 italic bg-black/20 border border-white/5 p-4 rounded-xl">
                  DD legs not available for this race.
                </div>
              ) : (
                legsRaces.map((leg, idx) => (
                  <div key={leg.id} className="bg-black/20 p-4 rounded-xl border border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white font-black text-xs">
                          L{idx + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate">{leg.name}</div>
                          <div className="text-[10px] text-casino-slate-500 font-mono">
                            {new Date(leg.racing_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                      <div className="text-[10px] font-bold uppercase text-casino-gold-500">{(legsSelections[leg.id] || []).length} selected</div>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                      {(legsHorses[leg.id] || []).map((horse) => (
                        <button
                          key={horse.id}
                          type="button"
                          disabled={horse.status === 'scratched'}
                          onClick={() => toggleLegSelection(leg.id, horse.horse_number)}
                          className={`rounded-lg border p-3 text-left transition-all ${
                            horse.status === 'scratched'
                              ? 'opacity-40 cursor-not-allowed border-red-900/30 bg-red-900/10'
                              : (legsSelections[leg.id] || []).includes(horse.horse_number)
                                ? 'border-casino-gold-500 bg-casino-gold-500/10 shadow-[0_0_10px_rgba(234,179,8,0.15)]'
                                : 'border-white/10 bg-white/5 hover:bg-white/10'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-sm font-black ${
                                (legsSelections[leg.id] || []).includes(horse.horse_number) ? 'text-casino-gold-400' : 'text-white'
                              }`}
                            >
                              {horse.horse_number}
                            </span>
                            <span className="text-[10px] font-mono text-casino-slate-400">{horse.current_dividend || '-'}</span>
                          </div>
                          <div className={`mt-1 text-[10px] truncate ${horse.status === 'scratched' ? 'text-red-400 line-through' : 'text-white/70'}`}>
                            {horse.horse_name} {horse.status === 'scratched' ? '-S-' : ''}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : isOrderCapableBet ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {Array.from({ length: requiredSlots }).map((_, positionIndex) => {
                  const label = positionIndex === 0 ? '1st' : positionIndex === 1 ? '2nd' : positionIndex === 2 ? '3rd' : '4th';
                  const selected = comboSelections[positionIndex] || [];

                  return (
                    <div key={positionIndex} className="bg-black/20 p-4 rounded-xl border border-white/5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-black uppercase tracking-wider text-white/90">{label} Place</div>
                        <div className="text-[10px] font-bold uppercase text-casino-gold-500">{selected.length} selected</div>
                      </div>

                      <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {horses.map((horse) => {
                          const isSelected = (comboSelections[positionIndex] || []).includes(horse.horse_number);
                          const isScratched = horse.status === 'scratched';

                          return (
                            <button
                              key={horse.id}
                              type="button"
                              disabled={isScratched}
                              onClick={() => toggleComboSelection(horse.horse_number, positionIndex)}
                              className={`rounded-lg border p-2 text-left transition-all ${
                                isScratched
                                  ? 'opacity-40 cursor-not-allowed border-red-900/30 bg-red-900/10'
                                  : isSelected
                                    ? 'border-casino-gold-500 bg-casino-gold-500/10 shadow-[0_0_10px_rgba(234,179,8,0.15)]'
                                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className={`text-sm font-black ${isSelected ? 'text-casino-gold-400' : 'text-white'}`}>{horse.horse_number}</span>
                                <span className="text-[10px] font-mono text-casino-slate-400">{horse.current_dividend || '-'}</span>
                              </div>
                              <div className={`mt-1 text-[10px] truncate ${isScratched ? 'text-red-400 line-through' : 'text-white/70'}`}>
                                {horse.horse_name} {isScratched ? '-S-' : ''}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="text-[10px] text-casino-slate-500 italic">
                Note: Selecting the same horse in multiple positions is allowed, but invalid duplicate finishers are excluded from combinations.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {horses.map((horse) => (
                <button
                  key={horse.id}
                  type="button"
                  disabled={horse.status === 'scratched'}
                  onClick={() => toggleMultiSelection(horse.horse_number)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    horse.status === 'scratched'
                      ? 'opacity-40 cursor-not-allowed border-red-900/30 bg-red-900/10'
                      : multiSelections.includes(horse.horse_number)
                        ? 'border-casino-gold-500 bg-casino-gold-500/10 shadow-[0_0_10px_rgba(234,179,8,0.15)]'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-black ${multiSelections.includes(horse.horse_number) ? 'text-casino-gold-400' : 'text-white'}`}>
                      {horse.horse_number}
                    </span>
                    <span className="text-[10px] font-mono text-casino-slate-400">{horse.current_dividend || '-'}</span>
                  </div>
                  <div className={`mt-1 text-[10px] truncate ${horse.status === 'scratched' ? 'text-red-400 line-through' : 'text-white/70'}`}>
                    {horse.horse_name} {horse.status === 'scratched' ? '-S-' : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-full lg:w-80 flex flex-col gap-4">
        <div className="glass-panel p-6 rounded-xl flex flex-col gap-4 sticky top-20 z-30 border border-white/10 bg-casino-dark-800">
          <h2 className="font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Trophy size={16} className="text-casino-gold-500" />
            Bet Slip
          </h2>

          <div className="flex-1 bg-black/40 rounded-lg p-4 font-mono text-sm space-y-3 border border-white/5">
            <div className="flex justify-between text-casino-slate-500 border-b border-white/5 pb-2">
              <span>Type</span>
              <span className="text-white font-bold uppercase text-xs bg-white/10 px-2 py-0.5 rounded">{betTypeTabLabel(selectedBetType)}</span>
            </div>

            <div className="flex flex-col gap-1 text-casino-slate-500">
              <span>Selection</span>
              <div className="text-casino-gold-500 font-bold text-base break-words leading-tight bg-casino-gold-500/5 p-2 rounded border border-casino-gold-500/10">
                {selectionsLabel ? <span>{selectionsLabel}</span> : <span className="text-white/20 italic">No Selection</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
              <div className="text-casino-slate-500 text-xs">
                <div className="text-[10px] uppercase font-bold">Combos</div>
                <div className="text-white font-black">{combos.toLocaleString()}</div>
              </div>
              <div className="text-casino-slate-500 text-xs text-right">
                <div className="text-[10px] uppercase font-bold">Ticket</div>
                <div className="text-white font-black">{formatPesoUi(unitCost)}</div>
              </div>
            </div>

            {livePaysPreview ? (
              <div className="mt-3 rounded-xl border border-green-500/20 bg-black/50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-widest text-green-300">{livePaysPreview.label}</div>
                    <div className="mt-1 text-2xl font-black text-green-200 tabular-nums drop-shadow-[0_0_18px_rgba(34,197,94,0.28)]">
                      {livePaysPreview.min === livePaysPreview.max
                        ? String(livePaysPreview.min)
                        : `${livePaysPreview.min}-${livePaysPreview.max}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] font-black uppercase tracking-widest text-casino-slate-400">Est Payout</div>
                    <div className="mt-1 text-lg font-black text-casino-gold-400 tabular-nums drop-shadow-[0_0_18px_rgba(234,179,8,0.28)]">
                      {livePaysPreview.minPay === livePaysPreview.maxPay
                        ? formatPesoUi(livePaysPreview.minPay)
                        : `${formatPesoUi(livePaysPreview.minPay)}-${formatPesoUi(livePaysPreview.maxPay)}`}
                    </div>
                  </div>
                </div>
                {livePaysPreview.promoPct ? (
                  <div className="mt-2 text-[10px] text-red-200 font-black uppercase tracking-widest">
                    Promo applied (+{Number.isInteger(livePaysPreview.promoPct) ? livePaysPreview.promoPct : livePaysPreview.promoPct}%)
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-casino-slate-400 uppercase font-bold mb-1 block">Tickets</label>
                <input
                  type="number"
                min={1}
                step={1}
                value={units}
                onChange={(e) => setUnits(parseInt(e.target.value || '1', 10))}
                className="w-full bg-black/40 border border-white/10 rounded-lg py-3 px-4 text-white font-mono focus:border-casino-gold-500 focus:outline-none transition-colors"
                placeholder="1"
              />
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-5 gap-1">
                    {[1, 5, 10, 100, 500].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => bumpTickets(n)}
                        className="w-full px-2 py-2.5 rounded-lg bg-gradient-to-b from-casino-gold-400 to-casino-gold-600 text-black text-sm font-black uppercase tracking-wider border border-casino-gold-500/40 shadow-[0_6px_18px_rgba(234,179,8,0.25)] hover:brightness-110 active:scale-95 transition-all"
                      >
                        +{n}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setUnits(1)}
                    className="w-full px-3 py-2.5 rounded-lg bg-gradient-to-b from-red-500 to-red-700 border border-red-400/40 text-white text-sm font-black uppercase tracking-wider shadow-[0_6px_18px_rgba(239,68,68,0.25)] hover:brightness-110 active:scale-95 transition-all"
                  >
                    Clear
                  </button>
                </div>
                {promoForReceipt ? (
                  <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-red-200">Ticket Value (Promo)</div>
                    <div className="text-3xl font-black text-casino-gold-400 leading-none mt-1">
                      {formatPesoUi(totalCost * (1 + (promoForReceipt.pct / 100)))}
                    </div>
                    <div className="mt-2 text-[10px] text-white/70 font-mono">
                      You pay: <span className="text-white font-black">{formatPesoUi(totalCost)}</span>
                    </div>
                    {promoForReceipt.text ? (
                      <div className="mt-2 text-[10px] text-red-200 font-black uppercase tracking-widest">
                        {promoForReceipt.text}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-casino-slate-400">Total</div>
                    <div className="text-3xl font-black text-white leading-none mt-1">
                      {formatPesoUi(totalCost)}
                    </div>
                  </div>
                )}
              </div>

              {isOrderCapableBet && comboImpossibleReason && (
                <div className="text-[10px] text-red-300 font-mono bg-red-500/10 border border-red-500/20 p-2 rounded-lg">
                  {comboImpossibleReason}
                </div>
              )}

              <button
                onClick={placeBet}
                disabled={placingBet || combos <= 0 || race.status !== 'open' || (isOrderCapableBet && Boolean(comboImpossibleReason))}
                className="w-full py-4 bg-gradient-to-r from-casino-gold-600 to-casino-gold-400 text-black font-black uppercase tracking-wider rounded-xl shadow-lg hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {placingBet ? <RefreshCw className="animate-spin mx-auto" /> : 'Place Bet'}
              </button>
            </div>
        </div>

        <div className="glass-panel p-4 rounded-xl flex flex-col gap-3 border border-white/10 bg-casino-dark-800">
          <div className="flex items-center justify-between">
            <div className="text-xs font-black uppercase tracking-wider text-white">My Bets</div>
            <button
              type="button"
              onClick={refreshMyBets}
              disabled={myBetsLoading || !profile?.id}
              className={`text-[10px] font-bold uppercase px-2 py-1 rounded border transition-colors ${
                myBetsLoading || !profile?.id
                  ? 'opacity-40 border-white/10 text-casino-slate-500 cursor-not-allowed'
                  : 'border-white/10 text-casino-slate-300 hover:bg-white/5'
              }`}
            >
              Refresh
            </button>
          </div>

          {myBetsLoading ? (
            <div className="text-xs text-casino-slate-500 font-mono py-4 text-center">Loading...</div>
          ) : myBets.length === 0 ? (
            <div className="text-xs text-casino-slate-500 font-mono py-4 text-center">No bets yet</div>
          ) : (
            <div className="space-y-2">
              {myBets.map((b) => {
                const betType = String((b as any)?.bet_type || '');
                const combosForType = computeKareraCombos(betType, (b as any)?.combinations);
                const unitCostForType = getKareraUnitCost(betType);
                const unitsForType = deriveKareraUnits((b as any)?.amount, combosForType, unitCostForType);
                const selectionLines = formatKareraSelectionLines({
                  betType,
                  combinations: (b as any)?.combinations,
                  racesById,
                });
                const liveSummary = getMyBetLiveSummary(b);

                return (
                  <div key={String((b as any)?.id || '')} className="bg-black/30 border border-white/10 rounded-lg p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-bold uppercase text-casino-slate-400 truncate">{betType.replace(/_/g, ' ')}</div>
                      <div className="text-[10px] font-bold uppercase text-casino-slate-500">{String((b as any)?.status || '')}</div>
                    </div>

                    <div className="mt-1 text-[10px] text-casino-slate-300 font-mono whitespace-pre-wrap">
                      {selectionLines.slice(0, 2).join('\n')}
                      {selectionLines.length > 2 ? '\n...' : ''}
                    </div>

                    {liveSummary && (
                      <div className="mt-1 text-[10px] text-green-200 font-mono drop-shadow-[0_0_14px_rgba(34,197,94,0.22)]">
                        {liveSummary}
                      </div>
                    )}

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="text-[10px] text-casino-slate-500 font-mono">
                        P{Number((b as any)?.amount || 0).toLocaleString()} | {combosForType.toLocaleString()} combos | x{unitsForType}
                      </div>
                      <button
                        type="button"
                        onClick={() => openReceiptForMyBet(b)}
                        className="text-[10px] font-bold uppercase px-2 py-1 rounded bg-casino-gold-500/20 text-casino-gold-400 border border-casino-gold-500/20 hover:bg-casino-gold-500/30"
                      >
                        Receipt
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <BetReceiptModal isOpen={receiptOpen} receipt={receipt} onClose={() => setReceiptOpen(false)} />
    </div>
  );
};
