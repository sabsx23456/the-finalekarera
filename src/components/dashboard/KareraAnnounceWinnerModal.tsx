import { useEffect, useMemo, useState } from 'react';
import { X, Megaphone, Loader2, Trophy } from 'lucide-react';
import clsx from 'clsx';
import { supabase } from '../../lib/supabase';
import type { KareraHorse, KareraRace } from '../../types/karera';
import { useToast } from '../ui/Toast';

type RaceOddsType = 'win' | 'place' | 'forecast' | 'trifecta' | 'quartet';
type ParleyOddsType = 'daily_double' | 'daily_double_plus_one' | 'pick_4' | 'pick_5' | 'pick_6' | 'wta';
type OddsKey = RaceOddsType | ParleyOddsType;

const RACE_ODDS_TYPES: RaceOddsType[] = ['win', 'place', 'forecast', 'trifecta', 'quartet'];
const PARLEY_ODDS_TYPES: ParleyOddsType[] = ['daily_double', 'daily_double_plus_one', 'pick_4', 'pick_5', 'pick_6', 'wta'];

const EMPTY_ODDS: Record<OddsKey, string> = {
  win: '',
  place: '',
  forecast: '',
  trifecta: '',
  quartet: '',
  daily_double: '',
  daily_double_plus_one: '',
  pick_4: '',
  pick_5: '',
  pick_6: '',
  wta: '',
};

const oddsLabel = (bt: string) => {
  if (bt === 'daily_double') return 'Daily Double (DD)';
  if (bt === 'daily_double_plus_one') return 'Daily Double +1 (DD+1)';
  if (bt === 'pick_4') return 'Pick 4';
  if (bt === 'pick_5') return 'Pick 5';
  if (bt === 'pick_6') return 'Pick 6';
  if (bt === 'wta') return 'Winner Take All (WTA)';
  return bt.replace(/_/g, ' ');
};

const toNumberOrNull = (v: string): number | null => {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return n;
};

