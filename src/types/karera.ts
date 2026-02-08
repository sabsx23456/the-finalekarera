export type BetType =
    | 'win'
    | 'place'
    | 'forecast'  // Exacta (1st, 2nd)
    | 'trifecta'  // 1st, 2nd, 3rd
    | 'quartet'   // 1st, 2nd, 3rd, 4th
    | 'daily_double'
    | 'daily_double_plus_one'
    | 'pick_4'
    | 'pick_5'
    | 'pick_6'
    | 'wta'; // Winner Take All

export interface KareraTournament {
    id: string;
    name: string;
    banner_url?: string | null;
    // ISO date string (YYYY-MM-DD)
    tournament_date: string;
    status: 'active' | 'upcoming' | 'ended' | 'hidden' | string;
    created_at: string;
    updated_at: string;
}

export interface KareraRaceResult {
    announced_by?: string | null; // uuid
    announced_at?: string | null; // ISO date string
    finish_order?: {
        first: number;
        second?: number | null;
        third?: number | null;
        fourth?: number | null;
    } | null;
    odds?: Record<string, number> | null;
    // Optional settlement summary (populated by announce_karera_winner RPC)
    settled?: number | null;
    won?: number | null;
    lost?: number | null;
    payout_total?: number | null;
}

export interface KareraRace {
    id: string;
    // Legacy/unused for now (may be NULL in DB)
    event_id?: string | null;
    tournament_id?: string | null;
    name: string;
    racing_time: string;
    website_url: string | null;
    bet_types_available: BetType[];
    status: 'open' | 'closed' | 'finished' | 'cancelled';
    created_at: string;
    updated_at: string;
    result?: KareraRaceResult | null;
    tournament?: KareraTournament | null;
}

export interface KareraHorse {
    id: string;
    race_id: string;
    horse_number: number;
    horse_name: string;
    status: 'active' | 'scratched';
    current_dividend: number;
}

export interface KareraBet {
    id: string;
    user_id: string | null;
    race_id: string | null;
    amount: number;
    promo_percent?: number | null;
    promo_text?: string | null;
    bet_type: BetType | string;
    combinations: unknown; // jsonb payload (horses/positions/legs)
    status: 'pending' | 'won' | 'lost' | 'refunded' | 'cancelled' | string;
    payout: number;
    created_at: string;
}
