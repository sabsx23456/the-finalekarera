import { useEffect, useMemo, useState } from 'react';
import { Calendar, Edit2, Image as ImageIcon, Loader2, Plus, X } from 'lucide-react';
import clsx from 'clsx';

import { supabase } from '../../lib/supabase';
import type { KareraTournament } from '../../types/karera';
import { useToast } from '../ui/Toast';

const toLocalDateInputValue = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function KareraTournamentModal(props: {
  tournament: KareraTournament | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (tournament?: KareraTournament) => void;
}) {
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [tournamentDate, setTournamentDate] = useState(toLocalDateInputValue(new Date()));
  const [status, setStatus] = useState<'active' | 'upcoming' | 'ended' | 'hidden'>('active');
  const [bannerUrl, setBannerUrl] = useState<string>('');

  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isEditing = Boolean(props.tournament?.id);

  useEffect(() => {
    if (!props.isOpen) return;

    setSubmitting(false);
    setUploading(false);

    if (props.tournament) {
      setName(String(props.tournament.name || ''));
      setTournamentDate(String(props.tournament.tournament_date || toLocalDateInputValue(new Date())));
      setStatus((props.tournament.status as any) || 'active');
      setBannerUrl(String(props.tournament.banner_url || ''));
      return;
    }

    setName('');
    setTournamentDate(toLocalDateInputValue(new Date()));
    setStatus('active');
    setBannerUrl('');
  }, [props.isOpen, props.tournament?.id]);

  const canSubmit = useMemo(() => {
    return name.trim().length > 0 && Boolean(tournamentDate) && !submitting;
  }, [name, submitting, tournamentDate]);

  if (!props.isOpen) return null;

  const close = () => {
    if (submitting) return;
    props.onClose();
  };

  const uploadBanner = async (file: File | null) => {
    if (!file) return;
    if (uploading) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `karera_tournaments/${Math.random().toString(36).slice(2)}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from('event-banners').upload(fileName, file);
      if (uploadError) {
        if (uploadError.message.includes('Bucket not found')) {
          throw new Error("Storage bucket 'event-banners' not found.");
        }
        throw uploadError;
      }

      const { data } = supabase.storage.from('event-banners').getPublicUrl(fileName);
      setBannerUrl(data.publicUrl);
      showToast('Tournament banner uploaded.', 'success');
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Failed to upload banner', 'error');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!canSubmit) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast('Tournament name is required.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: trimmedName,
        tournament_date: tournamentDate,
        status,
        banner_url: bannerUrl ? bannerUrl : null,
        updated_at: new Date().toISOString(),
      };

      if (isEditing && props.tournament?.id) {
        const { data, error } = await supabase
          .from('karera_tournaments')
          .update(payload)
          .eq('id', props.tournament.id)
          .select()
          .single();
        if (error) throw error;

        showToast('Tournament updated.', 'success');
        props.onSuccess?.(data as KareraTournament);
        props.onClose();
        return;
      }

      const { data, error } = await supabase.from('karera_tournaments').insert(payload).select().single();
      if (error) throw error;

      showToast('Tournament created.', 'success');
      props.onSuccess?.(data as KareraTournament);
      props.onClose();
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || 'Failed to save tournament';
      if (/relation .*karera_tournaments.* does not exist/i.test(msg)) {
        showToast('Missing DB table: run scripts/sql/karera_tournaments.sql in Supabase SQL Editor.', 'error');
      } else {
        showToast(msg, 'error');
      }
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
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-casino-gold-500/10 border border-casino-gold-500/20 flex items-center justify-center">
                {isEditing ? <Edit2 className="text-casino-gold-400" size={18} /> : <Plus className="text-casino-gold-400" size={18} />}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-white uppercase tracking-tight truncate">
                  {isEditing ? 'Edit Tournament' : 'Create Tournament'}
                </h2>
                <p className="text-xs text-casino-slate-500 truncate">
                  Group Karera races by day, with an optional banner.
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

        <div className="space-y-5">
          <div className="glass-panel p-4 rounded-2xl border border-white/5 space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-casino-slate-400 uppercase tracking-[0.2em]">Tournament Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. KARERA CUP - FEB 2026"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-casino-gold-500/50 outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-casino-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                  <Calendar size={12} /> Tournament Date
                </label>
                <input
                  type="date"
                  value={tournamentDate}
                  onChange={(e) => setTournamentDate(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-casino-gold-500/50 outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-casino-slate-400 uppercase tracking-[0.2em]">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-casino-gold-500/50 outline-none"
                >
                  <option value="active">active</option>
                  <option value="upcoming">upcoming</option>
                  <option value="ended">ended</option>
                  <option value="hidden">hidden</option>
                </select>
              </div>
            </div>
          </div>

          <div className="glass-panel p-4 rounded-2xl border border-white/5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-black uppercase tracking-widest text-white flex items-center gap-2">
                <ImageIcon size={14} className="text-casino-gold-400" />
                Banner Image (Optional)
              </div>
              {uploading ? <div className="text-[10px] text-casino-slate-500">Uploading...</div> : null}
            </div>

            <input
              type="file"
              accept="image/*"
              onChange={(e) => uploadBanner(e.target.files?.[0] || null)}
              disabled={uploading || submitting}
              className="w-full text-xs text-casino-slate-300 file:bg-white/10 file:text-white file:border-0 file:rounded-lg file:px-3 file:py-2 file:font-bold file:uppercase file:tracking-wider file:mr-3 file:hover:bg-white/15 disabled:opacity-50"
            />

            {bannerUrl ? (
              <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/40">
                <img src={bannerUrl} alt="Tournament banner preview" className="w-full max-h-[260px] object-cover" />
              </div>
            ) : (
              <div className="text-[10px] text-casino-slate-500 italic">No banner selected.</div>
            )}

            {bannerUrl ? (
              <button
                type="button"
                onClick={() => setBannerUrl('')}
                disabled={submitting || uploading}
                className="text-[10px] font-black uppercase tracking-widest text-red-300 hover:text-red-200"
              >
                Remove banner
              </button>
            ) : null}
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
              onClick={save}
              disabled={!canSubmit}
              className={clsx(
                'px-5 py-2.5 rounded-xl text-black font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2',
                canSubmit ? 'bg-casino-gold-500 hover:bg-casino-gold-400' : 'bg-casino-gold-500/40 cursor-not-allowed',
              )}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isEditing ? 'Save Tournament' : 'Create Tournament'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

