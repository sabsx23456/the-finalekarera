export function estimateHorseDividendFromRowTotal(rowTotal: unknown): number {
  const totalBet = Number(rowTotal);
  const safeTotal = Number.isFinite(totalBet) ? totalBet : 0;
  const dividend = Math.max(1.1, 50000 / (safeTotal + 100));
  // Keep it stable for UI + DB storage
  return Number(dividend.toFixed(2));
}

