import { apiFetchJson } from './apiClient';

export type OpenRouterMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

export type OpenRouterAudioResponse = {
    id: string;
    data: string; // Base64 audio
    expires_at: number;
    transcript: string;
};

const OPENROUTER_MODEL =
    (import.meta.env.VITE_OPENROUTER_MODEL as string | undefined) || 'x-ai/grok-4.1-fast';

export const createOpenRouterChatCompletion = async (
    messages: OpenRouterMessage[],
    options?: {
        model?: string;
        modalities?: string[];
    }
) => {
    const response = await apiFetchJson<{
        content: string;
        audio?: { id: string; data: string };
    }>('/api/openrouter/chat', {
        body: {
            model: options?.model || OPENROUTER_MODEL,
            messages,
            modalities: options?.modalities,
        },
    });

    return response;
};
