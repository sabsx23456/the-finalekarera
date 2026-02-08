import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export const useAiPromptKnowledge = () => {
    const [knowledge, setKnowledge] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchKnowledge();

        const channel = supabase
            .channel('ai-prompt-knowledge')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'app_settings',
                    filter: 'key=eq.ai_prompt_knowledge',
                },
                (payload) => {
                    if (payload.new?.value !== undefined) {
                        setKnowledge(payload.new.value || '');
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchKnowledge = async () => {
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'ai_prompt_knowledge')
                .single();

            if (data?.value) {
                setKnowledge(data.value);
            } else if (error && error.code !== 'PGRST116') {
                console.error('Error fetching AI prompt knowledge:', error);
            }
        } catch (error) {
            console.error('Unexpected error fetching AI prompt knowledge:', error);
        } finally {
            setLoading(false);
        }
    };

    const updateKnowledge = async (value: string) => {
        try {
            const { error } = await supabase
                .from('app_settings')
                .upsert({ key: 'ai_prompt_knowledge', value, updated_at: new Date().toISOString() });

            if (error) throw error;
            setKnowledge(value);
            return { error: null };
        } catch (error: unknown) {
            console.error('Error updating AI prompt knowledge:', error);
            return { error: error instanceof Error ? error : new Error('Unknown error') };
        }
    };

    return { knowledge, loading, updateKnowledge };
};
