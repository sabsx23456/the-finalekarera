import { useMemo } from 'react';
import clsx from 'clsx';
import { RefreshCw, AlertTriangle } from 'lucide-react';

// Types based on the User's Spec
export interface LiveBoardCell {
    i: number; // Row (1st Sel)
    j: number; // Col (2nd Sel)
    display: number; // The value displayed on screen (e.g., 999 or 107)
    est?: number; // Estimated real value if capped
    is_capped: boolean;
    confidence: 'HIGH' | 'MED' | 'LOW';
}

export interface LiveBoardData {
    timestamp: string;
    pool_gross: number;
    pool_net_est?: number;
    row_totals: Record<number, number>; // 1st Sel Totals
    col_totals: Record<number, number>; // 2nd Sel Totals
    cells: LiveBoardCell[];
}

interface KareraLiveBoardProps {
    data: LiveBoardData | null;
    loading?: boolean;
    title?: string;
    subHeader?: string;
    rowLabel?: string;
    colLabel?: string;
    minutesToStart?: number | null;
    raceNumber?: number | null;
    highlightCells?: Array<{ i: number; j: number }>;
    highlightRows?: number[];
    highlightCols?: number[];
}

export const KareraLiveBoard = ({
    data,
    loading,
    title = "DAILY DOUBLE PAYS",
    subHeader = "LIVE COMPUTATION",
    minutesToStart = null,
    raceNumber = null,
    highlightCells,
    highlightRows,
    highlightCols,
}: KareraLiveBoardProps) => {
    // Generate Matrix structure from cells
    const matrix = useMemo(() => {
        if (!data) return {};
        const map: Record<string, LiveBoardCell> = {};
        data.cells.forEach(cell => {
            map[`${cell.i}-${cell.j}`] = cell;
        });
        return map;
    }, [data]);

    // Derive dimensions from the data when possible (some tracks have 6-8+ entries).
    const { rows, cols } = useMemo(() => {
        const fallbackRows = Array.from({ length: 8 }, (_, i) => i + 1);
        const fallbackCols = Array.from({ length: 8 }, (_, i) => i + 1);
        if (!data) return { rows: fallbackRows, cols: fallbackCols };

        const maxCellRow = (data.cells || []).reduce((m, c) => Math.max(m, Number(c?.i || 0)), 0);
        const maxCellCol = (data.cells || []).reduce((m, c) => Math.max(m, Number(c?.j || 0)), 0);

        const maxRowTotalKey = Math.max(
            0,
            ...Object.keys(data.row_totals || {})
                .map((k) => Number(k))
                .filter(Number.isFinite),
        );

        const maxColTotalKey = Math.max(
            0,
            ...Object.keys(data.col_totals || {})
                .map((k) => Number(k))
                .filter(Number.isFinite),
        );

        const rowCount = Math.max(maxCellRow, maxRowTotalKey);
        const colCount = Math.max(maxCellCol, maxColTotalKey);

        const finalRows = rowCount > 0 ? Array.from({ length: rowCount }, (_, i) => i + 1) : fallbackRows;
        const finalCols = colCount > 0 ? Array.from({ length: colCount }, (_, i) => i + 1) : fallbackCols;

        return { rows: finalRows, cols: finalCols };
    }, [data]);

    const highlightCellKeySet = useMemo(() => {
        const set = new Set<string>();
        (highlightCells || []).forEach((c) => {
            if (!c) return;
            const i = Number((c as any).i);
            const j = Number((c as any).j);
            if (!Number.isFinite(i) || !Number.isFinite(j)) return;
            set.add(`${i}-${j}`);
        });
        return set;
    }, [highlightCells]);

    const highlightRowSet = useMemo(() => new Set((highlightRows || []).filter((n) => Number.isFinite(n))), [highlightRows]);
    const highlightColSet = useMemo(() => new Set((highlightCols || []).filter((n) => Number.isFinite(n))), [highlightCols]);

    if (loading) {
        return (
            <div className="aspect-video bg-casino-dark-800 rounded-xl flex flex-col items-center justify-center border border-white/10 shadow-inner">
                <RefreshCw className="animate-spin text-casino-gold-500 mb-4" size={32} />
                <span className="text-casino-slate-400 font-mono text-sm uppercase tracking-widest">Loading Live Board...</span>
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

    return (
        <div className="w-full aspect-[4/3] sm:aspect-video flex flex-col rounded-xl overflow-hidden border border-white/10 bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_30px_70px_rgba(0,0,0,0.6)]">
            <div className="px-3 pt-3 sm:px-6 sm:pt-6 flex items-start justify-between gap-4 font-mono">
                <div className="min-w-0">
                    <div className="text-cyan-300 font-black uppercase tracking-[0.28em] text-base sm:text-2xl whitespace-nowrap">
                        {title}
                    </div>
                    <div className="mt-2 text-[10px] sm:text-xs text-green-300/70 uppercase tracking-widest">
                        {subHeader}
                    </div>
                </div>

                <div className="shrink-0 text-right">
                    {typeof minutesToStart === 'number' && Number.isFinite(minutesToStart) && minutesToStart > 0 ? (
                        <div className="flex items-baseline justify-end gap-2">
                            <div className="text-yellow-200 font-black text-3xl sm:text-4xl tabular-nums drop-shadow-[0_0_18px_rgba(253,224,71,0.35)]">
                                {minutesToStart}
                            </div>
                            <div className="text-green-400 font-black text-lg sm:text-xl tracking-widest">MTR</div>
                            {typeof raceNumber === 'number' && Number.isFinite(raceNumber) && raceNumber > 0 ? (
                                <div className="text-green-400 font-black text-lg sm:text-xl tabular-nums">{raceNumber}</div>
                            ) : null}
                        </div>
                    ) : (
                        <div className="text-[10px] sm:text-xs text-white/40 uppercase tracking-widest">Post time</div>
                    )}

                    <div className="mt-1 text-white font-black text-2xl sm:text-3xl tabular-nums drop-shadow-[0_0_22px_rgba(255,255,255,0.08)]">
                        P{Number(data.pool_gross || 0).toLocaleString(undefined, { useGrouping: false })}
                    </div>
                </div>
            </div>

            <div className="flex-1 p-3 sm:p-6 overflow-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <div className={clsx(cols.length <= 8 ? 'min-w-0' : 'min-w-[520px]')}>
                    <div className="grid grid-cols-[32px_1fr] sm:grid-cols-[44px_1fr] gap-1 font-mono tabular-nums">
                        <div />
                        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
                            {cols.map((c) => (
                                <div
                                    key={c}
                                    className={clsx(
                                        'text-center text-sm sm:text-base font-black leading-none py-1',
                                        highlightColSet.has(c) ? 'text-yellow-200 drop-shadow-[0_0_10px_rgba(253,224,71,0.35)]' : 'text-green-400',
                                    )}
                                >
                                    {c}
                                </div>
                            ))}
                        </div>

                        {rows.map((r) => (
                            <div key={r} className="contents">
                                <div
                                    className={clsx(
                                        'text-center text-sm sm:text-base font-black leading-none py-1',
                                        highlightRowSet.has(r) ? 'text-yellow-200 drop-shadow-[0_0_10px_rgba(253,224,71,0.35)]' : 'text-green-400',
                                    )}
                                >
                                    {r}
                                </div>
                                <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
                                    {cols.map((c) => {
                                        const key = `${r}-${c}`;
                                        const cell = matrix[key];
                                        const highlighted = highlightCellKeySet.has(key);
                                        const v = cell ? Number(cell.display) : null;
                                        const show = typeof v === 'number' && Number.isFinite(v) && v > 0;

                                        return (
                                            <div
                                                key={c}
                                                className={clsx(
                                                    'rounded-sm px-1.5 py-1 text-center text-sm sm:text-base font-black leading-none',
                                                    highlighted
                                                        ? 'bg-yellow-500/10 text-yellow-200 ring-2 ring-yellow-300/70 shadow-[0_0_18px_rgba(253,224,71,0.22)]'
                                                        : 'bg-white/0 text-white/90',
                                                )}
                                            >
                                                {show ? Math.trunc(v) : ''}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
