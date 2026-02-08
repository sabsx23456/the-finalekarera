import { useEffect, useMemo, useState } from 'react';
import { Download, X } from 'lucide-react';

export type BetReceiptData = {
  website: string;
  betId: string;
  issuedAt: string; // ISO string
  raceName?: string;
  raceTime?: string;
  betType: string;
  selections: string[];
  combos: number;
  unitCost: number;
  units: number;
  amount: number;
  promoPercent?: number;
  promoText?: string;
};

type BetReceiptModalProps = {
  isOpen: boolean;
  receipt: BetReceiptData | null;
  onClose: () => void;
};

type ReceiptElement =
  | { kind: 'hr' }
  | { kind: 'text'; text: string; align: CanvasTextAlign; font: string; lineHeight: number };

const formatPeso = (value: number) => {
  const safe = Number.isFinite(value) ? value : 0;
  return `₱${safe.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatTsCompact = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });

const splitLongWord = (ctx: CanvasRenderingContext2D, word: string, maxWidth: number) => {
  const parts: string[] = [];
  let current = '';
  for (const ch of word) {
    const test = current + ch;
    if (ctx.measureText(test).width > maxWidth && current) {
      parts.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current) parts.push(current);
  return parts;
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
  const rawWords = text.split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) return [''];

  const words: string[] = [];
  for (const w of rawWords) {
    if (ctx.measureText(w).width <= maxWidth) {
      words.push(w);
      continue;
    }
    words.push(...splitLongWord(ctx, w, maxWidth));
  }

  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const buildElements = (receipt: BetReceiptData): ReceiptElement[] => {
  const headerFont = 'bold 22px Courier New, monospace';
  const bodyFont = '18px Courier New, monospace';
  const smallFont = '14px Courier New, monospace';

  const issued = new Date(receipt.issuedAt);
  const issuedText = Number.isNaN(issued.getTime())
    ? receipt.issuedAt
    : issued.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

  const betTypeLabel = receipt.betType.replace(/_/g, ' ').toUpperCase();
  const betIdShort = receipt.betId ? receipt.betId.replace(/-/g, '').slice(0, 16).toUpperCase() : '';

  const promoPercent = Number(receipt.promoPercent || 0);
  const hasPromo = Number.isFinite(promoPercent) && promoPercent > 0;
  const promoText = String(receipt.promoText || '').trim() || `BOOKIS +${promoPercent}% PER BET`;
  const promoBonus = hasPromo ? (receipt.amount * promoPercent) / 100 : 0;
  const promoEffective = hasPromo ? receipt.amount + promoBonus : receipt.amount;

  return [
    { kind: 'text', text: receipt.website, align: 'center', font: headerFont, lineHeight: 30 },
    { kind: 'text', text: 'KARERA BET RECEIPT', align: 'center', font: headerFont, lineHeight: 30 },
    { kind: 'hr' },

    { kind: 'text', text: `DATE: ${issuedText}`, align: 'left', font: bodyFont, lineHeight: 24 },
    ...(receipt.raceName ? [{ kind: 'text' as const, text: `RACE: ${receipt.raceName}`, align: 'left' as const, font: bodyFont, lineHeight: 24 }] : []),
    ...(receipt.raceTime ? [{ kind: 'text' as const, text: `TIME: ${receipt.raceTime}`, align: 'left' as const, font: bodyFont, lineHeight: 24 }] : []),
    { kind: 'text', text: `BET: ${betTypeLabel}`, align: 'left', font: bodyFont, lineHeight: 24 },

    { kind: 'hr' },
    ...receipt.selections.map((s) => ({ kind: 'text' as const, text: s, align: 'left' as const, font: bodyFont, lineHeight: 24 })),
    { kind: 'hr' },

    { kind: 'text', text: `COMBOS: ${receipt.combos.toLocaleString()}`, align: 'left', font: bodyFont, lineHeight: 24 },
    { kind: 'text', text: `TICKET: ${formatPeso(receipt.unitCost)}`, align: 'left', font: bodyFont, lineHeight: 24 },
    { kind: 'text', text: `TICKETS: ${receipt.units}`, align: 'left', font: bodyFont, lineHeight: 24 },
    ...(hasPromo
      ? ([
          { kind: 'text' as const, text: `PAY: ${formatPeso(receipt.amount)}`, align: 'left' as const, font: bodyFont, lineHeight: 24 },
          { kind: 'text' as const, text: `PROMO: ${promoText}`, align: 'left' as const, font: bodyFont, lineHeight: 24 },
          { kind: 'text' as const, text: `BONUS: +${formatPeso(promoBonus)}`, align: 'left' as const, font: bodyFont, lineHeight: 24 },
          { kind: 'text' as const, text: `TOTAL (PROMO): ${formatPeso(promoEffective)}`, align: 'left' as const, font: headerFont, lineHeight: 30 },
        ] satisfies ReceiptElement[])
      : ([{ kind: 'text' as const, text: `TOTAL: ${formatPeso(receipt.amount)}`, align: 'left' as const, font: headerFont, lineHeight: 30 }] satisfies ReceiptElement[])),

    { kind: 'hr' },
    { kind: 'text', text: `BET ID: ${betIdShort || receipt.betId}`, align: 'left', font: bodyFont, lineHeight: 24 },
    ...(betIdShort && betIdShort !== receipt.betId
      ? [{ kind: 'text' as const, text: receipt.betId, align: 'left' as const, font: smallFont, lineHeight: 18 }]
      : []),
    { kind: 'hr' },

    { kind: 'text', text: receipt.website, align: 'center', font: smallFont, lineHeight: 18 },
  ];
};

const renderReceiptPng = async (receipt: BetReceiptData) => {
  const width = 680;
  const padding = 28;
  const maxTextWidth = width - padding * 2;

  // Base url safe for Vite deployments with non-root base paths.
  const logoUrl = `${import.meta.env.BASE_URL}logo.png`;
  const [logoImg] = await Promise.all([loadImage(logoUrl)]);

  // First pass: measure height using a scratch canvas.
  const scratch = document.createElement('canvas');
  const sctx = scratch.getContext('2d');
  if (!sctx) throw new Error('Canvas not supported');

  const elements = buildElements(receipt);
  const layout: ReceiptElement[] = [];

  let height = padding;

  const logoMax = 110;
  const logoScale = Math.min(logoMax / logoImg.width, logoMax / logoImg.height, 1);
  const logoH = Math.max(1, Math.floor(logoImg.height * logoScale));
  height += logoH + 14;

  for (const el of elements) {
    if (el.kind === 'hr') {
      layout.push(el);
      height += 16;
      continue;
    }

    sctx.font = el.font;
    const wrapped = wrapText(sctx, el.text, maxTextWidth);
    for (const line of wrapped) {
      layout.push({ ...el, text: line });
      height += el.lineHeight;
    }
  }

  height += padding;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  // Background (receipt paper)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.textBaseline = 'top';
  ctx.fillStyle = '#000000';

  let y = padding;

  // Logo
  const drawW = Math.max(1, Math.floor(logoImg.width * logoScale));
  const drawH = Math.max(1, Math.floor(logoImg.height * logoScale));
  ctx.drawImage(logoImg, Math.floor((width - drawW) / 2), y, drawW, drawH);
  y += drawH + 14;

  // Body
  for (const el of layout) {
    if (el.kind === 'hr') {
      ctx.save();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(padding, y + 7);
      ctx.lineTo(width - padding, y + 7);
      ctx.stroke();
      ctx.restore();
      y += 16;
      continue;
    }

    ctx.font = el.font;
    ctx.textAlign = el.align;
    const x = el.align === 'center' ? width / 2 : el.align === 'right' ? width - padding : padding;
    ctx.fillText(el.text, x, y);
    y += el.lineHeight;
  }

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Failed to encode PNG'))), 'image/png');
  });

  return blob;
};

export const BetReceiptModal = ({ isOpen, receipt, onClose }: BetReceiptModalProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filename = useMemo(() => {
    if (!receipt) return 'sabong192_receipt.png';
    const short = receipt.betId ? receipt.betId.replace(/-/g, '').slice(0, 10) : 'bet';
    return `sabong192_karera_${receipt.betType}_${formatTsCompact(receipt.issuedAt)}_${short}.png`;
  }, [receipt]);

  useEffect(() => {
    if (!isOpen || !receipt) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const b = await renderReceiptPng(receipt);
        if (cancelled) return;

        const url = URL.createObjectURL(b);
        setPreviewUrl(url);
      } catch (e) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to generate receipt');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, receipt]);

  useEffect(() => {
    if (!isOpen) return;
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [isOpen, previewUrl]);

  if (!isOpen || !receipt) return null;

  const download = () => {
    if (!previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = filename;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <div className="bg-casino-dark-800 w-full max-w-md rounded-2xl border border-white/10 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-3 border-b border-white/10 bg-casino-dark-900 shrink-0">
          <div className="flex flex-col">
            <h2 className="text-white font-bold text-sm uppercase tracking-wider">Bet Receipt</h2>
            <span className="text-[10px] text-casino-slate-500 font-mono">{receipt.betId}</span>
          </div>
          <button onClick={onClose} className="text-casino-slate-400 hover:text-white transition-colors p-1.5 hover:bg-white/5 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="text-center text-casino-slate-400 text-sm py-10">Generating receipt...</div>
          ) : error ? (
            <div className="text-center text-red-400 text-sm py-10">{error}</div>
          ) : previewUrl ? (
            <div className="flex flex-col items-center gap-3">
              <img
                src={previewUrl}
                alt="Receipt preview"
                className="w-full max-w-[360px] rounded-lg border border-black/20 bg-white"
              />
              <div className="text-[10px] text-casino-slate-500 font-mono text-center">
                Download this receipt to share as proof of your bet.
              </div>
            </div>
          ) : null}
        </div>

        <div className="p-3 border-t border-white/10 bg-casino-dark-900 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={download}
            disabled={!previewUrl}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold uppercase tracking-wider bg-white/10 text-white hover:bg-white/15 disabled:opacity-50"
          >
            <Download size={16} />
            Download
          </button>
        </div>
      </div>
    </div>
  );
};
