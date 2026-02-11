import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Trophy, Calendar, Trash2, Edit2, Upload, Swords, RotateCcw, Tv, Sparkles, Megaphone, Clock, Lock, Unlock } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { useDropzone } from 'react-dropzone';
import { LiveStreamPlayer } from '../../components/LiveStreamPlayer';
import clsx from 'clsx';
import type { Match } from '../../types';
import type { KareraHorse, KareraRace, KareraTournament } from '../../types/karera';
import { useNavigate } from 'react-router-dom';
import { createOpenRouterVisionCompletion } from '../../lib/openrouterVision';
import { extractFirstJsonValue } from '../../lib/extractJson';
import { estimateHorseDividendFromRowTotal } from '../../lib/kareraCalculations';
import { KareraAnnounceWinnerModal } from '../../components/dashboard/KareraAnnounceWinnerModal';
import { KareraTournamentModal } from '../../components/dashboard/KareraTournamentModal';
import { ApiError } from '../../lib/apiClient';

interface Event {
    id: string;
    name: string;
    description?: string;
    banner_url?: string;
    stream_url?: string;
    stream_title?: string;
    status: 'active' | 'upcoming' | 'ended' | 'hidden';
    created_at: string;
    // Joined
    matches?: Match[];
}

export const EventManagementPage = () => {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [nowMs, setNowMs] = useState(() => Date.now());

    // Global State
    const [loading, setLoading] = useState(true);
    const [isEventModalOpen, setIsEventModalOpen] = useState(false);

    // Sabong State
    const [events, setEvents] = useState<Event[]>([]);
    const [editingEvent, setEditingEvent] = useState<Event | null>(null);
    const [viewingStreamEvent, setViewingStreamEvent] = useState<Event | null>(null);
    const [uploading, setUploading] = useState(false);
    const [eventFormData, setEventFormData] = useState({
        name: '',
        banner_url: '',
        stream_url: '',
        stream_title: '',
        status: 'active' as const
    });

    // Karera State
    const [activeTab, setActiveTab] = useState<'sabong' | 'karera'>('sabong');
    const [kareraTournaments, setKareraTournaments] = useState<KareraTournament[]>([]);
    const [kareraTournamentsLoading, setKareraTournamentsLoading] = useState(false);
    const [selectedKareraTournamentId, setSelectedKareraTournamentId] = useState<string>('');
    const [editingKareraTournament, setEditingKareraTournament] = useState<KareraTournament | null>(null);
    const [isKareraTournamentModalOpen, setIsKareraTournamentModalOpen] = useState(false);
    const [kareraRaces, setKareraRaces] = useState<KareraRace[]>([]);
    const [announceKareraRace, setAnnounceKareraRace] = useState<KareraRace | null>(null);
    const [isAnnounceKareraOpen, setIsAnnounceKareraOpen] = useState(false);
    const [kareraLobbyOffline, setKareraLobbyOffline] = useState(false);
    const [kareraLobbyNextRace, setKareraLobbyNextRace] = useState('');
    const [kareraPromoEnabled, setKareraPromoEnabled] = useState(false);
    const [kareraPromoPercent, setKareraPromoPercent] = useState('');
    const [kareraPromoBannerText, setKareraPromoBannerText] = useState('');
    const [kareraLobbySettingsLoading, setKareraLobbySettingsLoading] = useState(false);
    const [kareraLobbySettingsSaving, setKareraLobbySettingsSaving] = useState(false);
    const [kareraFormData, setKareraFormData] = useState({
        tournament_id: '',
        name: '',
        racing_time: '',
        website_url: '',
        horse_count: 6,
        // WIN/PLACE are intentionally not supported in the current Karera UI.
        bet_types_available: ['forecast', 'trifecta', 'quartet', 'daily_double'] as string[],
        status: 'open' as const,
        is_batch: false,
        batch_count: 7
    });
    const [kareraStartInMinutes, setKareraStartInMinutes] = useState<string>('');
    const [editingKarera, setEditingKarera] = useState<KareraRace | null>(null);

    const availableBetTypes = [
        'forecast', 'trifecta', 'quartet',
        'daily_double', 'daily_double_plus_one',
        'pick_4', 'pick_5', 'pick_6', 'wta'
    ];

    type ProgramBetType = 'pick_4' | 'pick_5' | 'pick_6' | 'wta';
    const PROGRAM_BET_LEGS: Record<ProgramBetType, number> = {
        pick_4: 4,
        pick_5: 5,
        pick_6: 6,
        wta: 7,
    };

    const programBetLabel = (bt: ProgramBetType) =>
        bt === 'wta' ? 'WTA' : bt.replace('_', ' ').toUpperCase();

    const availableOpenLegsFromDraftRace = useMemo(() => {
        const normalizeTid = (v: unknown) => String(v || '').trim();
        const modalTid = normalizeTid(kareraFormData.tournament_id || selectedKareraTournamentId);
        const draftTimeMs = Date.parse(String(kareraFormData.racing_time || ''));
        const isDraftOpen = kareraFormData.status === 'open' && Number.isFinite(draftTimeMs);
        if (!isDraftOpen) return 0;

        const draftId = editingKarera?.id || '__draft_race__';
        const scopedOpen = kareraRaces
            .filter((r) => r.status === 'open')
            .filter((r) => normalizeTid((r as any).tournament_id) === modalTid)
            .filter((r) => r.id !== draftId)
            .map((r) => ({ ...r }));

        scopedOpen.push({
            ...(editingKarera || {} as KareraRace),
            id: draftId,
            racing_time: new Date(draftTimeMs).toISOString(),
            status: 'open',
            tournament_id: modalTid || null,
        } as KareraRace);

        scopedOpen.sort((a, b) => {
            const at = Date.parse(String(a.racing_time || ''));
            const bt = Date.parse(String(b.racing_time || ''));
            if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
            return String(a.created_at || '').localeCompare(String(b.created_at || ''));
        });

        const anchorIdx = scopedOpen.findIndex((r) => r.id === draftId);
        if (anchorIdx < 0) return 0;
        return scopedOpen.length - anchorIdx;
    }, [kareraFormData.racing_time, kareraFormData.status, kareraFormData.tournament_id, selectedKareraTournamentId, kareraRaces, editingKarera]);

    // Debounce realtime-driven refetches (prevents request storms when many rows change quickly).
    const sabongRefreshTimerRef = useRef<number | null>(null);
    const kareraTournamentsRefreshTimerRef = useRef<number | null>(null);
    const kareraRacesRefreshTimerRef = useRef<number | null>(null);
    const kareraLobbySettingsRefreshTimerRef = useRef<number | null>(null);

    const clearRefreshTimers = () => {
        if (sabongRefreshTimerRef.current) window.clearTimeout(sabongRefreshTimerRef.current);
        if (kareraTournamentsRefreshTimerRef.current) window.clearTimeout(kareraTournamentsRefreshTimerRef.current);
        if (kareraRacesRefreshTimerRef.current) window.clearTimeout(kareraRacesRefreshTimerRef.current);
        if (kareraLobbySettingsRefreshTimerRef.current) window.clearTimeout(kareraLobbySettingsRefreshTimerRef.current);
        sabongRefreshTimerRef.current = null;
        kareraTournamentsRefreshTimerRef.current = null;
        kareraRacesRefreshTimerRef.current = null;
        kareraLobbySettingsRefreshTimerRef.current = null;
    };

    const scheduleSabongRefresh = () => {
        if (sabongRefreshTimerRef.current) return;
        sabongRefreshTimerRef.current = window.setTimeout(() => {
            sabongRefreshTimerRef.current = null;
            fetchEventsAndMatches();
        }, 250);
    };

    const scheduleKareraTournamentsRefresh = () => {
        if (kareraTournamentsRefreshTimerRef.current) return;
        kareraTournamentsRefreshTimerRef.current = window.setTimeout(() => {
            kareraTournamentsRefreshTimerRef.current = null;
            fetchKareraTournaments();
        }, 250);
    };

    const scheduleKareraRacesRefresh = () => {
        if (kareraRacesRefreshTimerRef.current) return;
        kareraRacesRefreshTimerRef.current = window.setTimeout(() => {
            kareraRacesRefreshTimerRef.current = null;
            fetchKareraRaces();
        }, 250);
    };

    const scheduleKareraLobbySettingsRefresh = () => {
        if (kareraLobbySettingsRefreshTimerRef.current) return;
        kareraLobbySettingsRefreshTimerRef.current = window.setTimeout(() => {
            kareraLobbySettingsRefreshTimerRef.current = null;
            fetchKareraLobbySettings();
        }, 250);
    };

    // --- EFFECTS ---

    // Only tick the countdown timer while the Karera tab is visible.
    // This avoids forcing a full page re-render every second on the Sabong admin UI.
    useEffect(() => {
        if (activeTab !== 'karera') return;
        const t = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(t);
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'sabong') {
            fetchEventsAndMatches();
        } else {
            fetchKareraTournaments();
            fetchKareraLobbySettings();
        }

        // Realtime subscription
        const channel = supabase
            .channel('events_page_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => activeTab === 'sabong' && scheduleSabongRefresh())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => activeTab === 'sabong' && scheduleSabongRefresh())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'karera_tournaments' }, () => activeTab === 'karera' && scheduleKareraTournamentsRefresh())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'karera_races' }, () => activeTab === 'karera' && scheduleKareraRacesRefresh())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings', filter: 'key=in.(karera_offline,karera_offline_next_race,karera_promo_enabled,karera_promo_percent,karera_promo_banner_text)' }, () => activeTab === 'karera' && scheduleKareraLobbySettingsRefresh())
            .subscribe();

        return () => {
            clearRefreshTimers();
            supabase.removeChannel(channel);
        };
    }, [activeTab]);

    useEffect(() => {
        if (activeTab !== 'karera') return;
        fetchKareraRaces();
    }, [activeTab, selectedKareraTournamentId]);

    // --- DATA FETCHING ---

    const pad2 = (n: number) => String(n).padStart(2, '0');

    const toLocalDatetimeInputValue = (d: Date) => {
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    };

    const formatCountdown = (ms: number) => {
        const total = Math.max(0, Math.floor(ms / 1000));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
        return `${m}:${pad2(s)}`;
    };

    const parseBool = (v: any) => {
        const s = String(v ?? '').trim().toLowerCase();
        return s === 'true' || s === '1' || s === 'yes' || s === 'on';
    };

    const fetchKareraLobbySettings = async () => {
        setKareraLobbySettingsLoading(true);
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
            const map = new Map<string, string>();
            (data || []).forEach((row: any) => {
                if (!row?.key) return;
                map.set(String(row.key), String(row.value ?? ''));
            });

            setKareraLobbyOffline(parseBool(map.get('karera_offline')));
            setKareraLobbyNextRace(map.get('karera_offline_next_race') ?? '');
            setKareraPromoEnabled(parseBool(map.get('karera_promo_enabled')));
            setKareraPromoPercent(map.get('karera_promo_percent') ?? '');
            setKareraPromoBannerText(map.get('karera_promo_banner_text') ?? '');
        } catch (error: any) {
            console.error('Error fetching karera lobby settings:', error);
            // Keep safe defaults
            setKareraLobbyOffline(false);
            setKareraLobbyNextRace('');
            setKareraPromoEnabled(false);
            setKareraPromoPercent('');
            setKareraPromoBannerText('');
        } finally {
            setKareraLobbySettingsLoading(false);
        }
    };

    const upsertKareraLobbySetting = async (
        key: 'karera_offline' | 'karera_offline_next_race' | 'karera_promo_enabled' | 'karera_promo_percent' | 'karera_promo_banner_text',
        value: string
    ) => {
        const description =
            key === 'karera_offline'
                ? 'Karera lobby offline mode (true/false)'
                : key === 'karera_offline_next_race'
                    ? 'Karera lobby next race schedule text (shown when offline)'
                    : key === 'karera_promo_enabled'
                        ? 'Enable Karera promo stake bonus (true/false)'
                        : key === 'karera_promo_percent'
                            ? 'Karera promo percent (e.g. 10 for +10%)'
                            : 'Karera promo banner text (supports {percent} placeholder)';

        const { error } = await supabase
            .from('app_settings')
            .upsert({ key, value, description, updated_at: new Date().toISOString() } as any);

        if (error) throw error;
    };

    const handleToggleKareraLobbyOffline = async () => {
        if (kareraLobbySettingsSaving) return;

        const prev = kareraLobbyOffline;
        const next = !prev;
        setKareraLobbyOffline(next);
        setKareraLobbySettingsSaving(true);

        try {
            await upsertKareraLobbySetting('karera_offline', String(next));
            showToast(`Karera lobby is now ${next ? 'OFFLINE' : 'ONLINE'}.`, 'success');
        } catch (error: any) {
            console.error('Failed to update karera offline setting:', error);
            setKareraLobbyOffline(prev);
            showToast(error?.message || 'Failed to update Karera offline setting', 'error');
        } finally {
            setKareraLobbySettingsSaving(false);
        }
    };

    const handleSaveKareraLobbyNextRace = async () => {
        if (kareraLobbySettingsSaving) return;

        const value = String(kareraLobbyNextRace || '').trim();
        setKareraLobbySettingsSaving(true);

        try {
            await upsertKareraLobbySetting('karera_offline_next_race', value);
            showToast('Karera offline schedule updated.', 'success');
        } catch (error: any) {
            console.error('Failed to update karera next race setting:', error);
            showToast(error?.message || 'Failed to update Karera schedule', 'error');
        } finally {
            setKareraLobbySettingsSaving(false);
        }
    };

    const handleToggleKareraPromoEnabled = async () => {
        if (kareraLobbySettingsSaving) return;

        const prev = kareraPromoEnabled;
        const next = !prev;
        setKareraPromoEnabled(next);
        setKareraLobbySettingsSaving(true);

        try {
            await upsertKareraLobbySetting('karera_promo_enabled', String(next));
            showToast(`Karera promo is now ${next ? 'ENABLED' : 'DISABLED'}.`, 'success');
        } catch (error: any) {
            console.error('Failed to update karera promo setting:', error);
            setKareraPromoEnabled(prev);
            showToast(error?.message || 'Failed to update Karera promo setting', 'error');
        } finally {
            setKareraLobbySettingsSaving(false);
        }
    };

    const handleSaveKareraPromo = async () => {
        if (kareraLobbySettingsSaving) return;
        const pct = String(kareraPromoPercent || '').trim();
        const text = String(kareraPromoBannerText || '').trim();

        setKareraLobbySettingsSaving(true);
        try {
            await Promise.all([
                upsertKareraLobbySetting('karera_promo_percent', pct),
                upsertKareraLobbySetting('karera_promo_banner_text', text),
            ]);
            showToast('Karera promo settings saved.', 'success');
        } catch (error: any) {
            console.error('Failed to save karera promo settings:', error);
            showToast(error?.message || 'Failed to save Karera promo settings', 'error');
        } finally {
            setKareraLobbySettingsSaving(false);
        }
    };

    const fetchKareraTournaments = async () => {
        setKareraTournamentsLoading(true);
        try {
            const { data, error } = await supabase
                .from('karera_tournaments')
                .select('*')
                .order('tournament_date', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;

            const list = (data || []) as KareraTournament[];
            setKareraTournaments(list);

            // Pick a default tournament if needed
            const hasSelected = selectedKareraTournamentId && list.some((t) => t.id === selectedKareraTournamentId);
            if (!hasSelected) {
                const active = list.find((t) => t.status === 'active') || list[0];
                setSelectedKareraTournamentId(active?.id || '');
            }
        } catch (error: any) {
            console.warn('Error fetching karera tournaments:', error);
            setKareraTournaments([]);
            setSelectedKareraTournamentId('');
        } finally {
            setKareraTournamentsLoading(false);
        }
    };

    const fetchKareraRaces = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('karera_races')
                .select('*')
                .order('racing_time', { ascending: true })
                .order('created_at', { ascending: true });

            if (selectedKareraTournamentId) {
                query = query.eq('tournament_id', selectedKareraTournamentId);
            }

            const { data, error } = await query;

            if (error) throw error;
            setKareraRaces(data as KareraRace[]);
        } catch (error: any) {
            console.error('Error fetching karera:', error);
            const msg = error?.message || 'Failed to load races';
            if (/column .*tournament_id.* does not exist/i.test(msg)) {
                showToast('Missing DB column: run scripts/sql/karera_tournaments.sql in Supabase SQL Editor.', 'error');
            } else {
                showToast(msg, 'error');
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchEventsAndMatches = async () => {
        setLoading(true);
        // Fetch Events with their latest match
        const { data, error } = await supabase
            .from('events')
            .select(`
                *,
                matches (
                    id, status, fight_id, created_at, winner, meron_name, wala_name,
                    meron_total, wala_total, draw_total
                )
            `)
            .order('created_at', { ascending: false })
            // Order/limit the embedded matches so we don't pull the entire match history for each event.
            .order('created_at', { referencedTable: 'matches', ascending: false })
            .limit(1, { referencedTable: 'matches' });

        if (error) {
            console.error('Error fetching events:', error);
            showToast('Failed to load events', 'error');
        } else {
            const processed = (data || []).map((ev: any) => ({
                ...ev,
                matches: Array.isArray(ev.matches) ? ev.matches : [],
            }));
            setEvents(processed as Event[]);
        }
        setLoading(false);
    };

    type RaceHorseForm = {
        id?: string;
        number: number;
        name: string;
        status: 'active' | 'scratched';
        current_dividend?: number;
    };

    const [raceHorses, setRaceHorses] = useState<RaceHorseForm[]>([]);
    const [initialRaceHorseIds, setInitialRaceHorseIds] = useState<string[]>([]);

    type KareraVisionDividend = { horse_number: number; amount: number };
    type KareraVisionCell = {
        i: number;
        j: number;
        display: number;
        est?: number | null;
        is_capped: boolean;
        confidence: 'HIGH' | 'MED' | 'LOW';
    };
    type KareraVisionLiveBoard = {
        timestamp: string;
        pool_gross: number;
        pool_net_est?: number | null;
        row_totals: Record<string, number>;
        col_totals: Record<string, number>;
        cells: KareraVisionCell[];
    };

    type KareraVisionProgramEntry = { leg: number; value: number };
    type KareraVisionProgramBoard = {
        timestamp: string;
        pool_gross: number;
        spread?: number | null;
        mtr?: number | null;
        entries: KareraVisionProgramEntry[];
    };
    type KareraVisionAnalysis = {
        matrix_kind?: 'daily_double' | 'forecast' | 'pick_4' | 'pick_5' | 'pick_6' | 'wta' | 'unknown';
        dividends?: KareraVisionDividend[];
        scratched?: number[];
        live_board?: KareraVisionLiveBoard | null;
        program_board?: KareraVisionProgramBoard | null;
    };

    const [visionImageDataUrl, setVisionImageDataUrl] = useState<string>('');
    const [visionAnalyzing, setVisionAnalyzing] = useState(false);
    const [visionApplying, setVisionApplying] = useState(false);
    const [visionAnalysis, setVisionAnalysis] = useState<KareraVisionAnalysis | null>(null);
    const [visionRaw, setVisionRaw] = useState<string>('');
    const [visionError, setVisionError] = useState<string>('');

    // --- KARERA HANDLERS ---

    const VISION_PROMPT = `Read this screenshot of a horse racing betting board.\n\nReturn ONLY a valid JSON object (no markdown, no code fences, no extra text). The response must start with \"{\" and end with \"}\".\n\nJSON fields:\n- matrix_kind: \"daily_double\" | \"forecast\" | \"pick_4\" | \"pick_5\" | \"pick_6\" | \"wta\" | \"unknown\" (lowercase)\n  - If the header contains \"DAILY DOUBLE PAYS\" => \"daily_double\"\n  - If the header contains \"FORECAST PAYS\" => \"forecast\"\n  - If the header contains \"PICK FOUR\" or \"PICK 4\" => \"pick_4\"\n  - If the header contains \"PICK FIVE\" or \"PICK 5\" => \"pick_5\"\n  - If the header contains \"PICK SIX\" or \"PICK 6\" => \"pick_6\"\n  - If the header contains \"WTA\" or \"WINNER TAKE ALL\" => \"wta\"\n  - Otherwise => \"unknown\"\n- dividends: array of { horse_number:int, amount:number } (use [] if not a WIN/Dividends screen)\n- scratched: array of horse numbers that are scratched (use [] if none/unknown)\n- live_board: null OR an object with:\n  - pool_gross: number (example: \"P328666\" -> 328666)\n  - pool_net_est: number or null\n  - row_totals: object (keys are horse numbers as strings) or {}\n  - col_totals: object (keys are horse numbers as strings) or {}\n  - cells: array of { i:int, j:int, display:int }\n  (Use this ONLY for DAILY DOUBLE / FORECAST matrix screens)\n- program_board: null OR an object with:\n  - pool_gross: number (example: \"P1571714\" -> 1571714)\n  - spread: number or null (value after \"SPREAD\")\n  - mtr: number or null (minutes-to-race if shown)\n  - entries: array of { leg:int, value:int } (example: a line like \"2 6055\" => {leg:2,value:6055})\n  (Use this ONLY for PICK 4/5/6 or WTA screens)\n\nRules:\n- If you cannot read something, return empty arrays/null/{}.\n- If a cell shows 999, use display=999.\n- Do not include comments.`;

    const VISION_PROMPT_RETRY = `Return ONLY valid JSON (no markdown). Start with \"{\" and end with \"}\".\n\nInclude matrix_kind as one of:\n- \"daily_double\" (DAILY DOUBLE PAYS)\n- \"forecast\" (FORECAST PAYS)\n- \"pick_4\" (PICK FOUR / PICK 4)\n- \"pick_5\" (PICK FIVE / PICK 5)\n- \"pick_6\" (PICK SIX / PICK 6)\n- \"wta\" (WTA / WINNER TAKE ALL)\n- \"unknown\" if unclear\n\nIf you are reading a DAILY DOUBLE PAYS / FORECAST PAYS matrix:\n- Set dividends = []\n- Set scratched = []\n- Set program_board = null\n- Set row_totals = {} and col_totals = {}\n- Fill live_board.cells with the matrix values using the minimal shape {i,j,display}. Any missing/unclear cells can be omitted.\nIf you can read the pool (top right, like P328666), put it in live_board.pool_gross as a number.\n\nIf you are reading PICK 4/5/6 or WTA:\n- Set dividends = []\n- Set scratched = []\n- Set live_board = null\n- Fill program_board.pool_gross (Pxxxxxx), program_board.spread (after \"SPREAD\"), program_board.mtr (if shown), and program_board.entries.`;

    const VISION_PROMPT_TABLE = `Return ONLY plain text (no JSON, no markdown) in this exact format:\n\nKIND=<DAILY_DOUBLE|FORECAST|UNKNOWN>\nPOOL_GROSS=<integer>\nROWS=<space-separated row numbers>\nCOLS=<space-separated col numbers>\nROW <row>=<space-separated integers for each column>\n\nRules:\n- KIND must be based on the header text (DAILY DOUBLE PAYS vs FORECAST PAYS).\n- Use 999 exactly where the screen shows 999.\n- If pool is unreadable, output POOL_GROSS=0.\n- If any cell is unreadable, output 0 for that cell.\n- Do not output any other lines.`;

    const isVisionAnalysisLike = (v: any): v is KareraVisionAnalysis => {
        if (!v || typeof v !== 'object') return false;
        if (Array.isArray(v)) return false;
        return 'matrix_kind' in v || 'dividends' in v || 'scratched' in v || 'live_board' in v || 'program_board' in v;
    };

    const parseVisionTable = (text: string): KareraVisionAnalysis | null => {
        if (!text) return null;
        const lines = text
            .split(/\r?\n/g)
            .map((l) => l.trim())
            .filter(Boolean);

        const parseIntList = (s: string) =>
            (s.match(/\d+/g) || [])
                .map((x) => Number.parseInt(x, 10))
                .filter((n) => Number.isFinite(n) && n > 0);

        let poolGross = 0;
        let kind: 'daily_double' | 'forecast' | 'unknown' = 'unknown';
        let rows: number[] = [];
        let cols: number[] = [];
        const rowValues = new Map<number, number[]>();

        for (const line of lines) {
            const kindMatch = line.match(/^KIND\s*[:=]\s*(DAILY_DOUBLE|FORECAST|UNKNOWN)\s*$/i);
            if (kindMatch) {
                const k = String(kindMatch[1] || '').toUpperCase();
                kind = k === 'FORECAST' ? 'forecast' : k === 'DAILY_DOUBLE' ? 'daily_double' : 'unknown';
                continue;
            }

            const poolMatch = line.match(/^POOL_GROSS\s*[:=]\s*(\d+)/i);
            if (poolMatch) {
                poolGross = Number.parseInt(poolMatch[1], 10) || 0;
                continue;
            }

            const rowsMatch = line.match(/^ROWS\s*[:=]\s*(.+)$/i);
            if (rowsMatch) {
                rows = parseIntList(rowsMatch[1]);
                continue;
            }

            const colsMatch = line.match(/^COLS\s*[:=]\s*(.+)$/i);
            if (colsMatch) {
                cols = parseIntList(colsMatch[1]);
                continue;
            }

            const rowMatch = line.match(/^ROW\s+(\d+)\s*[:=]\s*(.+)$/i);
            if (rowMatch) {
                const r = Number.parseInt(rowMatch[1], 10);
                if (!Number.isFinite(r) || r <= 0) continue;
                const vals = (rowMatch[2].match(/-?\d+/g) || [])
                    .map((x) => Number.parseInt(x, 10))
                    .map((n) => (Number.isFinite(n) ? n : 0));
                rowValues.set(r, vals);
                continue;
            }
        }

        if (rows.length === 0 && rowValues.size > 0) {
            rows = Array.from(rowValues.keys()).sort((a, b) => a - b);
        }

        if (cols.length === 0 && rowValues.size > 0) {
            const maxLen = Math.max(0, ...Array.from(rowValues.values()).map((v) => v.length));
            cols = Array.from({ length: maxLen }, (_, i) => i + 1);
        }

        if (rows.length === 0 || cols.length === 0) return null;

        const cells: KareraVisionCell[] = [];
        const row_totals: Record<string, number> = {};
        const col_totals: Record<string, number> = {};
        for (const r of rows) {
            row_totals[String(r)] = 0;
            const vals = rowValues.get(r) || [];
            for (let idx = 0; idx < cols.length; idx++) {
                const c = cols[idx];
                col_totals[String(c)] = 0;
                const raw = vals[idx] ?? 0;
                const display = Number.isFinite(raw) ? Math.trunc(raw) : 0;
                if (display <= 0) continue; // treat 0 as "unreadable/missing"
                cells.push({
                    i: r,
                    j: c,
                    display,
                    est: null,
                    is_capped: display === 999,
                    confidence: 'MED',
                });
            }
        }

        return {
            matrix_kind: kind,
            dividends: [],
            scratched: [],
            live_board: {
                timestamp: new Date().toISOString(),
                pool_gross: poolGross,
                pool_net_est: poolGross > 0 ? Math.floor(poolGross * 0.85) : null,
                row_totals,
                col_totals,
                cells,
            },
        };
    };

    const readFileAsDataUrl = (file: File) =>
        new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Failed to read image file'));
            reader.readAsDataURL(file);
        });

    const downscaleImageDataUrl = async (
        dataUrl: string,
        opts?: { maxDim?: number; quality?: number; mimeType?: string },
    ) => {
        const maxDim = opts?.maxDim ?? 1600;
        const quality = opts?.quality ?? 0.86;
        const mimeType = opts?.mimeType ?? 'image/jpeg';

        if (!dataUrl.startsWith('data:image/')) return dataUrl;

        const img = new Image();
        const load = new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Failed to decode image'));
        });
        img.src = dataUrl;
        await load;

        const w = Number(img.naturalWidth || img.width || 0);
        const h = Number(img.naturalHeight || img.height || 0);
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return dataUrl;

        const scale = Math.min(1, maxDim / Math.max(w, h));
        if (!Number.isFinite(scale) || scale <= 0 || scale >= 1) return dataUrl;

        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));

        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) return dataUrl;

        // Most race boards are on a black background; fill to avoid odd alpha behavior.
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);

        try {
            return canvas.toDataURL(mimeType, quality);
        } catch {
            return dataUrl;
        }
    };

    const coerceInt = (v: unknown) => {
        const n = coerceNumber(v);
        if (n === null) return null;
        return Math.trunc(n);
    };

    const coerceNumber = (v: unknown) => {
        if (typeof v === 'number') return Number.isFinite(v) ? v : null;
        if (typeof v === 'string') {
            const cleaned = v.replace(/,/g, '');
            const match = cleaned.match(/-?\d+(?:\.\d+)?/);
            if (!match) return null;
            const n = Number(match[0]);
            return Number.isFinite(n) ? n : null;
        }
        return null;
    };

    const normalizeScratchedList = (v: unknown) => {
        const arr = Array.isArray(v) ? v : [];
        const out: number[] = [];
        for (const item of arr) {
            const n = coerceInt(item);
            if (n && n > 0 && !out.includes(n)) out.push(n);
        }
        return out;
    };

    const normalizeDividends = (v: unknown) => {
        const arr: unknown[] = Array.isArray(v) ? v : [];
        const map = new Map<number, number>();
        for (const item of arr) {
            if (!item || typeof item !== 'object') continue;
            const obj = item as Record<string, unknown>;
            const hn = coerceInt(obj['horse_number']);
            const amt = coerceNumber(obj['amount']);
            if (!hn || hn <= 0) continue;
            if (amt === null || amt < 0) continue;
            map.set(hn, amt);
        }
        return Array.from(map.entries()).map(([horse_number, amount]) => ({ horse_number, amount }));
    };

    const isLiveBoardLike = (v: any): v is KareraVisionLiveBoard => {
        if (!v || typeof v !== 'object') return false;
        if (!Array.isArray(v.cells)) return false;
        return true;
    };

    const normalizeLiveBoard = (v: KareraVisionLiveBoard) => {
        const poolGross = coerceNumber((v as any).pool_gross) ?? 0;
        const poolNet = coerceNumber((v as any).pool_net_est);

        const normalizeTotals = (obj: any) => {
            const out: Record<string, number> = {};
            if (!obj || typeof obj !== 'object') return out;
            for (const [k, val] of Object.entries(obj)) {
                const n = coerceNumber(val);
                if (n === null) continue;
                out[String(k)] = n;
            }
            return out;
        };

        const normalizeConfidence = (c: any): 'HIGH' | 'MED' | 'LOW' => {
            const s = String(c || '').toUpperCase();
            if (s === 'HIGH' || s === 'MED' || s === 'LOW') return s as any;
            return 'LOW';
        };

        const normalizeCells = (arr: any[]) => {
            if (!Array.isArray(arr)) return [] as KareraVisionCell[];
            const out: KareraVisionCell[] = [];
            for (const item of arr) {
                if (!item || typeof item !== 'object') continue;
                const i = coerceInt((item as any).i);
                const j = coerceInt((item as any).j);
                const display = coerceInt((item as any).display);
                if (!i || !j || display === null) continue;

                const est = coerceNumber((item as any).est);
                const isCappedRaw = (item as any).is_capped;
                const isCapped = typeof isCappedRaw === 'boolean' ? isCappedRaw : display === 999;

                out.push({
                    i,
                    j,
                    display,
                    est: est ?? null,
                    is_capped: isCapped,
                    confidence: normalizeConfidence((item as any).confidence),
                });
            }
            return out;
        };

        return {
            timestamp: typeof (v as any).timestamp === 'string' ? (v as any).timestamp : new Date().toISOString(),
            pool_gross: poolGross,
            pool_net_est: poolNet ?? Math.floor(poolGross * 0.85),
            row_totals: normalizeTotals((v as any).row_totals),
            col_totals: normalizeTotals((v as any).col_totals),
            cells: normalizeCells((v as any).cells),
        };
    };

    const isProgramBoardLike = (v: any): v is KareraVisionProgramBoard => {
        if (!v || typeof v !== 'object') return false;
        return Array.isArray((v as any).entries);
    };

    const normalizeProgramBoard = (v: KareraVisionProgramBoard) => {
        const poolGross = coerceNumber((v as any).pool_gross) ?? 0;
        const spread = coerceNumber((v as any).spread);
        const mtr = coerceNumber((v as any).mtr);

        const arr = Array.isArray((v as any).entries) ? ((v as any).entries as any[]) : [];
        const map = new Map<number, number>();
        for (const item of arr) {
            if (!item || typeof item !== 'object') continue;
            const leg = coerceInt((item as any).leg);
            const value = coerceNumber((item as any).value);
            if (!leg || leg <= 0) continue;
            if (value === null || value < 0) continue;
            map.set(leg, Math.trunc(value));
        }

        const entries = Array.from(map.entries())
            .map(([leg, value]) => ({ leg, value }))
            .sort((a, b) => a.leg - b.leg);

        return {
            timestamp: typeof (v as any).timestamp === 'string' ? (v as any).timestamp : new Date().toISOString(),
            pool_gross: poolGross,
            spread: spread === null ? null : Math.trunc(spread),
            mtr: mtr === null ? null : Math.trunc(mtr),
            entries,
        } as KareraVisionProgramBoard;
    };

    const handleSelectVisionImage = async (file: File | null) => {
        if (!file) return;
        try {
            setVisionError('');
            setVisionAnalysis(null);
            setVisionRaw('');
            const dataUrl = await readFileAsDataUrl(file);
            const downscaled = await downscaleImageDataUrl(dataUrl);
            setVisionImageDataUrl(downscaled);
        } catch (err: any) {
            setVisionError(err?.message || 'Failed to load image');
            showToast(err?.message || 'Failed to load image', 'error');
        }
    };

    const handleAnalyzeVisionImage = async () => {
        if (!editingKarera) {
            showToast('Save the race first, then upload an image for AI Vision.', 'error');
            return;
        }
        if (!visionImageDataUrl) {
            showToast('Please choose an image first.', 'error');
            return;
        }

        setVisionAnalyzing(true);
        setVisionError('');
        try {
            const run = async (prompt: string) => {
                const { content } = await createOpenRouterVisionCompletion({
                    prompt,
                    imageDataUrl: visionImageDataUrl,
                    maxTokens: 1600,
                });
                return content;
            };

            const primary = await run(VISION_PROMPT);
            let combinedRaw = primary;
            let parsed: unknown = extractFirstJsonValue(primary);
            let analysis: KareraVisionAnalysis | null = isVisionAnalysisLike(parsed) ? (parsed as KareraVisionAnalysis) : null;

            if (!analysis) {
                // Retry once with a narrower prompt (some models ignore "JSON only" on first attempt)
                const retry = await run(VISION_PROMPT_RETRY);
                combinedRaw = `${primary}\n\n--- RETRY ---\n\n${retry}`;
                parsed = extractFirstJsonValue(retry);
                analysis = isVisionAnalysisLike(parsed) ? (parsed as KareraVisionAnalysis) : null;
            }

            if (!analysis) {
                // Last resort: ask for a plain-text table that we can parse reliably
                const table = await run(VISION_PROMPT_TABLE);
                combinedRaw = `${combinedRaw}\n\n--- TABLE ---\n\n${table}`;
                analysis = parseVisionTable(table);
            }

            setVisionRaw(combinedRaw);
            if (!analysis) {
                const looksLikeNoVision =
                    /can't (see|view) images|cannot (see|view) images|can't (see|view) the image|cannot (see|view) the image|do not have (the )?ability to (see|view) images|text-?only/i.test(
                        combinedRaw.toLowerCase(),
                    );

                if (looksLikeNoVision) {
                    throw new Error(
                        'Your OpenRouter vision model looks text-only (cannot see images). Set VITE_OPENROUTER_VISION_MODEL to a vision-capable model (e.g. google/gemini-3-flash-preview or openai/gpt-4o-mini) and restart the dev server.',
                    );
                }

                throw new Error(
                    'AI did not return parseable data (JSON/table). Open "Raw AI Output" below and send it here so I can tune the prompt/model.',
                );
            }

            setVisionAnalysis(analysis);
            showToast('AI data extracted. Review then apply.', 'success');
        } catch (err: any) {
            console.error(err);
            let msg = err?.message || 'AI analysis failed';
            if (err instanceof ApiError && err.status === 404) {
                msg =
                    'Vision API is not available. If you are running locally with `npm run dev`, restart after pulling latest changes. ' +
                    'If deployed, make sure `/api/openrouter/vision` exists and OPENROUTER_API_KEY is set on the server.';
            }
            if (err instanceof ApiError && err.status === 413) {
                msg = 'Image is too large. Please crop the screenshot tighter (board only) and try again.';
            }
            setVisionError(msg);
            showToast(msg, 'error');
        } finally {
            setVisionAnalyzing(false);
        }
    };

    const handleApplyVisionToRace = async () => {
        if (!editingKarera) return;
        if (!visionAnalysis) {
            showToast('Analyze an image first, then apply.', 'error');
            return;
        }

        const raceId = editingKarera.id;
        setVisionApplying(true);
        setVisionError('');
        try {
            const scratched = normalizeScratchedList((visionAnalysis as any).scratched);
            const dividendsFromAI = normalizeDividends((visionAnalysis as any).dividends);

            // Fallback: only if row totals look like real totals (avoid overwriting with junk for a pays matrix)
            let dividendsToApply = dividendsFromAI;
            const liveBoardCandidate = (visionAnalysis as any).live_board;
            if (dividendsToApply.length === 0 && liveBoardCandidate && typeof liveBoardCandidate === 'object') {
                const rowTotals = (liveBoardCandidate as any).row_totals;
                if (rowTotals && typeof rowTotals === 'object') {
                    const hasMeaningfulTotals = raceHorses.some((h) => {
                        const n = coerceNumber((rowTotals as any)[String(h.number)]);
                        return n !== null && n > 0;
                    });

                    if (hasMeaningfulTotals) {
                        dividendsToApply = raceHorses.flatMap((h) => {
                            const n = coerceNumber((rowTotals as any)[String(h.number)]);
                            if (n === null || n <= 0) return [];
                            return [{ horse_number: h.number, amount: estimateHorseDividendFromRowTotal(n) }];
                        });
                    }
                }
            }

            // Apply dividends
            if (dividendsToApply.length > 0) {
                for (const d of dividendsToApply) {
                    const { error } = await supabase
                        .from('karera_horses')
                        .update({ current_dividend: d.amount })
                        .eq('race_id', raceId)
                        .eq('horse_number', d.horse_number);
                    if (error) throw error;
                }
            }

            // Apply scratched (do not auto-unscratch others)
            if (scratched.length > 0) {
                const { error } = await supabase
                    .from('karera_horses')
                    .update({ status: 'scratched' })
                    .eq('race_id', raceId)
                    .in('horse_number', scratched);
                if (error) throw error;
            }

            // Persist live board / program board data (if present)
            const programBoardCandidate = (visionAnalysis as any).program_board;
            const hasLiveBoard = isLiveBoardLike(liveBoardCandidate);
            const hasProgramBoard = isProgramBoardLike(programBoardCandidate);

            if (hasLiveBoard || hasProgramBoard) {
                const kindRaw = String((visionAnalysis as any)?.matrix_kind || '').toLowerCase().trim();

                const isStoredLiveBoardLike = (v: any): v is KareraVisionLiveBoard =>
                    !!v && typeof v === 'object' && Array.isArray((v as any).cells);
                const isStoredProgramBoardLike = (v: any): v is KareraVisionProgramBoard =>
                    !!v && typeof v === 'object' && Array.isArray((v as any).entries);

                const emptyStoredBoards = () => ({
                    daily_double: null as KareraVisionLiveBoard | null,
                    forecast: null as KareraVisionLiveBoard | null,
                    pick_4: null as KareraVisionProgramBoard | null,
                    pick_5: null as KareraVisionProgramBoard | null,
                    pick_6: null as KareraVisionProgramBoard | null,
                    wta: null as KareraVisionProgramBoard | null,
                });

                const parseStoredBoards = (raw: any) => {
                    if (!raw || typeof raw !== 'object') return emptyStoredBoards();

                    // Legacy shape: board object directly stored as `data`
                    if (
                        isStoredLiveBoardLike(raw) &&
                        !('daily_double' in raw) &&
                        !('forecast' in raw) &&
                        !('pick_4' in raw) &&
                        !('pick_5' in raw) &&
                        !('pick_6' in raw) &&
                        !('wta' in raw)
                    ) {
                        const out = emptyStoredBoards();
                        out.daily_double = raw as KareraVisionLiveBoard;
                        return out;
                    }

                    const dd = isStoredLiveBoardLike((raw as any).daily_double) ? ((raw as any).daily_double as KareraVisionLiveBoard) : null;
                    const fc = isStoredLiveBoardLike((raw as any).forecast) ? ((raw as any).forecast as KareraVisionLiveBoard) : null;
                    const p4 = isStoredProgramBoardLike((raw as any).pick_4) ? ((raw as any).pick_4 as KareraVisionProgramBoard) : null;
                    const p5 = isStoredProgramBoardLike((raw as any).pick_5) ? ((raw as any).pick_5 as KareraVisionProgramBoard) : null;
                    const p6 = isStoredProgramBoardLike((raw as any).pick_6) ? ((raw as any).pick_6 as KareraVisionProgramBoard) : null;
                    const wta = isStoredProgramBoardLike((raw as any).wta) ? ((raw as any).wta as KareraVisionProgramBoard) : null;

                    return { daily_double: dd, forecast: fc, pick_4: p4, pick_5: p5, pick_6: p6, wta };
                };

                const mergeLiveBoards = (prevBoard: KareraVisionLiveBoard | null, nextBoard: KareraVisionLiveBoard) => {
                    if (!prevBoard) return nextBoard;

                    const prevCells = Array.isArray((prevBoard as any).cells) ? ((prevBoard as any).cells as KareraVisionCell[]) : [];
                    const nextCells = Array.isArray((nextBoard as any).cells) ? ((nextBoard as any).cells as KareraVisionCell[]) : [];

                    const cellMap = new Map<string, KareraVisionCell>();
                    prevCells.forEach((c) => {
                        if (!c) return;
                        const i = Number((c as any).i);
                        const j = Number((c as any).j);
                        if (!Number.isFinite(i) || !Number.isFinite(j) || i <= 0 || j <= 0) return;
                        cellMap.set(`${i}-${j}`, c);
                    });
                    nextCells.forEach((c) => {
                        if (!c) return;
                        const i = Number((c as any).i);
                        const j = Number((c as any).j);
                        if (!Number.isFinite(i) || !Number.isFinite(j) || i <= 0 || j <= 0) return;
                        cellMap.set(`${i}-${j}`, c);
                    });

                    const mergedCells = Array.from(cellMap.values()).sort((a, b) => {
                        const di = Number((a as any).i) - Number((b as any).i);
                        if (di !== 0) return di;
                        return Number((a as any).j) - Number((b as any).j);
                    });

                    const prevPoolGross = coerceNumber((prevBoard as any).pool_gross) ?? 0;
                    const nextPoolGross = coerceNumber((nextBoard as any).pool_gross) ?? 0;

                    const prevPoolNet = coerceNumber((prevBoard as any).pool_net_est);
                    const nextPoolNet = coerceNumber((nextBoard as any).pool_net_est);

                    const hasMeaningfulTotals = (obj: any) => {
                        if (!obj || typeof obj !== 'object') return false;
                        return Object.values(obj).some((v) => {
                            const n = coerceNumber(v);
                            return n !== null && n > 0;
                        });
                    };

                    const mergeTotals = (prevTotals: any, nextTotals: any) => {
                        const out: Record<string, number> = {};
                        if (prevTotals && typeof prevTotals === 'object') {
                            for (const [k, v] of Object.entries(prevTotals)) {
                                const n = coerceNumber(v);
                                if (n !== null) out[String(k)] = n;
                            }
                        }
                        if (hasMeaningfulTotals(nextTotals)) {
                            for (const [k, v] of Object.entries(nextTotals || {})) {
                                const n = coerceNumber(v);
                                if (n !== null) out[String(k)] = n;
                            }
                        }
                        return out;
                    };

                    const mergedRowTotals = mergeTotals((prevBoard as any).row_totals, (nextBoard as any).row_totals);
                    const mergedColTotals = mergeTotals((prevBoard as any).col_totals, (nextBoard as any).col_totals);

                    return {
                        timestamp: typeof (nextBoard as any).timestamp === 'string' ? (nextBoard as any).timestamp : (prevBoard as any).timestamp,
                        pool_gross: nextPoolGross > 0 ? nextPoolGross : prevPoolGross,
                        pool_net_est: nextPoolNet !== null && nextPoolNet > 0 ? nextPoolNet : prevPoolNet ?? null,
                        row_totals: mergedRowTotals,
                        col_totals: mergedColTotals,
                        cells: mergedCells,
                    } as any;
                };

                const mergeProgramBoards = (prevBoard: KareraVisionProgramBoard | null, nextBoard: KareraVisionProgramBoard) => {
                    if (!prevBoard) return nextBoard;

                    const prevEntries = Array.isArray((prevBoard as any).entries)
                        ? ((prevBoard as any).entries as KareraVisionProgramEntry[])
                        : [];
                    const nextEntries = Array.isArray((nextBoard as any).entries)
                        ? ((nextBoard as any).entries as KareraVisionProgramEntry[])
                        : [];

                    const entryMap = new Map<number, KareraVisionProgramEntry>();
                    prevEntries.forEach((e) => {
                        if (!e) return;
                        const leg = coerceInt((e as any).leg);
                        const value = coerceInt((e as any).value);
                        if (!leg || leg <= 0 || value === null || value < 0) return;
                        entryMap.set(leg, { leg, value });
                    });
                    nextEntries.forEach((e) => {
                        if (!e) return;
                        const leg = coerceInt((e as any).leg);
                        const value = coerceInt((e as any).value);
                        if (!leg || leg <= 0 || value === null || value < 0) return;
                        entryMap.set(leg, { leg, value });
                    });

                    const mergedEntries = Array.from(entryMap.values()).sort((a, b) => a.leg - b.leg);

                    const prevPoolGross = coerceNumber((prevBoard as any).pool_gross) ?? 0;
                    const nextPoolGross = coerceNumber((nextBoard as any).pool_gross) ?? 0;

                    const prevSpread = coerceNumber((prevBoard as any).spread);
                    const nextSpread = coerceNumber((nextBoard as any).spread);

                    const prevMtr = coerceNumber((prevBoard as any).mtr);
                    const nextMtr = coerceNumber((nextBoard as any).mtr);

                    const toIntOrNull = (n: number | null) => (n === null ? null : Math.trunc(n));

                    return {
                        timestamp: typeof (nextBoard as any).timestamp === 'string' ? (nextBoard as any).timestamp : (prevBoard as any).timestamp,
                        pool_gross: nextPoolGross > 0 ? nextPoolGross : prevPoolGross,
                        spread: nextSpread !== null && nextSpread > 0 ? Math.trunc(nextSpread) : toIntOrNull(prevSpread),
                        mtr: nextMtr !== null && nextMtr > 0 ? Math.trunc(nextMtr) : toIntOrNull(prevMtr),
                        entries: mergedEntries,
                    } as any;
                };

                const { data: existingRow, error: existingError } = await supabase
                    .from('karera_live_boards')
                    .select('data')
                    .eq('race_id', raceId)
                    .maybeSingle();
                if (existingError) throw existingError;

                const existing = parseStoredBoards((existingRow as any)?.data);
                const merged = { ...existing } as any;

                let shouldUpsert = false;

                if (hasLiveBoard) {
                    const board = normalizeLiveBoard(liveBoardCandidate);
                    const boardKind: 'daily_double' | 'forecast' = kindRaw === 'forecast' ? 'forecast' : 'daily_double';
                    merged[boardKind] = mergeLiveBoards(existing[boardKind], board);
                    shouldUpsert = true;
                }

                if (hasProgramBoard) {
                    const programKind = (['pick_4', 'pick_5', 'pick_6', 'wta'] as const).includes(kindRaw as any)
                        ? (kindRaw as 'pick_4' | 'pick_5' | 'pick_6' | 'wta')
                        : null;

                    if (!programKind) {
                        showToast('AI could not identify program board type (Pick 4/5/6/WTA). Re-analyze with the header visible.', 'error');
                    } else {
                        const board = normalizeProgramBoard(programBoardCandidate);
                        merged[programKind] = mergeProgramBoards(existing[programKind], board);
                        shouldUpsert = true;
                    }
                }

                if (shouldUpsert) {
                    const { error } = await supabase.from('karera_live_boards').upsert({
                        race_id: raceId,
                        data: merged,
                        updated_at: new Date().toISOString(),
                    });
                    if (error) throw error;
                }
            }

            // Update local UI state immediately
            const scratchedSet = new Set(scratched);
            const divMap = new Map(dividendsToApply.map((d) => [d.horse_number, d.amount]));
            setRaceHorses((prev) =>
                prev.map((h) => ({
                    ...h,
                    current_dividend: divMap.has(h.number) ? divMap.get(h.number) : h.current_dividend,
                    status: scratchedSet.has(h.number) ? 'scratched' : h.status,
                })),
            );

            showToast('Vision data applied. Users will see updates in Karera visuals.', 'success');
        } catch (err: any) {
            console.error(err);
            const msg = err?.message || 'Failed to apply vision data';
            setVisionError(msg);
            showToast(msg, 'error');
        } finally {
            setVisionApplying(false);
        }
    };

    const handleKareraSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const invalidProgramTypes = (kareraFormData.bet_types_available || [])
                .filter((t) => ['pick_4', 'pick_5', 'pick_6', 'wta'].includes(String(t)))
                .filter((t) => {
                    const required = PROGRAM_BET_LEGS[t as ProgramBetType];
                    return availableOpenLegsFromDraftRace < required;
                }) as ProgramBetType[];

            if (invalidProgramTypes.length > 0) {
                const first = invalidProgramTypes[0];
                const required = PROGRAM_BET_LEGS[first];
                throw new Error(
                    `${programBetLabel(first)} requires ${required} consecutive open races from this race onward.`,
                );
            }

            const trimmedTournamentId = String(kareraFormData.tournament_id || selectedKareraTournamentId || '').trim();
            let includeTournamentId = Boolean(trimmedTournamentId);
            let warnedMissingTournamentColumn = false;

            const buildRacePayload = (overrides?: Record<string, any>) => {
                const base: any = {
                    name: kareraFormData.name,
                    racing_time: new Date(kareraFormData.racing_time || Date.now()).toISOString(),
                    website_url: kareraFormData.website_url,
                    // Enforce unsupported bet types never get written back into the race row.
                    bet_types_available: (kareraFormData.bet_types_available || []).filter((t) => !['win', 'place'].includes(String(t))),
                    status: kareraFormData.status,
                    ...overrides,
                };

                if (includeTournamentId && trimmedTournamentId) {
                    base.tournament_id = trimmedTournamentId;
                }

                return base;
            };

            if (kareraFormData.is_batch && !editingKarera) {
                // HANDLE BATCH CREATION (Use generic logic provided before, keep simple count or implement template)
                // For batch, we will stick to the generic 'horse_count' for now as editing 10 sets of horses is UI heavy
                const baseTime = new Date(kareraFormData.racing_time || Date.now());
                const count = kareraFormData.batch_count;
                let createdCount = 0;

                for (let i = 0; i < count; i++) {
                    const raceTime = new Date(baseTime.getTime() + (i * 30 * 60000)); // +30 mins per race
                    const raceName = kareraFormData.name ? `${kareraFormData.name} ${i + 1}` : `Race ${i + 1}`;

                    const payload = buildRacePayload({
                        name: raceName,
                        racing_time: raceTime.toISOString(),
                    });

                    let { data: raceData, error: raceError } = await supabase.from('karera_races').insert(payload).select().single();
                    if (raceError && /column .*tournament_id.* does not exist/i.test(raceError.message || '')) {
                        // Allow legacy DBs to continue working before migration is applied.
                        includeTournamentId = false;
                        if (!warnedMissingTournamentColumn) {
                            warnedMissingTournamentColumn = true;
                            showToast('Missing DB column: run scripts/sql/karera_tournaments.sql in Supabase SQL Editor.', 'error');
                        }
                        const retryPayload: any = { ...payload };
                        delete retryPayload.tournament_id;
                        ({ data: raceData, error: raceError } = await supabase.from('karera_races').insert(retryPayload).select().single());
                    }
                    if (raceError) throw raceError;

                    // Create Horses (Generic)
                    const horses = Array.from({ length: kareraFormData.horse_count }, (_, j) => ({
                        race_id: raceData.id,
                        horse_number: j + 1,
                        horse_name: `Horse ${j + 1}`,
                        status: 'active',
                        current_dividend: 0
                    }));

                    const { error: horseError } = await supabase.from('karera_horses').insert(horses);
                    if (horseError) console.error("Error creating horses (non-critical):", horseError);

                    createdCount++;
                }
                showToast(`Successfully created ${createdCount} races in batch`, 'success');

            } else {
                // NORMAL SINGLE CREATE / UPDATE (Uses raceHorses state)
                const payload = buildRacePayload();

                if (editingKarera) {
                    // Update Race Info
                    let { error } = await supabase.from('karera_races').update(payload).eq('id', editingKarera.id);
                    if (error && /column .*tournament_id.* does not exist/i.test(error.message || '')) {
                        includeTournamentId = false;
                        if (!warnedMissingTournamentColumn) {
                            warnedMissingTournamentColumn = true;
                            showToast('Missing DB column: run scripts/sql/karera_tournaments.sql in Supabase SQL Editor.', 'error');
                        }
                        const retryPayload: any = { ...payload };
                        delete retryPayload.tournament_id;
                        ({ error } = await supabase.from('karera_races').update(retryPayload).eq('id', editingKarera.id));
                    }
                    if (error) throw error;

                    // Sync Horses (preserve scratches/dividends; avoid delete/insert resets)
                    const toDeleteIds = initialRaceHorseIds.filter((hid) => !raceHorses.some((h) => h.id === hid));
                    if (toDeleteIds.length > 0) {
                        const { error: delErr } = await supabase.from('karera_horses').delete().in('id', toDeleteIds);
                        if (delErr) throw delErr;
                    }

                    const existing = raceHorses.filter((h) => Boolean(h.id));
                    for (const h of existing) {
                        const { error: upErr } = await supabase
                            .from('karera_horses')
                            .update({
                                horse_number: h.number,
                                horse_name: h.name,
                                status: h.status,
                            })
                            .eq('id', h.id as string);
                        if (upErr) throw upErr;
                    }

                    const inserts = raceHorses.filter((h) => !h.id).map(h => ({
                        race_id: editingKarera.id,
                        horse_number: h.number,
                        horse_name: h.name,
                        status: h.status || 'active',
                        current_dividend: 0
                    }));
                    if (inserts.length > 0) {
                        const { error: insErr } = await supabase.from('karera_horses').insert(inserts);
                        if (insErr) throw insErr;
                    }

                    showToast('Race updated successfully', 'success');
                } else {
                    // Start New Race
                    let { data: raceData, error: raceError } = await supabase.from('karera_races').insert(payload).select().single();
                    if (raceError && /column .*tournament_id.* does not exist/i.test(raceError.message || '')) {
                        includeTournamentId = false;
                        if (!warnedMissingTournamentColumn) {
                            warnedMissingTournamentColumn = true;
                            showToast('Missing DB column: run scripts/sql/karera_tournaments.sql in Supabase SQL Editor.', 'error');
                        }
                        const retryPayload: any = { ...payload };
                        delete retryPayload.tournament_id;
                        ({ data: raceData, error: raceError } = await supabase.from('karera_races').insert(retryPayload).select().single());
                    }
                    if (raceError) throw raceError;

                    // Insert Horses from State
                    const horsesPayload = raceHorses.map(h => ({
                        race_id: raceData.id,
                        horse_number: h.number,
                        horse_name: h.name,
                        status: h.status || 'active',
                        current_dividend: 0
                    }));

                    if (horsesPayload.length > 0) {
                        const { error: horseError } = await supabase.from('karera_horses').insert(horsesPayload);
                        if (horseError) throw horseError;
                    }

                    showToast('Race and horses created successfully', 'success');
                }
            }
            setIsEventModalOpen(false);
            fetchKareraRaces();
        } catch (error: any) {
            showToast(error.message || 'Operation failed', 'error');
        }
    };

    // Separate function to handle the complex submit logic to keep code clean, 
    // but for now I will just strictly replace handleOpenKareraModal and add state as requested in this chunk
    // trusting the next step to fix submit.
    // actually, I can't leave handleKareraSubmit broken. 
    // Let's just add the state and header first.

    // ...

    const handleOpenKareraModal = async (race?: KareraRace) => {
        // Reset Vision UI state when switching races/modals
        setVisionImageDataUrl('');
        setVisionAnalysis(null);
        setVisionRaw('');
        setVisionError('');
        setVisionAnalyzing(false);
        setVisionApplying(false);

        if (race) {
            setEditingKarera(race);
            setKareraFormData({
                tournament_id: String(race.tournament_id || ''),
                name: race.name,
                racing_time: toLocalDatetimeInputValue(new Date(race.racing_time)),
                website_url: race.website_url || '',
                horse_count: 6, // Fallback
                bet_types_available: Array.from(
                    new Set(
                        (race.bet_types_available as string[])
                            .map(t => t === 'winner_take_all' ? 'wta' : t)
                            .filter((t) => !['win', 'place'].includes(String(t))),
                    ),
                ),
                status: race.status as any,
                is_batch: false,
                batch_count: 7
            });

            const msToStart = new Date(race.racing_time).getTime() - Date.now();
            const mins = Number.isFinite(msToStart) ? Math.max(0, Math.ceil(msToStart / 60000)) : 0;
            setKareraStartInMinutes(mins ? String(mins) : '');

            // Fetch Horses
            const { data: horses } = await supabase
                .from('karera_horses')
                .select('*')
                .eq('race_id', race.id)
                .order('horse_number');

            if (horses) {
                const list = horses as KareraHorse[];
                setRaceHorses(list.map(h => ({
                    id: h.id,
                    number: h.horse_number,
                    name: h.horse_name,
                    status: h.status === 'scratched' ? 'scratched' : 'active',
                    current_dividend: Number(h.current_dividend ?? 0),
                })));
                setInitialRaceHorseIds(list.map(h => h.id));
            } else {
                setRaceHorses([]);
                setInitialRaceHorseIds([]);
            }

        } else {
            setEditingKarera(null);
            setKareraFormData({
                tournament_id: String(selectedKareraTournamentId || ''),
                name: '',
                racing_time: '',
                website_url: '',
                horse_count: 6,
                bet_types_available: ['forecast', 'trifecta', 'quartet', 'daily_double'],
                status: 'open',
                is_batch: false, // Default to single
                batch_count: 7
            });
            setKareraStartInMinutes('');

            // Default 6 horses for new race
            setRaceHorses(Array.from({ length: 6 }, (_, i) => ({ number: i + 1, name: `Horse ${i + 1}`, status: 'active' as const })));
            setInitialRaceHorseIds([]);
        }
        setIsEventModalOpen(true);
    };

    const handleOpenAnnounceKarera = (race: KareraRace) => {
        setAnnounceKareraRace(race);
        setIsAnnounceKareraOpen(true);
    };

    const handleDeleteKareraRace = async (raceId: string) => {
        if (!confirm('Are you sure you want to delete this race? This will also delete its horses.')) return;

        try {
            const { error } = await supabase
                .from('karera_races')
                .delete()
                .eq('id', raceId);

            if (error) throw error;

            showToast('Race deleted successfully', 'success');
            fetchKareraRaces();
        } catch (error: any) {
            console.error('Failed to delete race:', error);
            const msg = error?.message || 'Failed to delete race';
            if (/violates foreign key constraint .*karera_bets_race_id_fkey/i.test(msg)) {
                const ok = confirm(
                    "This race already has bets and can't be deleted.\n\nDo you want to CANCEL the race instead?"
                );
                if (ok) {
                    try {
                        const { error: cancelErr } = await supabase.from('karera_races').update({ status: 'cancelled' }).eq('id', raceId);
                        if (cancelErr) throw cancelErr;
                        showToast('Race cancelled.', 'success');
                        fetchKareraRaces();
                        return;
                    } catch (e: any) {
                        showToast(e?.message || 'Failed to cancel race', 'error');
                        return;
                    }
                }
                showToast('Cannot delete race: there are bets placed on it.', 'error');
                return;
            }
            showToast(msg, 'error');
        }
    };

    const handleToggleKareraBetting = async (race: KareraRace) => {
        if (!race?.id) return;
        if (race.status === 'finished' || race.status === 'cancelled') return;

        const nextStatus = race.status === 'open' ? 'closed' : 'open';
        const ok = nextStatus === 'closed'
            ? confirm(`Close betting for "${race.name}"? Users will NOT be able to place bets anymore.`)
            : confirm(`Re-open betting for "${race.name}"? Users will be able to place bets again.`);
        if (!ok) return;

        try {
            const { error } = await supabase
                .from('karera_races')
                .update({ status: nextStatus })
                .eq('id', race.id);

            if (error) throw error;
            showToast(nextStatus === 'closed' ? 'Betting closed.' : 'Betting re-opened.', 'success');
            fetchKareraRaces();
        } catch (error: any) {
            console.error('Failed to update race status:', error);
            showToast(error?.message || 'Failed to update race status', 'error');
        }
    };

    const handleDeleteKareraTournament = async (tournamentId: string) => {
        if (!confirm('Are you sure you want to delete this tournament? This will UNLINK all races assigned to it.')) return;

        try {
            // Unlink races first (keeps races/bets history intact, just removes grouping)
            const { error: unlinkError } = await supabase
                .from('karera_races')
                .update({ tournament_id: null })
                .eq('tournament_id', tournamentId);

            if (unlinkError) throw unlinkError;

            const { error } = await supabase
                .from('karera_tournaments')
                .delete()
                .eq('id', tournamentId);

            if (error) throw error;

            showToast('Tournament deleted.', 'success');
            await fetchKareraTournaments();
            fetchKareraRaces();
        } catch (error: any) {
            console.error('Failed to delete tournament:', error);
            const msg = error?.message || 'Failed to delete tournament';
            if (/violates foreign key constraint/i.test(msg)) {
                showToast('Cannot delete tournament: races are still assigned to it.', 'error');
                return;
            }
            if (/column .*tournament_id.* does not exist/i.test(msg) || /relation .*karera_tournaments.* does not exist/i.test(msg)) {
                showToast('Missing DB migration: run scripts/sql/karera_tournaments.sql in Supabase SQL Editor.', 'error');
                return;
            }
            if (/relation .*karera_tournaments.* does not exist/i.test(msg)) {
                showToast('Missing DB table: run scripts/sql/karera_tournaments.sql in Supabase SQL Editor.', 'error');
                return;
            }
            showToast(msg, 'error');
        }
    };

    const toggleHorseScratch = async (horseIdx: number) => {
        const horse = raceHorses[horseIdx];
        if (!horse) return;

        const nextStatus: 'active' | 'scratched' = horse.status === 'scratched' ? 'active' : 'scratched';

        if (nextStatus === 'scratched') {
            const ok = confirm(
                `Scratch horse #${horse.number} (-S-)?\n\nThis will automatically refund ALL Karera bets that include this horse.`
            );
            if (!ok) return;
        }

        try {
            // If the horse already exists in DB (editing an existing race), update immediately so refunds trigger now.
            if (editingKarera && horse.id) {
                const { error } = await supabase
                    .from('karera_horses')
                    .update({ status: nextStatus })
                    .eq('id', horse.id);
                if (error) throw error;
            }

            setRaceHorses((prev) => {
                const next = [...prev];
                next[horseIdx] = { ...next[horseIdx], status: nextStatus };
                return next;
            });

            showToast(
                nextStatus === 'scratched'
                    ? 'Horse scratched (-S-). Refunds will be processed automatically.'
                    : 'Scratch removed.',
                'success'
            );
        } catch (error: any) {
            console.error('Failed to toggle scratch:', error);
            showToast(error.message || 'Failed to update scratch status', 'error');
        }
    };

    // --- SABONG HANDLERS ---

    const handleOpenEventModal = (event?: Event) => {
        if (event) {
            setEditingEvent(event);
            setEventFormData({
                name: event.name,
                banner_url: event.banner_url || '',
                stream_url: event.stream_url || '',
                stream_title: event.stream_title || '',
                status: event.status as any
            });
        } else {
            setEditingEvent(null);
            setEventFormData({
                name: '',
                banner_url: '',
                stream_url: '',
                stream_title: '',
                status: 'active'
            });
        }
        setIsEventModalOpen(true);
    };

    const handleEventSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingEvent) {
                const { error } = await supabase.from('events').update(eventFormData).eq('id', editingEvent.id);
                if (error) throw error;
                showToast('Event updated successfully', 'success');
            } else {
                const { error } = await supabase.from('events').insert(eventFormData);
                if (error) throw error;
                showToast('Event created successfully', 'success');
            }
            setIsEventModalOpen(false);
            fetchEventsAndMatches();
        } catch (error: any) {
            showToast(error.message || 'Operation failed', 'error');
        }
    };

    const handleDeleteEvent = async (id: string) => {
        if (!confirm('Are you sure you want to delete this event? This will UNLINK all associated matches.')) return;

        try {
            // 1. Unlink matches first (Set event_id to NULL)
            const { error: unlinkError } = await supabase
                .from('matches')
                .update({ event_id: null })
                .eq('event_id', id);

            if (unlinkError) throw unlinkError;

            // 2. Delete the event
            const { error } = await supabase
                .from('events')
                .delete()
                .eq('id', id);

            if (error) throw error;

            showToast('Event deleted successfully', 'success');
            fetchEventsAndMatches();
        } catch (error: any) {
            console.error("Delete error:", error);
            showToast('Failed to delete event: ' + error.message, 'error');
        }
    };

    const handleResetEvent = async (id: string) => {
        if (!confirm('Are you sure you want to RESET this event? This will DELETE ALL MATCH HISTORY and reset trends. This action cannot be undone.')) return;

        try {
            const { error } = await supabase
                .from('matches')
                .delete()
                .eq('event_id', id);

            if (error) throw error;

            showToast('Event matches reset successfully', 'success');
            fetchEventsAndMatches();
        } catch (error: any) {
            console.error("Reset error:", error);
            showToast('Failed to reset event: ' + error.message, 'error');
        }
    };

    // --- IMAGE UPLOAD ---
    const onDrop = async (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) return;

        setUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage.from('event-banners').upload(filePath, file);

            if (uploadError) {
                if (uploadError.message.includes("Bucket not found")) {
                    throw new Error("Storage bucket 'event-banners' not found.");
                }
                throw uploadError;
            }

            const { data } = supabase.storage.from('event-banners').getPublicUrl(filePath);
            setEventFormData(prev => ({ ...prev, banner_url: data.publicUrl }));
            showToast('Banner uploaded successfully!', 'success');
        } catch (error: any) {
            console.error('Upload error:', error);
            showToast(error.message || 'Failed to upload image', 'error');
        } finally {
            setUploading(false);
        }
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.gif'] },
        maxFiles: 1
    });

    const selectedKareraTournament = kareraTournaments.find((t) => t.id === selectedKareraTournamentId) || null;

    return (
        <div className="space-y-6 max-w-7xl mx-auto py-6 px-4 md:px-0">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-display font-black text-white tracking-tight flex items-center gap-3">
                        <Calendar className="text-casino-gold-400" />
                        Event Console
                    </h1>
                    <div className="flex gap-4 mt-4 bg-white/5 rounded-lg p-1 inline-flex">
                        <button
                            onClick={() => setActiveTab('sabong')}
                            className={clsx("px-4 py-2 rounded-md font-bold text-sm transition-all", activeTab === 'sabong' ? "bg-casino-gold-500 text-black shadow-lg" : "text-casino-slate-400 hover:text-white")}
                        >
                            SABONG
                        </button>
                        <button
                            onClick={() => setActiveTab('karera')}
                            className={clsx("px-4 py-2 rounded-md font-bold text-sm transition-all", activeTab === 'karera' ? "bg-casino-gold-500 text-black shadow-lg" : "text-casino-slate-400 hover:text-white")}
                        >
                            KARERA
                        </button>
                    </div>
                </div>
                <button
                    onClick={() => activeTab === 'sabong' ? handleOpenEventModal() : handleOpenKareraModal()}
                    className="btn-casino-primary py-3 px-6 rounded-xl flex items-center gap-2 transition-all active:scale-95 text-sm font-black uppercase tracking-wider"
                >
                    <Plus size={18} />
                    New {activeTab === 'sabong' ? 'Event' : 'Race'}
                </button>
            </div>

            {activeTab === 'karera' ? (
                <div className="space-y-6">
                    <div className="glass-panel p-6 rounded-2xl border border-white/5">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            <div className="min-w-0">
                                <h2 className="text-white font-black uppercase tracking-widest text-sm">Karera Tournament</h2>
                                <p className="text-xs text-casino-slate-500 mt-1">
                                    Create a tournament day (banner), then create races under that tournament.
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingKareraTournament(null);
                                        setIsKareraTournamentModalOpen(true);
                                    }}
                                    className="px-5 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 bg-casino-gold-500 text-black hover:bg-casino-gold-400"
                                >
                                    New Tournament
                                </button>

                                {selectedKareraTournament ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingKareraTournament(selectedKareraTournament);
                                            setIsKareraTournamentModalOpen(true);
                                        }}
                                        className="px-5 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 bg-white/5 text-white hover:bg-white/10 border border-white/10"
                                    >
                                        Edit
                                    </button>
                                ) : null}

                                {selectedKareraTournament ? (
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteKareraTournament(selectedKareraTournament.id)}
                                        className="px-5 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 bg-red-500/10 text-red-300 hover:bg-red-500/15 border border-red-500/20"
                                    >
                                        Delete
                                    </button>
                                ) : null}
                            </div>
                        </div>

                        <div className="mt-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <div className="lg:col-span-2">
                                <label className="text-[10px] font-black text-casino-slate-400 uppercase tracking-[0.2em] ml-1">
                                    Selected Tournament
                                </label>
                                <select
                                    value={selectedKareraTournamentId}
                                    onChange={(e) => setSelectedKareraTournamentId(e.target.value)}
                                    disabled={kareraTournamentsLoading}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-casino-gold-400 outline-none transition-all disabled:opacity-60"
                                >
                                    <option value="">{kareraTournamentsLoading ? 'Loading...' : 'Select tournament...'}</option>
                                    {kareraTournaments.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name} ({t.tournament_date})
                                        </option>
                                    ))}
                                </select>
                                <div className="text-[10px] text-casino-slate-600 mt-1 ml-1">
                                    Races created/edited will be grouped under this tournament.
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/5 bg-black/20 overflow-hidden">
                                {selectedKareraTournament?.banner_url ? (
                                    <img
                                        src={selectedKareraTournament.banner_url}
                                        alt="Tournament banner"
                                        className="w-full h-28 object-cover"
                                    />
                                ) : (
                                    <div className="h-28 flex items-center justify-center text-[10px] text-casino-slate-600 uppercase tracking-widest font-black">
                                        No Banner
                                    </div>
                                )}
                                <div className="p-3">
                                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-casino-slate-500">
                                        {selectedKareraTournament ? selectedKareraTournament.status : 'No tournament selected'}
                                    </div>
                                    <div className="text-xs text-white font-black truncate mt-1">
                                        {selectedKareraTournament ? selectedKareraTournament.name : 'Create a tournament first'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="glass-panel p-6 rounded-2xl border border-white/5">
                        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                            <div className="min-w-0">
                                <h2 className="text-white font-black uppercase tracking-widest text-sm">Karera Lobby</h2>
                                <p className="text-xs text-casino-slate-500 mt-1">
                                    Toggle OFFLINE to hide the schedule from users and show the &quot;No schedule for today&quot; notice on <span className="font-mono">/karera</span>.
                                </p>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                                <button
                                    type="button"
                                    onClick={handleToggleKareraLobbyOffline}
                                    disabled={kareraLobbySettingsLoading || kareraLobbySettingsSaving}
                                    role="switch"
                                    aria-checked={kareraLobbyOffline}
                                    className={clsx(
                                        'w-full sm:w-auto px-4 py-3 rounded-2xl border transition-all active:scale-95 flex items-center justify-between gap-4',
                                        kareraLobbyOffline
                                            ? 'bg-red-500/10 border-red-500/20 hover:bg-red-500/15'
                                            : 'bg-green-500/10 border-green-500/20 hover:bg-green-500/15',
                                        (kareraLobbySettingsLoading || kareraLobbySettingsSaving) && 'opacity-60 cursor-not-allowed'
                                    )}
                                    title="Toggle Karera Offline/Online for users"
                                >
                                    <div className="text-left">
                                        <div className={clsx('text-[10px] font-black uppercase tracking-[0.2em]', kareraLobbyOffline ? 'text-red-400' : 'text-green-400')}>
                                            {kareraLobbyOffline ? 'OFFLINE' : 'ONLINE'}
                                        </div>
                                        <div className="text-xs font-bold text-white/80">
                                            {kareraLobbyOffline ? 'Users see offline notice' : 'Users see race schedule'}
                                        </div>
                                    </div>
                                    <div className={clsx('w-12 h-7 rounded-full p-1 transition-colors', kareraLobbyOffline ? 'bg-red-500/60' : 'bg-white/10')}>
                                        <div className={clsx('w-5 h-5 bg-white rounded-full transition-transform', kareraLobbyOffline ? 'translate-x-5' : 'translate-x-0')} />
                                    </div>
                                </button>

                                <div className="flex-1 sm:w-80">
                                    <label className="text-[10px] font-black text-casino-slate-400 uppercase tracking-[0.2em] ml-1">
                                        Next Race Will Be
                                    </label>
                                    <input
                                        value={kareraLobbyNextRace}
                                        onChange={(e) => setKareraLobbyNextRace(e.target.value)}
                                        disabled={kareraLobbySettingsLoading || kareraLobbySettingsSaving}
                                        placeholder="e.g. Feb 10, 2026 7:00 PM"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-casino-gold-400 outline-none transition-all"
                                    />
                                    <div className="text-[10px] text-casino-slate-600 mt-1 ml-1">
                                        Displayed only when OFFLINE.
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleSaveKareraLobbyNextRace}
                                    disabled={kareraLobbySettingsLoading || kareraLobbySettingsSaving}
                                    className={clsx(
                                        'px-5 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95',
                                        kareraLobbySettingsLoading || kareraLobbySettingsSaving
                                            ? 'bg-white/5 text-casino-slate-600 cursor-not-allowed'
                                            : 'bg-casino-gold-500 text-black hover:bg-casino-gold-400'
                                    )}
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="glass-panel p-6 rounded-2xl border border-white/5">
                        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                            <div className="min-w-0">
                                <h2 className="text-white font-black uppercase tracking-widest text-sm">Karera Promo Betting</h2>
                                <p className="text-xs text-casino-slate-500 mt-1">
                                    Adds a stake bonus to every Karera bet when enabled. Users pay the same amount, but payouts are computed using the boosted stake.
                                </p>
                            </div>

                            <div className="flex flex-col lg:flex-row gap-3 w-full lg:w-auto">
                                <button
                                    type="button"
                                    onClick={handleToggleKareraPromoEnabled}
                                    disabled={kareraLobbySettingsLoading || kareraLobbySettingsSaving}
                                    role="switch"
                                    aria-checked={kareraPromoEnabled}
                                    className={clsx(
                                        'w-full lg:w-auto px-4 py-3 rounded-2xl border transition-all active:scale-95 flex items-center justify-between gap-4',
                                        kareraPromoEnabled
                                            ? 'bg-red-500/10 border-red-500/20 hover:bg-red-500/15'
                                            : 'bg-white/5 border-white/10 hover:bg-white/10',
                                        (kareraLobbySettingsLoading || kareraLobbySettingsSaving) && 'opacity-60 cursor-not-allowed'
                                    )}
                                    title="Toggle Karera promo on/off"
                                >
                                    <div className="text-left">
                                        <div className={clsx('text-[10px] font-black uppercase tracking-[0.2em]', kareraPromoEnabled ? 'text-red-400' : 'text-casino-slate-400')}>
                                            {kareraPromoEnabled ? 'PROMO ON' : 'PROMO OFF'}
                                        </div>
                                        <div className="text-xs font-bold text-white/80">
                                            {kareraPromoEnabled ? 'Bonus stake is applied' : 'No bonus stake'}
                                        </div>
                                    </div>
                                    <div className={clsx('w-12 h-7 rounded-full p-1 transition-colors', kareraPromoEnabled ? 'bg-red-500/60' : 'bg-white/10')}>
                                        <div className={clsx('w-5 h-5 bg-white rounded-full transition-transform', kareraPromoEnabled ? 'translate-x-5' : 'translate-x-0')} />
                                    </div>
                                </button>

                                <div className="flex-1 sm:w-36">
                                    <label className="text-[10px] font-black text-casino-slate-400 uppercase tracking-[0.2em] ml-1">
                                        Promo %
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        value={kareraPromoPercent}
                                        onChange={(e) => setKareraPromoPercent(e.target.value)}
                                        disabled={kareraLobbySettingsLoading || kareraLobbySettingsSaving}
                                        placeholder="10"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-casino-gold-400 outline-none transition-all"
                                    />
                                    <div className="text-[10px] text-casino-slate-600 mt-1 ml-1">
                                        Example: 10 = +10%
                                    </div>
                                </div>

                                <div className="flex-1 sm:w-96">
                                    <label className="text-[10px] font-black text-casino-slate-400 uppercase tracking-[0.2em] ml-1">
                                        Banner Text
                                    </label>
                                    <input
                                        value={kareraPromoBannerText}
                                        onChange={(e) => setKareraPromoBannerText(e.target.value)}
                                        disabled={kareraLobbySettingsLoading || kareraLobbySettingsSaving}
                                        placeholder="BOOKIS +{percent}% PER BET"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-casino-gold-400 outline-none transition-all"
                                    />
                                    <div className="text-[10px] text-casino-slate-600 mt-1 ml-1">
                                        Supports <span className="font-mono">{'{percent}'}</span> placeholder.
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleSaveKareraPromo}
                                    disabled={kareraLobbySettingsLoading || kareraLobbySettingsSaving}
                                    className={clsx(
                                        'px-5 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95',
                                        kareraLobbySettingsLoading || kareraLobbySettingsSaving
                                            ? 'bg-white/5 text-casino-slate-600 cursor-not-allowed'
                                            : 'bg-casino-gold-500 text-black hover:bg-casino-gold-400'
                                    )}
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {kareraRaces.map((race) => {
                            const msToStart = new Date(race.racing_time).getTime() - nowMs;
                            const isLastCall = race.status === 'open' && msToStart > 0 && msToStart <= 5 * 60 * 1000;

                            const statusClass =
                                race.status === 'open'
                                    ? 'bg-green-500/20 text-green-400'
                                    : race.status === 'closed'
                                        ? 'bg-yellow-500/20 text-yellow-400'
                                        : race.status === 'finished'
                                            ? 'bg-blue-500/20 text-blue-300'
                                            : 'bg-red-500/20 text-red-400';

                            return (
                                <div
                                    key={race.id}
                                    className="glass-panel p-6 rounded-xl border border-white/5 hover:border-casino-gold-500/50 transition-all group relative"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <h3 className="font-bold text-xl text-white">{race.name}</h3>
                                        <div className={clsx('px-2 py-1 rounded text-xs font-bold uppercase', statusClass)}>
                                            {race.status}
                                        </div>
                                    </div>

                                    <div className="text-sm text-casino-slate-400 mb-4 space-y-1">
                                        <div className="flex items-center gap-2">
                                            <Calendar size={14} />
                                            <span>{new Date(race.racing_time).toLocaleString()}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Clock size={14} />
                                            {Number.isFinite(msToStart) && msToStart > 0 ? (
                                                <>
                                                    <span className="font-mono text-casino-gold-400">{formatCountdown(msToStart)} to start</span>
                                                    {isLastCall ? (
                                                        <span className="ml-1 px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/20 text-[10px] font-black uppercase tracking-widest animate-pulse">
                                                            LAST CALL
                                                        </span>
                                                    ) : null}
                                                </>
                                            ) : (
                                                <span className="font-mono text-red-300">Post time reached</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Swords size={14} />
                                            <span>{race.bet_types_available.length} Bet Types</span>
                                        </div>
                                        <div className="flex items-center gap-2 truncate">
                                            <Tv size={14} />
                                            <span className="truncate">{race.website_url || 'No URL'}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <button
                                            onClick={() => handleOpenAnnounceKarera(race)}
                                            disabled={race.status === 'finished' || race.status === 'cancelled'}
                                            className={clsx(
                                                "w-full py-2 rounded-lg text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all",
                                                race.status === 'finished' || race.status === 'cancelled'
                                                    ? "bg-white/5 text-casino-slate-600 cursor-not-allowed"
                                                    : "bg-casino-gold-500/15 hover:bg-casino-gold-500/25 text-casino-gold-400 border border-casino-gold-500/20"
                                            )}
                                            title={race.status === 'finished' || race.status === 'cancelled' ? 'Race already ended' : 'Announce winner and settle bets'}
                                        >
                                            <Megaphone size={14} />
                                            Announce Winner
                                        </button>

                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleToggleKareraBetting(race)}
                                                disabled={race.status === 'finished' || race.status === 'cancelled'}
                                                className={clsx(
                                                    'flex-1 py-2 rounded-lg text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all',
                                                    race.status === 'finished' || race.status === 'cancelled'
                                                        ? 'bg-white/5 text-casino-slate-600 cursor-not-allowed'
                                                        : race.status === 'open'
                                                            ? 'bg-red-500/10 text-red-300 hover:bg-red-500/15 border border-red-500/20'
                                                            : 'bg-green-500/10 text-green-300 hover:bg-green-500/15 border border-green-500/20'
                                                )}
                                                title={race.status === 'open' ? 'Close betting (stop accepting bets)' : 'Re-open betting (allow bets again)'}
                                            >
                                                {race.status === 'open' ? <Lock size={14} /> : <Unlock size={14} />}
                                                {race.status === 'open' ? 'Close Bet' : 'Open Bet'}
                                            </button>
                                            <button
                                                onClick={() => handleOpenKareraModal(race)}
                                                className="flex-1 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-bold text-white"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDeleteKareraRace(race.id)}
                                                className="p-2 bg-white/5 hover:bg-red-500/20 hover:text-red-500 rounded-lg text-casino-slate-400 transition-colors"
                                                title="Delete Race"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            {activeTab === 'sabong' && (
                <>
                    {loading ? (
                        <div className="text-center py-20 text-white/50 animate-pulse">Loading events...</div>
                    ) : events.length === 0 ? (
                        <div className="text-center py-20 bg-white/5 rounded-2xl border border-white/10">
                            <Trophy className="w-16 h-16 text-white/20 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-white">No Events Found</h3>
                            <p className="text-white/50 mt-2">Create your first event to get started.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {events.map((event) => {
                                const latestMatch = event.matches?.[0];

                                return (
                                    <div key={event.id} className="glass-panel group relative overflow-hidden rounded-2xl border border-white/10 hover:border-casino-gold-400/50 transition-all flex flex-col">
                                        {/* Banner Base */}
                                        <div className="h-40 bg-black/50 relative">
                                            {event.banner_url ? (
                                                <img src={event.banner_url} alt={event.name} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-all" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-900 to-black">
                                                    <Trophy className="text-white/10 w-12 h-12" />
                                                </div>
                                            )}
                                            <div className="absolute top-4 right-4">
                                                <span className={clsx(
                                                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                                                    event.status === 'active' ? "bg-green-500/20 text-green-400 border-green-500/30" :
                                                        event.status === 'upcoming' ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
                                                            "bg-neutral-500/20 text-neutral-400 border-neutral-500/30"
                                                )}>
                                                    {event.status}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="p-6 flex-1 flex flex-col">
                                            <h3 className="text-xl font-black text-white uppercase tracking-tight mb-2 truncate">{event.name}</h3>

                                            {/* Match Status Section */}
                                            <div className="mb-6 bg-black/20 rounded-xl p-4 border border-white/5 flex-1">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-[10px] font-bold text-casino-slate-500 uppercase tracking-widest">Current Match</span>
                                                    {latestMatch && (
                                                        <span className={clsx(
                                                            "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded",
                                                            latestMatch.status === 'finished' ? "bg-neutral-700 text-neutral-400" : "bg-green-500/20 text-green-400"
                                                        )}>
                                                            {latestMatch.status}
                                                        </span>
                                                    )}
                                                </div>

                                                {latestMatch ? (
                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-white font-bold">{latestMatch.fight_id || `Match #${latestMatch.id.slice(0, 4)}`}</span>
                                                            {latestMatch.status === 'finished' && latestMatch.winner && (
                                                                <span className={clsx(
                                                                    "text-xs font-black uppercase",
                                                                    latestMatch.winner === 'meron' ? "text-red-500" : latestMatch.winner === 'wala' ? "text-blue-500" : "text-white"
                                                                )}>
                                                                    {latestMatch.winner} Wins
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-casino-slate-400 flex justify-between">
                                                            <span>{latestMatch.meron_name || 'MERON'}</span>
                                                            <span>vs</span>
                                                            <span>{latestMatch.wala_name || 'WALA'}</span>
                                                        </div>

                                                        {/* POOL TOTALS ROW */}
                                                        <div className="pt-3 flex gap-2 border-t border-white/5 mt-2">
                                                            <div className="flex-1 text-center">
                                                                <div className="text-[8px] font-bold text-red-500 uppercase tracking-tighter">Meron</div>
                                                                <div className="text-xs font-black text-white">₱{(latestMatch.meron_total || 0).toLocaleString()}</div>
                                                            </div>
                                                            <div className="flex-1 text-center border-x border-white/5">
                                                                <div className="text-[8px] font-bold text-green-500 uppercase tracking-tighter">Draw</div>
                                                                <div className="text-xs font-black text-white">₱{(latestMatch.draw_total || 0).toLocaleString()}</div>
                                                            </div>
                                                            <div className="flex-1 text-center">
                                                                <div className="text-[8px] font-bold text-blue-500 uppercase tracking-tighter">Wala</div>
                                                                <div className="text-xs font-black text-white">₱{(latestMatch.wala_total || 0).toLocaleString()}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="text-center py-4 text-xs text-casino-slate-500 italic">
                                                        No matches recorded.
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex gap-2 pt-2 border-t border-white/10">
                                                {/* Action Buttons */}
                                                <button
                                                    onClick={() => navigate(`/events/${event.id}`)}
                                                    className="flex-1 py-3 bg-casino-gold-600 hover:bg-casino-gold-500 text-black rounded-xl font-black uppercase tracking-wider text-xs shadow-lg shadow-yellow-900/20 transition-all flex items-center justify-center gap-2 active:scale-95"
                                                >
                                                    <Swords size={14} />
                                                    Manage Arena
                                                </button>

                                                <button
                                                    onClick={() => handleResetEvent(event.id)}
                                                    className="p-3 bg-white/5 hover:bg-yellow-500/20 hover:text-yellow-500 rounded-xl text-casino-slate-400 transition-colors"
                                                    title="Reset Match History"
                                                >
                                                    <RotateCcw size={16} />
                                                </button>

                                                <button
                                                    onClick={() => handleOpenEventModal(event)}
                                                    className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-white transition-colors"
                                                    title="Edit Event"
                                                >
                                                    <Edit2 size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteEvent(event.id)}
                                                    className="p-3 bg-white/5 hover:bg-red-500/20 hover:text-red-500 rounded-xl text-casino-slate-400 transition-colors"
                                                    title="Delete Event"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {isEventModalOpen && activeTab === 'karera' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-neutral-900 w-full max-w-lg md:max-w-5xl rounded-3xl border border-white/10 p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-6 flex items-center gap-3">
                            {editingKarera ? <Edit2 className="text-casino-gold-400" /> : <Plus className="text-casino-gold-400" />}
                            {editingKarera ? 'Edit Race' : 'Create Race'}
                        </h2>

                        <form onSubmit={handleKareraSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                            {!editingKarera && (
                                <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={kareraFormData.is_batch}
                                            onChange={(e) => setKareraFormData({ ...kareraFormData, is_batch: e.target.checked })}
                                            className="w-5 h-5 accent-casino-gold-500 rounded focus:ring-casino-gold-500 focus:ring-offset-0 bg-black/40 border-white/20"
                                        />
                                        <span className="text-sm font-bold text-white uppercase tracking-wider">Batch Create Races</span>
                                    </label>
                                    {kareraFormData.is_batch && (
                                        <p className="text-xs text-casino-slate-400 mt-2 ml-8">
                                            Create multiple consecutive races. Start time will increment by 30 minutes for each race.
                                        </p>
                                    )}
                                </div>
                            )}

                            <div>
                                <label className="text-xs font-bold text-casino-slate-400 uppercase">Tournament Day</label>
                                <select
                                    value={kareraFormData.tournament_id}
                                    onChange={(e) => setKareraFormData({ ...kareraFormData, tournament_id: e.target.value })}
                                    disabled={kareraTournamentsLoading}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-casino-gold-400 outline-none transition-all disabled:opacity-60"
                                >
                                    <option value="">{kareraTournamentsLoading ? 'Loading...' : 'Select tournament...'}</option>
                                    {kareraTournaments.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name} ({t.tournament_date})
                                        </option>
                                    ))}
                                </select>
                                {kareraTournaments.length === 0 ? (
                                    <div className="text-[10px] text-casino-slate-500 mt-1">
                                        No tournaments found. Create one in the "Karera Tournament" section above.
                                    </div>
                                ) : null}
                            </div>

                            {kareraFormData.is_batch ? (
                                <div className="space-y-5">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-bold text-casino-slate-400 uppercase">Number of Races</label>
                                            <input
                                                type="number"
                                                min="2"
                                                max="15"
                                                value={kareraFormData.batch_count}
                                                onChange={e => setKareraFormData({ ...kareraFormData, batch_count: parseInt(e.target.value) })}
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-casino-slate-400 uppercase">Start Time (Race 1)</label>
                                            <input
                                                type="datetime-local"
                                                value={kareraFormData.racing_time.slice(0, 16)}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setKareraFormData({ ...kareraFormData, racing_time: v });
                                                    const ms = new Date(v).getTime() - Date.now();
                                                    const mins = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 60000)) : 0;
                                                    setKareraStartInMinutes(mins ? String(mins) : '');
                                                }}
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-casino-slate-400 uppercase">Start In (Minutes)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={kareraStartInMinutes}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setKareraStartInMinutes(v);
                                                const mins = parseInt(v || '', 10);
                                                if (!Number.isFinite(mins) || mins < 0) return;
                                                const d = new Date(Date.now() + (mins * 60 * 1000));
                                                setKareraFormData({ ...kareraFormData, racing_time: toLocalDatetimeInputValue(d) });
                                            }}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white"
                                            placeholder="e.g. 30"
                                        />
                                        <div className="text-[10px] text-casino-slate-600 mt-1">
                                            Quick set: updates Start Time (Race 1) relative to now.
                                        </div>
                                    </div>

                                    {/* Schedule Preview */}
                                    {kareraFormData.racing_time && (
                                        <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                                            <label className="text-xs font-bold text-casino-slate-500 uppercase block mb-2">Schedule Preview</label>
                                            <div className="flex flex-wrap gap-2">
                                                {Array.from({ length: Math.min(kareraFormData.batch_count, 15) }).map((_, i) => {
                                                    const baseTime = new Date(kareraFormData.racing_time);
                                                    const raceTime = new Date(baseTime.getTime() + (i * 30 * 60000));
                                                    return (
                                                        <span key={i} className="text-[10px] font-mono bg-white/5 border border-white/10 px-2 py-1 rounded text-casino-gold-400">
                                                            R{i + 1}: {raceTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                    <div>
                                        <label className="text-xs font-bold text-casino-slate-400 uppercase">Naming Format</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Metro Turf - Race"
                                            value={kareraFormData.name}
                                            onChange={e => setKareraFormData({ ...kareraFormData, name: e.target.value })}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white"
                                        />
                                        <p className="text-[10px] text-casino-slate-500 mt-1">Races will be named "Format #1", "Format #2", etc.</p>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <label className="text-xs font-bold text-casino-slate-400 uppercase">Race Name</label>
                                        <input required type="text" value={kareraFormData.name} onChange={e => setKareraFormData({ ...kareraFormData, name: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white" />
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-casino-slate-400 uppercase">Racing Time</label>
                                        <input
                                            type="datetime-local"
                                            value={kareraFormData.racing_time.slice(0, 16)}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setKareraFormData({ ...kareraFormData, racing_time: v });
                                                const ms = new Date(v).getTime() - Date.now();
                                                const mins = Number.isFinite(ms) ? Math.max(0, Math.ceil(ms / 60000)) : 0;
                                                setKareraStartInMinutes(mins ? String(mins) : '');
                                            }}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-casino-slate-400 uppercase">Start In (Minutes)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={kareraStartInMinutes}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                setKareraStartInMinutes(v);
                                                const mins = parseInt(v || '', 10);
                                                if (!Number.isFinite(mins) || mins < 0) return;
                                                const d = new Date(Date.now() + (mins * 60 * 1000));
                                                setKareraFormData({ ...kareraFormData, racing_time: toLocalDatetimeInputValue(d) });
                                            }}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white"
                                            placeholder="e.g. 30"
                                        />
                                        <div className="text-[10px] text-casino-slate-600 mt-1">
                                            Quick set: updates Racing Time relative to now.
                                        </div>
                                    </div>
                                </>
                            )}


                            <div>
                                <label className="text-xs font-bold text-casino-slate-400 uppercase">Website URL (for AI Vision)</label>
                                <input type="url" value={kareraFormData.website_url} onChange={e => setKareraFormData({ ...kareraFormData, website_url: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white" />
                            </div>

                            {editingKarera && (
                                <div className="space-y-3 bg-black/20 p-4 rounded-xl border border-white/5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold text-casino-slate-400 uppercase flex items-center gap-2">
                                            <Sparkles size={14} className="text-casino-gold-400" />
                                            AI Vision Image (Live Race Data)
                                        </label>
                                        <span className="text-[10px] text-casino-slate-500 uppercase">Updates user visuals after apply</span>
                                    </div>

                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => handleSelectVisionImage(e.target.files?.[0] || null)}
                                        className="w-full text-xs text-casino-slate-300 file:bg-white/10 file:text-white file:border-0 file:rounded-lg file:px-3 file:py-2 file:font-bold file:uppercase file:tracking-wider file:mr-3 file:hover:bg-white/15"
                                    />

                                    {visionImageDataUrl && (
                                        <div className="rounded-xl overflow-hidden border border-white/10 bg-black/40">
                                            <img src={visionImageDataUrl} alt="Vision upload preview" className="w-full max-h-[220px] object-contain" />
                                        </div>
                                    )}

                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={handleAnalyzeVisionImage}
                                            disabled={visionAnalyzing || !visionImageDataUrl}
                                            className={clsx(
                                                "flex-1 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                                                visionAnalyzing || !visionImageDataUrl
                                                    ? "bg-white/5 text-white/30 cursor-not-allowed"
                                                    : "bg-casino-gold-600 hover:bg-casino-gold-500 text-black"
                                            )}
                                        >
                                            {visionAnalyzing ? 'Analyzing...' : 'Analyze Image'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleApplyVisionToRace}
                                            disabled={visionApplying || !visionAnalysis}
                                            className={clsx(
                                                "flex-1 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                                                visionApplying || !visionAnalysis
                                                    ? "bg-white/5 text-white/30 cursor-not-allowed"
                                                    : "bg-green-600 hover:bg-green-500 text-black"
                                            )}
                                        >
                                            {visionApplying ? 'Applying...' : 'Apply to Race'}
                                        </button>
                                    </div>

                                    {visionError && (
                                        <div className="text-xs text-red-300 bg-red-900/10 border border-red-500/20 rounded-lg p-2">
                                            {visionError}
                                        </div>
                                    )}

                                    {visionAnalysis && (
                                        <div className="bg-black/30 border border-white/10 rounded-lg p-3 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <div className="text-[10px] font-bold uppercase tracking-widest text-casino-slate-500">
                                                    Extracted Preview
                                                </div>
                                                 <div className="text-[10px] text-casino-slate-500 font-mono">
                                                    kind: {String((visionAnalysis as any).matrix_kind || 'unknown')} -{' '}
                                                    {Array.isArray((visionAnalysis as any).dividends) ? (visionAnalysis as any).dividends.length : 0} div -{' '}
                                                    {Array.isArray((visionAnalysis as any).scratched) ? (visionAnalysis as any).scratched.length : 0} scratched -{' '}
                                                    {(visionAnalysis as any).live_board ? 'matrix' : 'no matrix'} -{' '}
                                                    {(visionAnalysis as any).program_board ? 'program' : 'no program'}
                                                 </div>
                                             </div>

                                            {Array.isArray((visionAnalysis as any).scratched) && (visionAnalysis as any).scratched.length > 0 && (
                                                <div className="text-xs text-red-200/90">
                                                    Scratched: {(visionAnalysis as any).scratched.join(', ')}
                                                </div>
                                            )}

                                             {(visionAnalysis as any).live_board &&
                                                 (() => {
                                                     const lb: any = (visionAnalysis as any).live_board;
                                                     const cells: any[] = Array.isArray(lb?.cells) ? lb.cells : [];
                                                     const maxRow = cells.reduce((m, c) => Math.max(m, Number(c?.i || 0)), 0);
                                                     const maxCol = cells.reduce((m, c) => Math.max(m, Number(c?.j || 0)), 0);
                                                     const pool = coerceNumber(lb?.pool_gross) ?? 0;
                                                     return (
                                                         <div className="text-[10px] text-casino-slate-400 font-mono">
                                                             Pool: P{pool.toLocaleString()} - cells: {cells.length} - size: {maxRow}x{maxCol}
                                                         </div>
                                                     );
                                                 })()}

                                            {(visionAnalysis as any).program_board &&
                                                (() => {
                                                    const pb: any = (visionAnalysis as any).program_board;
                                                    const entries: any[] = Array.isArray(pb?.entries) ? pb.entries : [];
                                                    const pool = coerceNumber(pb?.pool_gross) ?? 0;
                                                    const spread = coerceNumber(pb?.spread);
                                                    const mtr = coerceNumber(pb?.mtr);
                                                    return (
                                                        <div className="text-[10px] text-casino-slate-400 font-mono">
                                                            Program: P{pool.toLocaleString()} - entries: {entries.length}
                                                            {spread !== null && spread > 0 ? ` - spread: ${Math.trunc(spread)}` : ''}
                                                            {mtr !== null && mtr > 0 ? ` - mtr: ${Math.trunc(mtr)}` : ''}
                                                        </div>
                                                    );
                                                })()}

                                            {Array.isArray((visionAnalysis as any).dividends) && (visionAnalysis as any).dividends.length > 0 && (
                                                <div className="max-h-[140px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr className="text-[10px] text-casino-slate-500 uppercase">
                                                                <th className="text-left py-1">#</th>
                                                                <th className="text-right py-1">Dividend</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-white/5">
                                                            {(visionAnalysis as any).dividends
                                                                .slice(0, 20)
                                                                .sort((a: any, b: any) => Number(a?.horse_number || 0) - Number(b?.horse_number || 0))
                                                                .map((d: any, idx: number) => (
                                                                    <tr key={idx}>
                                                                        <td className="py-1 text-white font-bold">{d?.horse_number}</td>
                                                                        <td className="py-1 text-right font-mono text-casino-gold-400">{d?.amount}</td>
                                                                    </tr>
                                                                ))}
                                                        </tbody>
                                                    </table>
                                                    {(visionAnalysis as any).dividends.length > 20 && (
                                                        <div className="text-[10px] text-casino-slate-500 mt-1 italic">
                                                            Showing first 20 results...
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {visionRaw && (
                                        <details className="bg-black/30 border border-white/10 rounded-lg p-3">
                                            <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-casino-slate-500">
                                                Raw AI Output
                                            </summary>
                                            <pre className="mt-2 whitespace-pre-wrap break-words text-[10px] text-casino-slate-300 font-mono max-h-[200px] overflow-auto scrollbar-thin scrollbar-thumb-white/10">
                                                {visionRaw}
                                            </pre>
                                        </details>
                                    )}
                                </div>
                            )}

                            {!kareraFormData.is_batch && (
                                <div className="space-y-3 bg-black/20 p-4 rounded-xl border border-white/5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-bold text-casino-slate-400 uppercase">Race Entrants</label>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const nextNum = raceHorses.length + 1;
                                                setRaceHorses([...raceHorses, { number: nextNum, name: `Horse ${nextNum}`, status: 'active' }]);
                                            }}
                                            className="text-[10px] font-bold uppercase bg-white/10 hover:bg-white/20 px-2 py-1 rounded text-white transition-colors"
                                        >
                                            + Add Horse
                                        </button>
                                    </div>

                                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10">
                                        {raceHorses.map((horse, idx) => (
                                            <div key={idx} className="flex gap-2 items-center">
                                                <div className="w-12">
                                                    <input
                                                        type="number"
                                                        value={horse.number}
                                                        onChange={(e) => {
                                                            const newHorses = [...raceHorses];
                                                            newHorses[idx].number = parseInt(e.target.value);
                                                            setRaceHorses(newHorses);
                                                        }}
                                                        className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-center text-white text-sm font-bold"
                                                    />
                                                </div>
                                                <div className="flex-1">
                                                    <input
                                                        type="text"
                                                        value={horse.name}
                                                        onChange={(e) => {
                                                            const newHorses = [...raceHorses];
                                                            newHorses[idx].name = e.target.value;
                                                            setRaceHorses(newHorses);
                                                        }}
                                                        className={clsx(
                                                            "w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm",
                                                            horse.status === 'scratched' ? "text-red-300 line-through" : "text-white"
                                                        )}
                                                        placeholder="Horse Name"
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleHorseScratch(idx)}
                                                    className={clsx(
                                                        "px-2 py-2 rounded-lg text-[10px] font-black uppercase border transition-colors",
                                                        horse.status === 'scratched'
                                                            ? "bg-red-500/20 text-red-300 border-red-500/30 hover:bg-red-500/25"
                                                            : "bg-white/5 text-white/70 border-white/10 hover:bg-red-500/10 hover:text-red-200 hover:border-red-500/30"
                                                    )}
                                                    title={horse.status === 'scratched' ? 'Scratched (-S-) (click to unscratch)' : 'Mark as Scratch (-S-)'}>
                                                    {horse.status === 'scratched' ? '-S-' : 'Scratch'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const newHorses = raceHorses.filter((_, i) => i !== idx);
                                                        setRaceHorses(newHorses);
                                                    }}
                                                    className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                        {raceHorses.length === 0 && (
                                            <div className="text-center py-4 text-xs text-casino-slate-500 italic">
                                                No horses added. Click "Add Horse" to begin.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {kareraFormData.is_batch && (
                                <div>
                                    <label className="text-xs font-bold text-casino-slate-400 uppercase">Number of Horses (per race)</label>
                                    <input type="number" min="2" max="20" value={kareraFormData.horse_count} onChange={e => setKareraFormData({ ...kareraFormData, horse_count: parseInt(e.target.value) })} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white" />
                                </div>
                            )}

                            <div>
                                <label className="text-xs font-bold text-casino-slate-400 uppercase mb-2 block">Bet Types</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {availableBetTypes.map(type => (
                                        <label
                                            key={type}
                                            className={clsx(
                                                "flex items-center gap-2 p-2 rounded transition-colors",
                                                (() => {
                                                    const checked = kareraFormData.bet_types_available.includes(type);
                                                    const required = PROGRAM_BET_LEGS[type as ProgramBetType];
                                                    const blocked = Boolean(required) && !checked && availableOpenLegsFromDraftRace < required;
                                                    if (blocked) return "bg-white/5 opacity-60 cursor-not-allowed";
                                                    return "bg-white/5 cursor-pointer hover:bg-white/10";
                                                })()
                                            )}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={kareraFormData.bet_types_available.includes(type)}
                                                onChange={(e) => {
                                                    const required = PROGRAM_BET_LEGS[type as ProgramBetType];
                                                    if (e.target.checked && required && availableOpenLegsFromDraftRace < required) {
                                                        showToast(
                                                            `${programBetLabel(type as ProgramBetType)} needs ${required} consecutive open races from this race onward.`,
                                                            'error'
                                                        );
                                                        return;
                                                    }
                                                    const newTypes = e.target.checked
                                                        ? [...kareraFormData.bet_types_available, type]
                                                        : kareraFormData.bet_types_available.filter(t => t !== type);
                                                    setKareraFormData({ ...kareraFormData, bet_types_available: newTypes });
                                                }}
                                                className="accent-casino-gold-500"
                                            />
                                            <span className="text-xs uppercase font-bold text-white">{type.replace(/_/g, ' ')}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4 lg:col-span-2">
                                <button type="button" onClick={() => setIsEventModalOpen(false)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold">Cancel</button>
                                <button type="submit" className="flex-1 py-3 bg-casino-gold-600 hover:bg-casino-gold-500 text-black rounded-xl font-black uppercase tracking-widest">
                                    {editingKarera ? 'Save' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <KareraAnnounceWinnerModal
                race={announceKareraRace}
                isOpen={isAnnounceKareraOpen}
                onClose={() => {
                    setIsAnnounceKareraOpen(false);
                    setAnnounceKareraRace(null);
                }}
                onSuccess={() => fetchKareraRaces()}
            />

            <KareraTournamentModal
                tournament={editingKareraTournament}
                isOpen={isKareraTournamentModalOpen}
                onClose={() => {
                    setIsKareraTournamentModalOpen(false);
                    setEditingKareraTournament(null);
                }}
                onSuccess={(t) => {
                    fetchKareraTournaments();
                    if (t?.id) {
                        setSelectedKareraTournamentId(t.id);
                        setKareraFormData((prev) => ({ ...prev, tournament_id: t.id }));
                    }
                }}
            />

            {isEventModalOpen && activeTab === 'sabong' && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-neutral-900 w-full max-w-lg rounded-3xl border border-white/10 p-8 shadow-2xl relative">
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-6 flex items-center gap-3">
                            {editingEvent ? <Edit2 className="text-casino-gold-400" /> : <Plus className="text-casino-gold-400" />}
                            {editingEvent ? 'Edit Event' : 'Create Event'}
                        </h2>

                        <form onSubmit={handleEventSubmit} className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-xs font-black text-casino-slate-400 uppercase tracking-widest ml-1">Event Name</label>
                                <input
                                    type="text"
                                    required
                                    value={eventFormData.name}
                                    onChange={e => setEventFormData({ ...eventFormData, name: e.target.value })}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-casino-gold-400 outline-none transition-all"
                                    placeholder="e.g. SUMMER DERBY 2026"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-casino-slate-400 uppercase tracking-widest ml-1">Status</label>
                                    <select
                                        value={eventFormData.status}
                                        onChange={e => setEventFormData({ ...eventFormData, status: e.target.value as any })}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-casino-gold-400 outline-none transition-all"
                                    >
                                        <option value="active">Active</option>
                                        <option value="upcoming">Upcoming</option>
                                        <option value="hidden">Hidden</option>
                                        <option value="ended">Ended</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-casino-slate-400 uppercase tracking-widest ml-1">Stream Title</label>
                                    <input
                                        type="text"
                                        value={eventFormData.stream_title}
                                        onChange={e => setEventFormData({ ...eventFormData, stream_title: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-casino-gold-400 outline-none transition-all"
                                        placeholder="Display Title"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-black text-casino-slate-400 uppercase tracking-widest ml-1">Stream URL</label>
                                <input
                                    type="text"
                                    value={eventFormData.stream_url}
                                    onChange={e => setEventFormData({ ...eventFormData, stream_url: e.target.value })}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-casino-gold-400 outline-none transition-all"
                                    placeholder="e.g. YouTube, Facebook Link, or .m3u8"
                                />
                            </div>

                            <div className="space-y-4">
                                <label className="text-xs font-black text-casino-slate-400 uppercase tracking-widest ml-1">Banner Image</label>
                                <div
                                    {...getRootProps()}
                                    className={clsx(
                                        "relative w-full aspect-[2/1] rounded-xl overflow-hidden border-2 border-dashed transition-all cursor-pointer group",
                                        isDragActive ? "border-casino-gold-400 bg-casino-gold-400/10" : "border-white/10 bg-black/50 hover:border-casino-gold-400/50"
                                    )}
                                >
                                    <input {...getInputProps()} />
                                    {eventFormData.banner_url ? (
                                        <>
                                            <img
                                                src={eventFormData.banner_url}
                                                alt="Banner Preview"
                                                className="w-full h-full object-cover"
                                            />
                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <div className="text-center">
                                                    <Upload className="w-8 h-8 text-white mx-auto mb-2" />
                                                    <span className="text-xs font-bold text-white uppercase tracking-wider">Change Image</span>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/30 gap-3 p-6 text-center">
                                            {uploading ? <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-casino-gold-400" /> : <Upload size={20} />}
                                            <p className="text-xs font-bold text-white uppercase tracking-wider">{isDragActive ? "Drop image here" : "Drag & Drop or Click"}</p>
                                        </div>
                                    )}
                                </div>
                                {/* URL Input Fallback */}
                                <div className="relative">
                                    <input
                                        type="url"
                                        value={eventFormData.banner_url}
                                        onChange={e => setEventFormData({ ...eventFormData, banner_url: e.target.value })}
                                        placeholder="Or image URL..."
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs text-white"
                                    />
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button type="button" onClick={() => setIsEventModalOpen(false)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold transition-all">Cancel</button>
                                <button type="submit" className="flex-1 py-3 bg-casino-gold-600 hover:bg-casino-gold-500 text-black rounded-xl font-black uppercase tracking-widest transition-all">
                                    {editingEvent ? 'Save Changes' : 'Create Event'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* STREAM PREVIEW MODAL */}
            {
                viewingStreamEvent && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4">
                        <div className="w-full max-w-5xl space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                                        <Tv className="text-casino-gold-400" />
                                        {viewingStreamEvent.name}
                                    </h2>
                                    <p className="text-white/50 text-sm">Live Stream Preview</p>
                                </div>
                                <button
                                    onClick={() => setViewingStreamEvent(null)}
                                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-bold uppercase tracking-wider transition-all"
                                >
                                    Close Preview
                                </button>
                            </div>

                            <div className="aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                                <LiveStreamPlayer
                                    videoOrSignedId={viewingStreamEvent.stream_url || ''}
                                    videoTitle={viewingStreamEvent.stream_title || viewingStreamEvent.name}
                                    autoplay={true}
                                    muted={false}
                                />
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};
