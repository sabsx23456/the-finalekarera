import clsx from 'clsx';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import type { KareraHorse } from '../../types/karera';

interface KareraDividendsBoardProps {
  horses: KareraHorse[];
  title?: string;
  subHeader?: string;
}

export const KareraDividendsBoard = ({
  horses,
  title = 'Dividends',
  subHeader = 'AI VISION EXTRACTED',
}: KareraDividendsBoardProps) => {
  const sorted = [...(horses || [])].sort((a, b) => a.horse_number - b.horse_number);

  if (!sorted.length) {
    return (
      <div className="aspect-video bg-casino-dark-800 rounded-xl flex flex-col items-center justify-center border border-white/10">
        <AlertTriangle className="text-casino-slate-500 mb-4" size={32} />
        <span className="text-casino-slate-500 font-mono text-sm uppercase tracking-widest">No Dividend Data</span>
      </div>
    );
  }

  const maxDividend = Math.max(
    0,
    ...sorted.map((h) => (Number.isFinite(h.current_dividend) ? Number(h.current_dividend) : 0)),
  );

  const scratchedCount = sorted.filter((h) => h.status === 'scratched').length;
  const activeCount = sorted.length - scratchedCount;

  return (
    <div className="w-full bg-[#1a1f2e] rounded-xl overflow-hidden border border-white/10 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-[#0f172a] to-[#1e293b] border-b border-white/5 flex items-center justify-between">
        <div>
          <h2 className="text-casino-gold-500 font-black uppercase tracking-[0.2em] text-lg flex items-center gap-2">
            <TrendingUp size={20} />
            {title}
          </h2>
          <p className="text-[10px] text-casino-slate-400 font-mono mt-1">{subHeader}</p>
        </div>

        <div className="text-right">
          <div className="text-[10px] text-casino-slate-500 uppercase font-bold">Horses</div>
          <div className="text-xs font-mono font-black text-white">
            {activeCount} active{scratchedCount > 0 ? ` / ${scratchedCount} scratched` : ''}
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-[10px] text-casino-slate-500 uppercase">
              <th className="text-left py-2 px-2">#</th>
              <th className="text-left py-2 px-2">Horse</th>
              <th className="text-right py-2 px-2">Dividend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sorted.map((h) => {
              const val = Number.isFinite(h.current_dividend) ? Number(h.current_dividend) : 0;
              const hasVal = val > 0;
              const pct = maxDividend > 0 ? Math.max(0, Math.min(1, val / maxDividend)) : 0;
              const scratched = h.status === 'scratched';

              return (
                <tr key={h.id} className={clsx(scratched && 'opacity-60')}>
                  <td className="py-2 px-2 align-middle">
                    <div className="w-7 h-7 rounded-full bg-white text-black font-bold text-xs flex items-center justify-center">
                      {h.horse_number}
                    </div>
                  </td>
                  <td className="py-2 px-2 align-middle">
                    <div className="flex flex-col">
                      <span className={clsx('text-sm font-semibold', scratched ? 'text-red-300 line-through' : 'text-white')}>
                        {h.horse_name}
                        {scratched ? ' -S-' : ''}
                      </span>
                      <div className="mt-1 h-1.5 rounded-full bg-black/30 border border-white/5 overflow-hidden max-w-[260px]">
                        <div className={clsx('h-full', scratched ? 'bg-red-500/40' : 'bg-casino-gold-500/60')} style={{ width: `${pct * 100}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-right align-middle font-mono font-bold">
                    <span className={clsx(scratched ? 'text-red-300' : 'text-casino-gold-400')}>{hasVal ? val.toFixed(2) : '-'}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

