import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const useStreamSettings = () => {
    // Default fallback to test stream
    const [streamUrl, setStreamUrl] = useState<string>('https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8');
    const [streamTitle, setStreamTitle] = useState<string>('LIVE ARENA');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchSettings();

        // Subscribe to changes
        const channel = supabase
            .channel('schema-db-changes')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'app_settings',
                    // Listen to all relevant keys
                    filter: 'key=in.(stream_url,stream_title)',
                },
                (payload) => {
                    console.log('Stream URL updated:', payload.new.value);
                    if (payload.new.key === 'stream_url') setStreamUrl(payload.new.value);
                    if (payload.new.key === 'stream_title') setStreamTitle(payload.new.value);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchSettings = async () => {
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('key, value')
                .in('key', ['stream_url', 'stream_title']);

            if (error) throw error;

            const rows = (data || []) as any[];
            const byKey = new Map(rows.map((r) => [String(r.key), r.value]));

            const url = byKey.get('stream_url');
            const title = byKey.get('stream_title');
            if (typeof url === 'string' && url.trim()) setStreamUrl(url);
            if (typeof title === 'string' && title.trim()) setStreamTitle(title);
        } catch (err) {
            console.error('Unexpected error fetching settings:', err);
        } finally {
            setLoading(false);
        }
    };

    const updateSetting = async (key: 'stream_url' | 'stream_title', value: string) => {
        try {
            const { error } = await supabase
                .from('app_settings')
                .upsert({ key, value, updated_at: new Date().toISOString() });

            if (error) throw error;
            if (key === 'stream_url') setStreamUrl(value);
            if (key === 'stream_title') setStreamTitle(value);
            return { error: null };
        } catch (error: any) {
            console.error(`Error updating ${key}:`, error);
            return { error };
        }
    };

    return { streamUrl, streamTitle, loading, updateStreamUrl: (url: string) => updateSetting('stream_url', url), updateStreamTitle: (title: string) => updateSetting('stream_title', title) };
};
