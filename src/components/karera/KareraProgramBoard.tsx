import clsx from 'clsx';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface ProgramBoardEntry {
  leg: number;
  value: number;
}

export interface ProgramBoardData {
  timestamp?: string;
  pool_gross?: number;
  spread?: number | null;
  mtr?: number | null;
  entries: ProgramBoardEntry[];
}

interface KareraProgramBoardProps {
  data: ProgramBoardData | null;
  loading?: boolean;
  title: string;
  subHeader?: string;
}

export const KareraProgramBoard = ({ data, loading, title, subHeader = 'LIVE' }: KareraProgramBoardProps) => {
  if (loading) {
    return (
      <div className="aspect-video bg-casino-dark-800 rounded-xl flex flex-col items-center justify-center border border-white/10 shadow-inner">
        <RefreshCw className="animate-spin text-casino-gold-500 mb-4" size={32} />
        <span className="text-casino-slate-400 font-mono text-sm uppercase tracking-widest">Loading Board...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="aspect-video bg-casino-dark-800 rounded-xl flex flex-col items-center justify-center border border-white/10">
        <AlertTriangle className="text-casino-slate-500 mb-4" size={32} />
        <span className="text-casino-slate-500 font-mono text-sm uppercase tracking-widest">No Live Data Available</span>
      </div>
    );
  }

  const pool = Number(data.pool_gross || 0);
  const spread = typeof data.spread === 'number' && Number.isFinite(data.spread) ? data.spread : null;
  const mtr = typeof data.mtr === 'number' && Number.isFinite(data.mtr) ? data.mtr : null;

  const entries = Array.isArray(data.entries) ? data.entries : [];
  const sorted = [...entries]
    .filter((e) => Number.isFinite(Number(e?.leg)) && Number(e.leg) > 0)
    .sort((a, b) => Number(a.leg) - Number(b.leg));

  return (
    <div className="w-full aspect-[4/3] sm:aspect-video flex flex-col rounded-xl overflow-hidden border border-white/10 bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_30px_70px_rgba(0,0,0,0.6)] font-mono">
      <div className="px-3 pt-3 sm:px-6 sm:pt-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-cyan-300 font-black uppercase tracking-[0.28em] text-base sm:text-2xl whitespace-nowrap">
            {title}
          </div>
          <div className="mt-2 text-[10px] sm:text-xs text-green-300/70 uppercase tracking-widest">{subHeader}</div>
        </div>

        <div className="shrink-0 text-right">
          <div className="flex items-baseline justify-end gap-2">
            {typeof mtr === 'number' && mtr > 0 ? (
              <>
                <div className="text-yellow-200 font-black text-3xl sm:text-4xl tabular-nums drop-shadow-[0_0_18px_rgba(253,224,71,0.35)]">
                  {Math.trunc(mtr)}
                </div>
                <div className="text-green-400 font-black text-lg sm:text-xl tracking-widest">MTR</div>
              </>
            ) : (
              <div className="text-[10px] sm:text-xs text-white/40 uppercase tracking-widest">Pool</div>
            )}
          </div>

          <div className="mt-1 text-white font-black text-2xl sm:text-3xl tabular-nums drop-shadow-[0_0_22px_rgba(255,255,255,0.08)]">
            P{Number.isFinite(pool) && pool > 0 ? pool.toLocaleString(undefined, { useGrouping: false }) : '0'}
          </div>

          {typeof spread === 'number' && spread > 0 ? (
            <div className="mt-2">
              <div className="text-green-400 font-black text-[10px] sm:text-xs uppercase tracking-widest">Spread</div>
              <div className="text-white font-black text-sm sm:text-base tabular-nums">
                {spread.toLocaleString(undefined, { useGrouping: false })}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-1 p-3 sm:p-6 overflow-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        <div className="rounded-2xl border border-white/10 bg-black/60 p-3 sm:p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
          <div className="flex items-center justify-between gap-4 text-[10px] sm:text-xs uppercase tracking-widest text-casino-slate-500 font-black">
            <div>Leg</div>
            <div>Value</div>
          </div>

          <div className="mt-3 space-y-2">
            {sorted.length === 0 ? (
              <div className="text-xs text-casino-slate-500 italic">No entries extracted yet.</div>
            ) : (
              sorted.map((e) => (
                <div key={e.leg} className="flex items-center justify-between gap-4">
                  <div className="text-green-400 font-black text-lg sm:text-xl tabular-nums">{e.leg}</div>
                  <div
                    className={clsx(
                      'text-white font-black text-lg sm:text-xl tabular-nums',
                      Number(e.value) > 0 ? 'drop-shadow-[0_0_16px_rgba(255,255,255,0.10)]' : 'text-white/60',
                    )}
                  >
                    {Number.isFinite(Number(e.value)) ? Math.trunc(Number(e.value)).toLocaleString(undefined, { useGrouping: false }) : '--'}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

