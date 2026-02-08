import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Calendar } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';

import clsx from 'clsx';
import { BettingAdminPage } from '../betting/BettingAdminPage';


interface Event {
    id: string;
    name: string;
    status: 'active' | 'upcoming' | 'ended' | 'hidden';
    banner_url?: string;
    stream_url?: string;
    stream_title?: string;
}

export const EventDetailPage = () => {
    const { eventId } = useParams();
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [event, setEvent] = useState<Event | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (eventId) fetchEventDetails();
    }, [eventId]);

    const fetchEventDetails = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .single();

        if (error) {
            console.error('Error fetching event:', error);
            showToast('Failed to load event details', 'error');
            navigate('/events');
        } else {
            setEvent(data);
        }
        setLoading(false);
    };

    if (loading) return <div className="text-center py-20 text-white/50 animate-pulse">Loading event...</div>;
    if (!event) return null;

    return (
        <div className="space-y-6 max-w-7xl mx-auto py-6 px-4 md:px-0">
            {/* Header */}
            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate('/events')}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-casino-slate-400 hover:text-white transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-2xl md:text-3xl font-display font-black text-white tracking-tight flex items-center gap-3">
                        <Calendar className="text-casino-gold-400" />
                        {event.name}
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                        <span className={clsx(
                            "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border",
                            event.status === 'active' ? "bg-green-500/20 text-green-400 border-green-500/30" :
                                event.status === 'upcoming' ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
                                    "bg-neutral-500/20 text-neutral-400 border-neutral-500/30"
                        )}>
                            {event.status}
                        </span>
                        <span className="text-xs text-casino-slate-500">Event ID: {event.id}</span>
                    </div>
                </div>
            </div>


            <div className="bg-neutral-900/50 border border-white/5 rounded-3xl p-6">
                <BettingAdminPage
                    forcedEventId={eventId}
                    streamUrl={event.stream_url}
                    streamTitle={event.stream_title || event.name}
                />
            </div>
        </div>
    );
};