export function KareraAnnounceWinnerModal(props: {
  race: KareraRace | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [horses, setHorses] = useState<KareraHorse[]>([]);

  const [first, setFirst] = useState<number | ''>('');
  const [second, setSecond] = useState<number | ''>('');
  const [third, setThird] = useState<number | ''>('');
  const [fourth, setFourth] = useState<number | ''>('');

  const [odds, setOdds] = useState<Record<OddsKey, string>>({ ...EMPTY_ODDS });

  const raceOddsTypesForRace = useMemo(() => {
    const raw = Array.isArray(props.race?.bet_types_available) ? props.race!.bet_types_available : [];
    return raw.filter((t): t is RaceOddsType => RACE_ODDS_TYPES.includes(t as RaceOddsType));
  }, [props.race?.id]);

  const requiredPlaces = useMemo(() => {
    if (raceOddsTypesForRace.includes('quartet')) return 4;
    if (raceOddsTypesForRace.includes('trifecta')) return 3;
    if (raceOddsTypesForRace.includes('forecast') || raceOddsTypesForRace.includes('place')) return 2;
    if (raceOddsTypesForRace.includes('win')) return 1;
    return 1;
  }, [raceOddsTypesForRace]);

  useEffect(() => {
    if (!props.isOpen || !props.race?.id) return;

    setLoading(true);
    setSubmitting(false);
    setHorses([]);
    setFirst('');
    setSecond('');
    setThird('');
    setFourth('');
    setOdds({ ...EMPTY_ODDS });

    (async () => {
      try {
        const { data, error } = await supabase
          .from('karera_horses')
          .select('*')
          .eq('race_id', props.race!.id)
          .order('horse_number', { ascending: true });

        if (error) throw error;
        setHorses((data || []) as KareraHorse[]);
      } catch (err: any) {
        console.error(err);
        showToast(err?.message || 'Failed to load race horses', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [props.isOpen, props.race?.id, showToast]);

  const horseOptions = useMemo(() => {
    const list = (horses || []).map((h) => ({
      number: Number(h.horse_number),
      label: `#${h.horse_number} ${h.horse_name}${h.status === 'scratched' ? ' (SCR)' : ''}`,
      disabled: h.status === 'scratched',
    }));
    return list.sort((a, b) => a.number - b.number);
  }, [horses]);

  if (!props.isOpen || !props.race) return null;

  const close = () => {
    if (submitting) return;
    props.onClose();
  };

  const validate = (): { ok: true; payload: any } | { ok: false; message: string } => {
    if (!props.race?.id) return { ok: false, message: 'Missing race' };
    if (props.race.status === 'finished' || props.race.status === 'cancelled') {
      return { ok: false, message: `Race already ended (${props.race.status}).` };
    }

    const f = first === '' ? null : Number(first);
    const s = second === '' ? null : Number(second);
    const t = third === '' ? null : Number(third);
    const fo = fourth === '' ? null : Number(fourth);

    if (!f || f <= 0) return { ok: false, message: 'Pick the 1st place winner.' };
    if (requiredPlaces >= 2 && (!s || s <= 0)) return { ok: false, message: 'Pick the 2nd place winner.' };
    if (requiredPlaces >= 3 && (!t || t <= 0)) return { ok: false, message: 'Pick the 3rd place winner.' };
    if (requiredPlaces >= 4 && (!fo || fo <= 0)) return { ok: false, message: 'Pick the 4th place winner.' };

    const provided = [f, s, t, fo].filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    const uniq = new Set(provided);
    if (uniq.size !== provided.length) return { ok: false, message: 'Finishers must be unique.' };

    const oddsPayload: Record<string, number> = {};
    for (const bt of raceOddsTypesForRace) {
      const n = toNumberOrNull(odds[bt] || '');
      if (n === null || n <= 0) return { ok: false, message: `Enter a valid odds value for ${oddsLabel(bt).toUpperCase()}.` };
      oddsPayload[bt] = n;
    }

    for (const bt of PARLEY_ODDS_TYPES) {
      const raw = String(odds[bt] || '');
      if (!raw.trim()) continue;
      const n = toNumberOrNull(raw);
      if (n === null || n <= 0) return { ok: false, message: `Enter a valid odds value for ${oddsLabel(bt).toUpperCase()}.` };
      oddsPayload[bt] = n;
    }

    return {
      ok: true,
      payload: {
        p_race_id: props.race.id,
        p_first: f,
        p_second: s,
        p_third: t,
        p_fourth: fo,
        p_odds: oddsPayload,
      },
    };
  };

  const announce = async () => {
    if (submitting) return;

    const v = validate();
    if (!v.ok) {
      showToast(v.message, 'error');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('announce_karera_winner', v.payload);
      if (error) throw error;
      if (data && data.success === false) throw new Error(data.error || 'Failed to announce winner');

      // Best-effort: ensure the winner + odds are persisted on the race row
      // so users can see them in the Karera lobby "Previous Race" modal.
      try {
        const { data: sessionRes } = await supabase.auth.getSession();
        const announcedBy = sessionRes?.session?.user?.id || null;
        const announcedAt = new Date().toISOString();
        const resultPayload = {
          announced_by: announcedBy,
          announced_at: announcedAt,
          finish_order: {
            first: v.payload.p_first,
            second: v.payload.p_second ?? null,
            third: v.payload.p_third ?? null,
            fourth: v.payload.p_fourth ?? null,
          },
          odds: v.payload.p_odds,
          settled: typeof (data as any)?.settled === 'number' ? (data as any).settled : null,
          won: typeof (data as any)?.won === 'number' ? (data as any).won : null,
          lost: typeof (data as any)?.lost === 'number' ? (data as any).lost : null,
          payout_total: typeof (data as any)?.payout_total === 'number' ? (data as any).payout_total : null,
        };

        const { error: updErr } = await supabase
          .from('karera_races')
          .update({ status: 'finished', result: resultPayload } as any)
          .eq('id', v.payload.p_race_id);

        if (updErr && /column .*result.* does not exist/i.test(updErr.message || '')) {
          showToast('Missing DB migration: run scripts/sql/announce_karera_winner.sql', 'error');
        }
      } catch {
        // ignore
      }

      showToast('Winner announced. Race settled.', 'success');
      props.onSuccess?.();
      props.onClose();
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Failed to announce winner', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onMouseDown={close}>
      <div
        className="bg-neutral-900 w-full max-w-2xl rounded-3xl border border-white/10 p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-casino-gold-500/10 border border-casino-gold-500/20 flex items-center justify-center">
                <Megaphone className="text-casino-gold-400" size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-white uppercase tracking-tight truncate">Announce Winner</h2>
                <p className="text-xs text-casino-slate-500 truncate">
                  {props.race.name} · {new Date(props.race.racing_time).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            disabled={submitting}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white disabled:opacity-50"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-casino-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading horses...
          </div>
        ) : (
          <div className="space-y-5">
            <div className="glass-panel p-4 rounded-2xl border border-white/5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Trophy className="text-casino-gold-400" size={16} />
                  <div className="text-xs font-black uppercase tracking-widest text-white">Finish Order</div>
                </div>
                <div className="text-[10px] text-casino-slate-500 font-bold uppercase">
                  Required: Top {requiredPlaces}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FinishSelect label="1st" value={first} setValue={setFirst} options={horseOptions} required />
                <FinishSelect label="2nd" value={second} setValue={setSecond} options={horseOptions} required={requiredPlaces >= 2} />
                <FinishSelect label="3rd" value={third} setValue={setThird} options={horseOptions} required={requiredPlaces >= 3} />
                <FinishSelect label="4th" value={fourth} setValue={setFourth} options={horseOptions} required={requiredPlaces >= 4} />
              </div>
            </div>

            <div className="glass-panel p-4 rounded-2xl border border-white/5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-black uppercase tracking-widest text-white">Final Odds (Per Bet Type)</div>
                <div className="text-[10px] text-casino-slate-500 font-bold uppercase">
                  Used for payout computation
                </div>
              </div>

              {raceOddsTypesForRace.length === 0 ? (
                <div className="text-xs text-casino-slate-500 italic">
                  No single-race odds are required for this race. You can still announce the winner.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {raceOddsTypesForRace.map((bt) => (
                    <div key={bt} className="space-y-1">
                      <label className="text-[10px] font-black text-casino-slate-400 uppercase tracking-[0.2em]">
                        {oddsLabel(bt)}
                      </label>
                      <input
                        value={odds[bt] ?? ''}
                        onChange={(e) => setOdds((prev) => ({ ...prev, [bt]: e.target.value }))}
                        inputMode="decimal"
                        placeholder="e.g. 12.5"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-casino-gold-500/50 outline-none"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 text-[10px] text-casino-slate-500">
                Tip: Odds are applied to the stake per winning combination (not the total bet if multiple combos were selected).
              </div>
            </div>

            <div className="glass-panel p-4 rounded-2xl border border-white/5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-black uppercase tracking-widest text-white">Parley / Program Odds</div>
                <div className="text-[10px] text-casino-slate-500 font-bold uppercase">
                  Optional (only if settling)
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PARLEY_ODDS_TYPES.map((bt) => (
                  <div key={bt} className="space-y-1">
                    <label className="text-[10px] font-black text-casino-slate-400 uppercase tracking-[0.2em]">
                      {oddsLabel(bt)}
                    </label>
                    <input
                      value={odds[bt] ?? ''}
                      onChange={(e) => setOdds((prev) => ({ ...prev, [bt]: e.target.value }))}
                      inputMode="decimal"
                      placeholder="e.g. 12.5"
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:border-casino-gold-500/50 outline-none"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-3 text-[10px] text-casino-slate-500">
                Only fill these when Daily Double / Pick tickets are ready to settle on this race. If odds are required,
                the database will prompt you if they are missing.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={close}
                disabled={submitting}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs uppercase tracking-widest disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={announce}
                disabled={submitting || loading}
                className={clsx(
                  'px-5 py-2.5 rounded-xl text-black font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2',
                  submitting
                    ? 'bg-casino-gold-500/40 cursor-not-allowed'
                    : 'bg-casino-gold-500 hover:bg-casino-gold-400',
                )}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone size={14} />}
                Announce Winner
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FinishSelect(props: {
  label: string;
  value: number | '';
  setValue: (v: number | '') => void;
  options: Array<{ number: number; label: string; disabled?: boolean }>;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-black text-casino-slate-400 uppercase tracking-[0.2em]">
        {props.label} {props.required ? <span className="text-red-400">*</span> : null}
      </label>
      <select
        value={props.value === '' ? '' : String(props.value)}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) props.setValue('');
          else props.setValue(Number(v));
        }}
        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-casino-gold-500/50 outline-none"
      >
        <option value="">{props.required ? 'Select...' : 'Optional'}</option>
        {props.options.map((o) => (
          <option key={o.number} value={String(o.number)} disabled={!!o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
