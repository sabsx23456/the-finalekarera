type RaceNameById = Record<string, { name?: string; racing_time?: string }>;

const PROGRAM_BET_LABEL: Record<string, string> = {
  pick_4: 'Pick 4',
  pick_5: 'Pick 5',
  pick_6: 'Pick 6',
  wta: 'Winner Take All',
};

export function getKareraProgramLabel(betType: string): string | null {
  const key = String(betType || '');
  return PROGRAM_BET_LABEL[key] || null;
}

export function getKareraUnitCost(betType: string): number {
  const bt = String(betType || '');
  // Keep in sync with src/pages/karera/KareraBetting.tsx unitCost logic.
  return ['win', 'place', 'forecast', 'daily_double', 'daily_double_plus_one'].includes(bt) ? 5 : 2;
}

const toNumber = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const cleaned = v.replace(/,/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const toInt = (v: unknown): number | null => {
  const n = toNumber(v);
  if (n === null) return null;
  return Math.trunc(n);
};

export function normalizeHorseNumbers(input: unknown): number[] {
  const arr = Array.isArray(input) ? input : [];
  const out: number[] = [];
  for (const item of arr) {
    const n = toInt(item);
    if (!n || n <= 0) continue;
    if (!out.includes(n)) out.push(n);
  }
  out.sort((a, b) => a - b);
  return out;
}

export function computeOrderCombos(positions: number[][]): number {
  if (!Array.isArray(positions) || positions.length === 0) return 0;
  if (positions.some((arr) => !Array.isArray(arr) || arr.length === 0)) return 0;

  let total = 0;
  const used = new Set<number>();

  const walk = (idx: number) => {
    if (idx >= positions.length) {
      total += 1;
      return;
    }
    for (const hn of positions[idx]) {
      if (used.has(hn)) continue;
      used.add(hn);
      walk(idx + 1);
      used.delete(hn);
    }
  };

  walk(0);
  return total;
}

export function computeKareraCombos(betType: string, combinations: unknown): number {
  const bt = String(betType || '');
  const c: any = combinations as any;

  if (bt === 'win' || bt === 'place') {
    return normalizeHorseNumbers(c?.horses).length;
  }

  if (bt === 'forecast' || bt === 'trifecta' || bt === 'quartet') {
    const raw = Array.isArray(c?.positions) ? c.positions : [];
    const positions = raw.map((arr: unknown) => normalizeHorseNumbers(arr));
    return computeOrderCombos(positions);
  }

  const legs = Array.isArray(c?.legs) ? c.legs : null;
  if (legs) {
    let total = 1;
    for (const leg of legs) {
      const count = normalizeHorseNumbers((leg as any)?.horses).length;
      if (count === 0) return 0;
      total *= count;
    }
    return total;
  }

  return 0;
}

export function deriveKareraUnits(amount: unknown, combos: number, unitCost: number): number {
  const amt = toNumber(amount) ?? 0;
  const denom = combos * unitCost;
  if (!Number.isFinite(amt) || amt <= 0) return 1;
  if (!Number.isFinite(denom) || denom <= 0) return 1;

  const raw = amt / denom;
  if (!Number.isFinite(raw) || raw <= 0) return 1;

  const rounded = Math.round(raw);
  if (Math.abs(raw - rounded) < 1e-6) return Math.max(1, rounded);
  return Math.max(1, Math.floor(raw));
}

export function formatKareraSelectionLines(args: {
  betType: string;
  combinations: unknown;
  racesById?: RaceNameById;
}): string[] {
  const bt = String(args.betType || '');
  const c: any = args.combinations as any;
  const racesById = args.racesById || {};

  if (bt === 'win' || bt === 'place') {
    const horses = normalizeHorseNumbers(c?.horses);
    return [`HORSES: ${horses.length > 0 ? horses.join(', ') : '-'}`];
  }

  if (bt === 'forecast' || bt === 'trifecta' || bt === 'quartet') {
    const labels = ['1ST', '2ND', '3RD', '4TH'];
    const raw = Array.isArray(c?.positions) ? c.positions : [];
    const positions: number[][] = raw.map((arr: unknown) => normalizeHorseNumbers(arr));
    return positions.map((arr: number[], idx: number) => `${labels[idx] || `POS ${idx + 1}`}: ${arr.length > 0 ? arr.join(', ') : '-'}`);
  }

  const legs = Array.isArray(c?.legs) ? c.legs : null;
  if (legs) {
    return legs.map((leg: any, idx: number) => {
      const rid = String(leg?.race_id || '');
      const raceName = rid && racesById[rid]?.name ? racesById[rid]?.name : rid ? rid.slice(0, 8).toUpperCase() : `LEG ${idx + 1}`;
      const horses = normalizeHorseNumbers(leg?.horses);
      return `LEG ${idx + 1} (${raceName}): ${horses.length > 0 ? horses.join(', ') : '-'}`;
    });
  }

  // Fallback for unexpected payloads
  try {
    const txt = JSON.stringify(c);
    return [`SELECTIONS: ${txt}`];
  } catch {
    return ['SELECTIONS: -'];
  }
}
