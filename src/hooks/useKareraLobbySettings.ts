import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const parseBoolean = (v: unknown): boolean => {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'on';
};

export function useKareraLobbySettings() {
  const [offline, setOffline] = useState(false);
  const [nextRaceText, setNextRaceText] = useState('');
  const [promoEnabled, setPromoEnabled] = useState(false);
  const [promoPercent, setPromoPercent] = useState(0);
  const [promoBannerText, setPromoBannerText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const applyRows = (rows: any[]) => {
      const map = new Map<string, string>();
      (rows || []).forEach((r: any) => {
        const k = r?.key ? String(r.key) : '';
        if (!k) return;
        map.set(k, String(r.value ?? ''));
      });

      setOffline(parseBoolean(map.get('karera_offline')));
      setNextRaceText(map.get('karera_offline_next_race') ?? '');

      const pct = Number(String(map.get('karera_promo_percent') ?? '').trim());
      setPromoEnabled(parseBoolean(map.get('karera_promo_enabled')));
      setPromoPercent(Number.isFinite(pct) && pct > 0 ? pct : 0);
      setPromoBannerText(map.get('karera_promo_banner_text') ?? '');
    };

    const fetchSettings = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('app_settings')
          .select('key, value')
          .in('key', [
            'karera_offline',
            'karera_offline_next_race',
            'karera_promo_enabled',
            'karera_promo_percent',
            'karera_promo_banner_text',
          ]);

        if (error) throw error;
        if (cancelled) return;
        applyRows((data || []) as any[]);
      } catch (err) {
        console.warn('Failed to load Karera lobby settings:', err);
        if (!cancelled) {
          setOffline(false);
          setNextRaceText('');
          setPromoEnabled(false);
          setPromoPercent(0);
          setPromoBannerText('');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSettings();

    const channel = supabase
      .channel('karera_lobby_settings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_settings',
          filter: 'key=in.(karera_offline,karera_offline_next_race,karera_promo_enabled,karera_promo_percent,karera_promo_banner_text)',
        },
        (payload) => {
          const key = String((payload as any)?.new?.key || (payload as any)?.old?.key || '');
          const value = (payload as any)?.new?.value ?? null;

          if (key === 'karera_offline') setOffline(parseBoolean(value));
          if (key === 'karera_offline_next_race') setNextRaceText(String(value ?? ''));
          if (key === 'karera_promo_enabled') setPromoEnabled(parseBoolean(value));
          if (key === 'karera_promo_percent') {
            const n = Number(String(value ?? '').trim());
            setPromoPercent(Number.isFinite(n) && n > 0 ? n : 0);
          }
          if (key === 'karera_promo_banner_text') setPromoBannerText(String(value ?? ''));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return { offline, nextRaceText, promoEnabled, promoPercent, promoBannerText, loading };
}
