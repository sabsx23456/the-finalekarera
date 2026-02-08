import { supabase } from '../lib/supabase';

export interface VisionRequestPayload {
    raceId: string;
    streamUrl: string;
    type: 'FORECAST' | 'DAILY_DOUBLE';
}

/**
 * Fetches the latest betting data from the AI Vision backend.
 * 
 * @param raceId - ID of the current race
 * @param streamUrl - The video stream URL to capture/analyze
 * @param type - Context type (Forecast vs Daily Double)
 * @returns Parsed LiveBoardData or null if failed/no data
 */
export const fetchVisionData = async (raceId: string, streamUrl: string, type: 'FORECAST' | 'DAILY_DOUBLE') => {
    try {
        const FUNCTION_URL = import.meta.env.VITE_SUPABASE_FUNCTION_URL as string | undefined;

        // Avoid noisy polling unless the edge function is actually configured.
        if (!FUNCTION_URL || FUNCTION_URL.includes('YOUR_PROJECT_REF')) return null;
        if (!streamUrl) return null;

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return null;

        const response = await fetch(FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ raceId, streamUrl, type })
        });

        if (!response.ok) {
            // console.warn('Vision API error:', response.statusText);
            return null;
        }

        const data = await response.json();

        // Strict Validation: Ensure essential data exists
        if (!data || !data.pool_gross || !data.row_totals) {
            return null;
        }

        return data;
    } catch {
        // console.error('Vision fetch failed:', e);
        return null;
    }
};
