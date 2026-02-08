import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Play, Trophy, Calendar } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import clsx from 'clsx';
import type { KareraTournament } from '../../types/karera';
import { useKareraLobbySettings } from '../../hooks/useKareraLobbySettings';

interface Event {
    id: string;
    name: string;
    banner_url?: string;
    stream_url?: string;
    status: 'active' | 'upcoming' | 'ended' | 'hidden';
    created_at: string;
}

export const LobbyPage = () => {
    const navigate = useNavigate();
    const { promoEnabled, promoPercent, promoBannerText } = useKareraLobbySettings();
    const [events, setEvents] = useState<Event[]>([]);
    const [kareraTournaments, setKareraTournaments] = useState<KareraTournament[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchLobby();
    }, []);

    const totalCount = events.length + kareraTournaments.length;

    const formatPromoBadge = () => {
        if (!promoEnabled) return '';
        const pct = Number(promoPercent);
        if (!Number.isFinite(pct) || pct <= 0) return '';
        const pctText = Number.isInteger(pct) ? String(pct) : String(pct);
        const template = String(promoBannerText || '').trim() || 'BOOKIS +{percent}% PER BET';
        return template.replaceAll('{percent}', pctText);
    };

    const promoBadgeText = formatPromoBadge();

    const fetchLobby = async () => {
        setLoading(true);
        try {
            const [eventsRes, kareraRes] = await Promise.all([
                supabase
                    .from('events')
                    .select('id,name,banner_url,stream_url,status,created_at')
                    .in('status', ['active', 'upcoming'])
                    .order('created_at', { ascending: false }),
                supabase
                    .from('karera_tournaments')
                    .select('id,name,banner_url,status,tournament_date,created_at,updated_at')
                    .in('status', ['active', 'upcoming'])
                    .order('tournament_date', { ascending: false })
                    .order('created_at', { ascending: false }),
            ]);

            if (eventsRes.data) setEvents(eventsRes.data as Event[]);
            else setEvents([]);

            if (kareraRes.error) {
                // If the user hasn't run the migration yet, keep the lobby working for sabong events.
                const msg = kareraRes.error.message || '';
                if (!/relation .*karera_tournaments.* does not exist/i.test(msg)) {
                    console.warn('Failed to load karera tournaments:', kareraRes.error);
                }
                setKareraTournaments([]);
            } else {
                setKareraTournaments((kareraRes.data || []) as KareraTournament[]);
            }
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-casino-gold-500">
                <Loader2 className="w-8 h-8 animate-spin mb-2" />
                <span className="text-xs font-semibold uppercase tracking-wider">Loading Events...</span>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-casino-gold-500" />
                    Active Events
                </h2>
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigate('/karera')}
                        className="px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-[10px] font-black uppercase tracking-[0.2em] border border-white/10 hover:border-casino-gold-500/30 transition-all active:scale-95"
                        title="Go to Karera"
                    >
                        KARERA
                    </button>
                    <span className="text-xs text-casino-slate-500">{totalCount} events</span>
                </div>
            </div>

            {totalCount === 0 ? (
                <div className="text-center py-12 bg-casino-dark-850 rounded-2xl border border-white/5">
                    <Calendar className="w-12 h-12 text-casino-slate-600 mx-auto mb-3" />
                    <h3 className="text-base font-semibold text-white">No Active Events</h3>
                    <p className="text-casino-slate-500 text-sm mt-1">Check back later for upcoming matches.</p>
                </div>
            ) : (
                <div className="space-y-8">
                    <section className="space-y-3">
                        <div className="flex items-end justify-between">
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-casino-slate-500">Sabong</div>
                                <div className="text-sm font-black text-white uppercase tracking-wider">Arena Events</div>
                            </div>
                            <div className="text-[10px] text-casino-slate-500 font-bold uppercase tracking-widest">{events.length} events</div>
                        </div>

                        {events.length === 0 ? (
                            <div className="text-center py-10 bg-casino-dark-850 rounded-2xl border border-white/5">
                                <Calendar className="w-10 h-10 text-casino-slate-700 mx-auto mb-2" />
                                <div className="text-sm font-semibold text-white">No Sabong Events</div>
                                <div className="text-casino-slate-500 text-xs mt-1">Check back later.</div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {events.map((event) => (
                                    <div
                                        key={event.id}
                                        className="group relative bg-casino-dark-850 rounded-xl overflow-hidden border border-white/5 hover:border-casino-gold-500/30 transition-all"
                                    >
                                        {/* Banner */}
                                        <div className="h-28 sm:h-36 relative overflow-hidden">
                                            {event.banner_url ? (
                                                <img
                                                    src={event.banner_url}
                                                    alt={event.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-gradient-to-br from-casino-dark-800 to-casino-dark-900 flex items-center justify-center">
                                                    <Trophy className="w-10 h-10 text-casino-slate-700" />
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-casino-dark-850 via-transparent to-transparent" />

                                            {/* Status Badge */}
                                            <div className="absolute top-2 left-2">
                                                <div className={clsx(
                                                    "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide",
                                                    event.status === 'active'
                                                        ? "bg-green-500/20 text-green-400 border border-green-500/30"
                                                        : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                                                )}>
                                                    <span className={clsx(
                                                        "w-1.5 h-1.5 rounded-full",
                                                        event.status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'
                                                    )} />
                                                    {event.status === 'active' ? 'Live' : 'Upcoming'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Content */}
                                        <div className="p-3">
                                            <h3 className="text-sm font-semibold text-white mb-2 truncate">{event.name}</h3>
                                            <button
                                                onClick={() => navigate(`/event/${event.id}`)}
                                                disabled={event.status !== 'active'}
                                                className={clsx(
                                                    "w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wide transition-all",
                                                    event.status === 'active'
                                                        ? "bg-casino-gold-500 hover:bg-casino-gold-400 text-casino-dark-950"
                                                        : "bg-casino-dark-700 text-casino-slate-500 cursor-not-allowed"
                                                )}
                                            >
                                                <Play size={14} fill={event.status === 'active' ? "currentColor" : "none"} />
                                                {event.status === 'active' ? 'Enter Arena' : 'Opens Soon'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="space-y-3">
                        <div className="flex items-end justify-between">
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-casino-slate-500">Karera</div>
                                <div className="text-sm font-black text-white uppercase tracking-wider">Horse Race Events</div>
                            </div>
                            <div className="text-[10px] text-casino-slate-500 font-bold uppercase tracking-widest">{kareraTournaments.length} events</div>
                        </div>

                        {kareraTournaments.length === 0 ? (
                            <div className="text-center py-10 bg-casino-dark-850 rounded-2xl border border-white/5">
                                <Calendar className="w-10 h-10 text-casino-slate-700 mx-auto mb-2" />
                                <div className="text-sm font-semibold text-white">No Karera Events</div>
                                <div className="text-casino-slate-500 text-xs mt-1">Create a tournament day in the Event Console.</div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {kareraTournaments.map((t) => (
                                    <div
                                        key={t.id}
                                        className="group relative bg-casino-dark-850 rounded-xl overflow-hidden border border-white/5 hover:border-casino-gold-500/30 transition-all"
                                    >
                                        {/* Banner */}
                                        <div className="h-28 sm:h-36 relative overflow-hidden">
                                            {t.banner_url ? (
                                                <img
                                                    src={String(t.banner_url)}
                                                    alt={t.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-gradient-to-br from-casino-dark-800 to-casino-dark-900 flex items-center justify-center">
                                                    <Trophy className="w-10 h-10 text-casino-slate-700" />
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-casino-dark-850 via-transparent to-transparent" />

                                            {/* Status Badge */}
                                            <div className="absolute top-2 left-2">
                                                <div className={clsx(
                                                    "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide",
                                                    t.status === 'active'
                                                        ? "bg-green-500/20 text-green-400 border border-green-500/30"
                                                        : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                                                )}>
                                                    <span className={clsx(
                                                        "w-1.5 h-1.5 rounded-full",
                                                        t.status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'
                                                    )} />
                                                    {t.status === 'active' ? 'Live' : 'Upcoming'}
                                                </div>
                                            </div>

                                            {/* Promo Badge */}
                                            {promoBadgeText ? (
                                                <div className="absolute top-2 right-2 max-w-[70%]">
                                                    <div className="px-2 py-1 rounded-md bg-red-600/90 text-white text-[9px] font-black uppercase tracking-widest border border-red-300/30 shadow-lg animate-pulse text-center leading-tight">
                                                        {promoBadgeText}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>

                                        {/* Content */}
                                        <div className="p-3">
                                            <h3 className="text-sm font-semibold text-white truncate">{t.name}</h3>
                                            {t.tournament_date ? (
                                                <div className="text-[10px] text-casino-slate-500 font-bold uppercase tracking-widest mt-1 mb-2">
                                                    {t.tournament_date}
                                                </div>
                                            ) : (
                                                <div className="mb-2" />
                                            )}
                                            <button
                                                onClick={() => navigate(`/karera?tournament=${encodeURIComponent(t.id)}`)}
                                                disabled={t.status !== 'active'}
                                                className={clsx(
                                                    "w-full py-2.5 rounded-lg flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wide transition-all",
                                                    t.status === 'active'
                                                        ? "bg-casino-gold-500 hover:bg-casino-gold-400 text-casino-dark-950"
                                                        : "bg-casino-dark-700 text-casino-slate-500 cursor-not-allowed"
                                                )}
                                            >
                                                <Play size={14} fill={t.status === 'active' ? "currentColor" : "none"} />
                                                {t.status === 'active' ? 'Enter Race' : 'Opens Soon'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
};
