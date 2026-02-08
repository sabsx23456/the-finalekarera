import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Match, MatchStatus, MatchWinner } from '../../types';
import { Swords, Plus, Trophy, Lock, PlayCircle, AlertCircle, Trash2 } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { LiveStreamPlayer } from '../../components/LiveStreamPlayer';
import clsx from 'clsx';

export const BettingAdminPage = ({
    forcedEventId,
    streamUrl,
    streamTitle
}: {
    forcedEventId?: string;
    streamUrl?: string;
    streamTitle?: string;
}) => {
    const [matches, setMatches] = useState<Match[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const { showToast } = useToast();

    // Form State
    const [meronName, setMeronName] = useState('');
    const [walaName, setWalaName] = useState('');
    const [fightId, setFightId] = useState('');
    const [selectedEventId, setSelectedEventId] = useState<string>(forcedEventId || '');
    const [events, setEvents] = useState<any[]>([]);
    const [filterEventId, setFilterEventId] = useState<string>(forcedEventId || 'all');

    // AUTOMATION STATE
    const [meronTarget, setMeronTarget] = useState(0);
    const [walaTarget, setWalaTarget] = useState(0);
    const [isAutoCounterOn, setIsAutoCounterOn] = useState(false);
    const [isStreamEnabled, setIsStreamEnabled] = useState(true);

    useEffect(() => {
        if (forcedEventId) {
            setFilterEventId(forcedEventId);
            setSelectedEventId(forcedEventId);
        }
    }, [forcedEventId]);

    // AUTOMATION LOOP
    useEffect(() => {
        const interval = setInterval(async () => {
            // Filter eligible matches for injection
            const activeMatches = matches.filter(m =>
                (m.status === 'open' || m.status === 'last_call') &&
                ((m.meron_injection_target && m.meron_injection_target > 0) || (m.wala_injection_target && m.wala_injection_target > 0))
            );

            if (activeMatches.length === 0) return;

            for (const match of activeMatches) {
                // Get current INJECTED totals (Isolation from User/Counter bets)
                const currentMeron = match.meron_injected || 0;
                const currentWala = match.wala_injected || 0;
                const meronTarget = match.meron_injection_target || 0;
                const walaTarget = match.wala_injection_target || 0;

                const meronNeeded = Math.max(0, meronTarget - currentMeron);
                const walaNeeded = Math.max(0, walaTarget - currentWala);

                if (meronNeeded === 0 && walaNeeded === 0) continue;

                // Determine logic based on status
                const isFast = match.status === 'last_call';
                // Fast mode (Last Call): Run almost every tick (750ms), larger amounts. 
                // Slow mode (Open): Run with lower probability (e.g., 30% chance per second), smaller amounts.

                const shouldInject = isFast ? true : Math.random() < 0.3;
                if (!shouldInject) continue;

                // CHASING LOGIC (0.5% Constraint during Last Call)
                let blockMeron = false;
                let blockWala = false;

                if (isFast && currentMeron > 0 && currentWala > 0) {
                    const diff = Math.abs(currentMeron - currentWala);
                    const avg = (currentMeron + currentWala) / 2;
                    const diffPercent = diff / avg; // approx

                    // If gap is > 0.5%, slow down the leader
                    if (diffPercent > 0.005) {
                        if (currentMeron > currentWala) blockMeron = true; // Meron too far ahead
                        else blockWala = true; // Wala too far ahead
                    }
                }

                const maxChunk = isFast ? 5000 : 800;
                const minChunk = isFast ? 500 : 100;

                // INJECT MERON
                if (meronNeeded > 0 && !blockMeron) {
                    const amount = Math.min(meronNeeded, Math.floor(Math.random() * (maxChunk - minChunk + 1)) + minChunk);
                    if (amount > 0) {
                        // Uses place_bot_bet RPC which creates a bet record.
                        await supabase.rpc('place_bot_bet', {
                            p_match_id: match.id,
                            p_selection: 'meron',
                            p_amount: amount,
                            p_source: 'injection'
                        });
                    }
                }

                // INJECT WALA
                if (walaNeeded > 0 && !blockWala) {
                    const amount = Math.min(walaNeeded, Math.floor(Math.random() * (maxChunk - minChunk + 1)) + minChunk);
                    if (amount > 0) {
                        await supabase.rpc('place_bot_bet', {
                            p_match_id: match.id,
                            p_selection: 'wala',
                            p_amount: amount,
                            p_source: 'injection'
                        });
                    }
                }
                // --- AUTO-COUNTER LOGIC REMOVED (Handled by Server Trigger 'handle_auto_counter_bot') ---
            }
            // Fetch updated totals after injection
            fetchMatches(); // Need to fetch matches to get updated INJECTED columns

        }, 750); // 1.3x faster (approx 750ms)

        return () => clearInterval(interval);
    }, [matches]);

    useEffect(() => {
        fetchMatches();
        fetchEvents();

        // Check for URL Query Param for Event Filter (Only if not forced)
        if (!forcedEventId) {
            const searchParams = new URLSearchParams(window.location.search);
            const urlEventId = searchParams.get('event_id');
            if (urlEventId) {
                setFilterEventId(urlEventId);
            }
        }

        // Realtime subscription for matches
        const matchesChannel = supabase
            .channel('matches_updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
                fetchMatches();
            })
            .subscribe();

        // LISTEN TO USER BETS FOR AUTO-COUNTER (Defensive Mode)
        // We do this client-side to support the requested 1-2s Delay
        const betsChannel = supabase
            .channel('bets_monitor')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bets' }, async (payload) => {
                const newBet = payload.new as any;

                // Ignore Bot bets
                if (newBet.is_bot) return;

                // Find associated match (we rely on local state 'matches' which might be slightly stale, 
                // but maintain_mode status is usually stable for the match duration)
                // To be safe, we fetch the match status or check the local cache
                // Accessing 'matches' state inside useEffect callback is tricky due to closures.
                // We will use a ref or just fetch the single match status to be sure.

                const { data: matchData } = await supabase.from('matches').select('is_maintain_mode, status').eq('id', newBet.match_id).single();

                if (matchData && matchData.is_maintain_mode && (matchData.status === 'open' || matchData.status === 'last_call')) {
                    // SCHEDULE COUNTER BET (1-2s Delay)
                    const delayMs = Math.floor(Math.random() * 1000) + 1000; // 1000ms - 2000ms

                    console.log(`[Auto-Counter] Detected User Bet ${newBet.amount} on ${newBet.selection}. Countering in ${delayMs}ms...`);

                    setTimeout(async () => {
                        // Calculate Counter Amount (40-70%)
                        // We counter strictly based on THIS bet to react to "new player bets"
                        const counterAmount = Math.floor(newBet.amount * (0.4 + Math.random() * 0.3));
                        const counterSide = newBet.selection === 'meron' ? 'wala' : 'meron';

                        if (counterAmount > 0) {
                            await supabase.rpc('place_bot_bet', {
                                p_match_id: newBet.match_id,
                                p_selection: counterSide,
                                p_amount: counterAmount,
                                p_source: 'auto_counter'
                            });
                        }
                    }, delayMs);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(matchesChannel);
            supabase.removeChannel(betsChannel);
        };
    }, []);

    const fetchEvents = async () => {
        const { data } = await supabase.from('events').select('id, name, status').order('created_at', { ascending: false });
        if (data) {
            setEvents(data);
            // Default to first active event if available and filter is 'all'
            const active = data.find((e: any) => e.status === 'active');
            if (active && filterEventId === 'all') {
                // setFilterEventId(active.id); // Optional: Auto-select active event
            }
        }
    };

    const fetchMatches = async () => {
        const { data, error } = await supabase
            .from('matches')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) console.error("Error fetching matches:", error);
        if (data) {
            setMatches(data as Match[]);
            // We don't need fetchBetTotals anymore as we trust the triggers on matches table now
        }
        setLoading(false);
    };

    const handleCreateMatch = async (e: React.FormEvent) => {
        e.preventDefault();
        // Check for existing active match for this event
        const activeMatch = matches.find(m =>
            m.event_id === selectedEventId &&
            ['open', 'ongoing', 'last_call', 'closed'].includes(m.status)
        );

        if (activeMatch) {
            showToast('This event already has an active or open match. Finish it first.', 'error');
            return;
        }

        const { data, error } = await supabase.from('matches').insert({
            meron_name: meronName || 'MERON',
            wala_name: walaName || 'WALA',
            fight_id: fightId || null,
            event_id: selectedEventId || null,
            status: 'open',
            meron_injection_target: meronTarget,
            wala_injection_target: walaTarget,
            is_maintain_mode: isAutoCounterOn
        })
            .select()
            .single();

        if (error) {
            alert('Error creating match: ' + error.message);
        } else if (data) {
            setIsCreateModalOpen(false);
            setMeronName('');
            setWalaName('');
            setFightId('');
            // Reset automation fields
            setMeronTarget(0);
            setWalaTarget(0);
            setIsAutoCounterOn(false);

            // OPTIMISTIC UPDATE: Prepend new match and remove any stale ones if necessary
            // Also force fetchMatches to be safe
            setMatches([data as Match, ...matches]);
            fetchMatches();
            showToast('Match created successfully!', 'success');
        }
    };

    const updateMatchStatus = async (id: string, status: MatchStatus) => {
        const { error } = await supabase
            .from('matches')
            .update({ status })
            .eq('id', id);

        if (error) alert('Error updating status: ' + error.message);
    };

    const deleteMatch = async (id: string) => {
        if (!confirm('Are you sure you want to delete this match? This will only work if there are no bets.')) return;

        const { error } = await supabase
            .from('matches')
            .delete()
            .eq('id', id);

        if (error) alert('Error deleting match: ' + error.message + ' (Note: Matches with bets cannot be deleted)');
    };

    const cancelMatch = async (matchId: string) => {
        if (!confirm('Are you sure you want to CANCEL this match? This will REFUND all bets.')) return;

        try {
            const { error } = await supabase.rpc('cancel_match', { match_id_input: matchId });
            if (error) throw error;
            showToast('Match cancelled and bets refunded successfully.', 'success');
        } catch (error: any) {
            console.error('Error cancelling match:', JSON.stringify(error, null, 2));
            showToast(error.message || 'Failed to cancel match', 'error');
        }
    };

    const declareWinner = async (id: string, winner: MatchWinner) => {
        if (!confirm(`Are you sure you want to declare ${winner?.toUpperCase()} as the winner? This will trigger payouts.`)) return;

        const { error } = await supabase
            .from('matches')
            .update({
                status: 'finished',
                winner: winner
            })
            .eq('id', id);

        if (error) alert('Error declaring winner: ' + error.message);
    };

    // BOT LOGIC
    const toggleMaintainMode = async (matchId: string, active: boolean) => {
        const { error } = await supabase
            .from('matches')
            .update({ is_maintain_mode: active })
            .eq('id', matchId);

        if (error) showToast('Failed to toggle maintain mode: ' + error.message, 'error');
        else {
            showToast(`Anti-Player Bot ${active ? 'Enabled' : 'Disabled'}`, 'success');
            // Optimistic update
            setMatches(prev => prev.map(m => m.id === matchId ? { ...m, is_maintain_mode: active } : m));
        }
    };

    const injectPool = async (matchId: string, side: 'meron' | 'wala' | 'draw', totalAmount: number, durationSec: number) => {
        if (totalAmount <= 0) return;

        // 1. If immediate (0 sec), just send one chunk
        if (durationSec <= 0) {
            const { data, error } = await supabase.rpc('place_bot_bet', {
                p_match_id: matchId,
                p_selection: side,
                p_amount: totalAmount,
                p_source: 'injection'
            });

            if (error) {
                console.error("RPC Error (Immediate):", error);
                showToast('Injection failed: ' + error.message, 'error');
                return;
            }
            // Check custom JSON response
            if (data && data.success === false) {
                showToast('Injection rejected: ' + (data.error || 'Unknown error'), 'error');
                return;
            }

            showToast(`Injected ₱${totalAmount.toLocaleString()} to ${side.toUpperCase()}`, 'success');
            return;
        }

        // 2. Distributed Injection
        showToast(`Starting injection of ₱${totalAmount.toLocaleString()} over ${durationSec}s...`, 'info');

        const steps = durationSec * 2; // 2 updates per second
        const amountPerStep = totalAmount / steps;
        let currentStep = 0;

        const interval = setInterval(async () => {
            currentStep++;
            if (currentStep > steps) {
                clearInterval(interval);
                showToast('Injection complete.', 'success');
                return;
            }

            // Fire and forget individual bet chunks, but log errors if any
            // Fire and forget individual bet chunks, but log errors if any
            const { data, error } = await supabase.rpc('place_bot_bet', {
                p_match_id: matchId,
                p_selection: side,
                p_amount: Math.floor(amountPerStep),
                p_source: 'injection'
            });

            if (error) {
                console.error("Injection step failed (Network/RPC):", error);
            } else if (data && data.success === false) {
                console.error("Injection step rejected (Logic):", data.error);
                // Optional: Show toast on first error only to avoid spam
                if (currentStep === 1) showToast('Injection Error: ' + data.error, 'error');
            }

        }, 500); // 500ms
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* --- LEFT COLUMN: STREAM & BOTS (5 COLS) --- */}
            <div className="xl:col-span-5 space-y-6 flex flex-col">

                {/* 1. Live Stream Player */}
                <div className="flex justify-end px-2 mb-2">
                    <button
                        onClick={() => setIsStreamEnabled(!isStreamEnabled)}
                        className={clsx(
                            "text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border transition-all",
                            isStreamEnabled
                                ? "bg-green-500/20 text-green-500 border-green-500/30"
                                : "bg-red-500/20 text-red-500 border-red-500/30"
                        )}
                    >
                        Stream: {isStreamEnabled ? 'ON' : 'OFF'}
                    </button>
                </div>

                {isStreamEnabled && streamUrl ? (
                    <div className="bg-black/40 border border-white/5 rounded-3xl overflow-hidden shadow-2xl aspect-video">
                        <LiveStreamPlayer
                            videoOrSignedId={streamUrl}
                            title={streamTitle || 'Live Stream'}
                            autoplay={false}
                            muted={true}
                        />
                    </div>
                ) : (
                    <div className="bg-neutral-900 border border-white/5 rounded-3xl aspect-video flex flex-col items-center justify-center text-white/20 p-6 text-center">
                        <PlayCircle size={48} className="mb-4" />
                        <h3 className="font-bold">{!isStreamEnabled ? 'Stream Paused' : 'No Stream Available'}</h3>
                        <p className="text-sm">
                            {!isStreamEnabled
                                ? 'Enable stream to view live feed.'
                                : 'Configure a stream URL in event settings.'}
                        </p>
                    </div>
                )}

                {/* 2. BOT CONSOLE (Moved here) */}
                <BotConsole
                    matches={matches.filter(m => filterEventId === 'all' || m.event_id === filterEventId)}
                    onInject={(matchId, side, amount, duration) => injectPool(matchId, side, amount, duration)}
                    onToggleMaintain={(matchId, active) => toggleMaintainMode(matchId, active)}
                />
            </div>

            {/* --- RIGHT COLUMN: MATCHES & CREATION (7 COLS) --- */}
            <div className="xl:col-span-7 space-y-6">
                <div className="flex justify-between items-center bg-neutral-900/50 p-4 rounded-2xl border border-white/5">
                    <h1 className="text-xl font-bold text-white flex items-center gap-3">
                        <Swords className="w-6 h-6 text-red-500" />
                        Betting Console
                    </h1>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold text-sm transition-colors shadow-lg shadow-red-900/20"
                        >
                            <Plus className="w-4 h-4" />
                            Create Match
                        </button>
                    </div>
                </div>

                {/* EVENT FILTER (Hidden if forced) */}
                {!forcedEventId && (
                    <div className="flex items-center gap-4 bg-neutral-900/50 p-4 rounded-xl border border-white/5">
                        <Trophy className="text-casino-gold-400 w-5 h-5" />
                        <span className="text-sm font-bold text-neutral-400 uppercase tracking-wider">Filter by:</span>
                        <select
                            value={filterEventId}
                            onChange={(e) => setFilterEventId(e.target.value)}
                            className="bg-neutral-800 text-white border border-white/10 rounded-lg px-4 py-2 outline-none focus:border-casino-gold-400 text-sm w-full"
                        >
                            <option value="all">All Events</option>
                            {events.map((ev: any) => (
                                <option key={ev.id} value={ev.id}>{ev.name} ({ev.status})</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Match List */}
                <div className="grid gap-6">
                    {loading ? (
                        <div className="text-center text-neutral-500 py-10">Loading matches...</div>
                    ) : matches.length === 0 ? (
                        <div className="text-center text-neutral-500 py-10 bg-neutral-800 rounded-xl border border-neutral-700">
                            No matches found. Create one to start.
                        </div>
                    ) : (
                        matches
                            .filter(m => filterEventId === 'all' || m.event_id === filterEventId)
                            .map(match => (
                                <div key={match.id} className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden shadow-lg">
                                    {/* Match Header with Deletion */}
                                    <div className="bg-neutral-900/50 px-6 py-2 border-b border-neutral-700 flex justify-between items-center">
                                        <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-[0.2em]">
                                            {match.fight_id ? `Fight ID: ${match.fight_id}` : `Match ID: ${match.id.slice(0, 8)}`}
                                        </span>
                                        {/* Show Targets if Active */}
                                        {match.status !== 'finished' && match.status !== 'cancelled' && (match.meron_injection_target || 0) > 0 && (
                                            <span className="text-[10px] text-purple-400 font-mono hidden md:inline-block">
                                                Bot Targets: M={match.meron_injection_target} | W={match.wala_injection_target}
                                            </span>
                                        )}
                                        {match.status === 'open' && (match.meron_total || 0) === 0 && (match.wala_total || 0) === 0 && (match.draw_total || 0) === 0 && (
                                            <button onClick={() => deleteMatch(match.id)} className="text-neutral-600 hover:text-red-500 transition-colors">
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>

                                    <div className="p-6">
                                        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                                            {/* Teams with Totals */}
                                            <div className="flex items-center gap-12 w-full md:w-auto justify-center">
                                                <div className="text-center group/stats relative">
                                                    <h3 className="text-red-500 font-bold text-sm uppercase tracking-wider">Meron</h3>
                                                    <p className="text-white text-xl font-black mt-1">{match.meron_name}</p>

                                                    {/* TOTAL WAGER */}
                                                    <div className="mt-2 text-xl font-display font-bold text-red-400">
                                                        ₱ {(match.meron_total || 0).toLocaleString()}
                                                    </div>

                                                    {/* BREAKDOWN */}
                                                    <div className="flex flex-col gap-0.5 mt-1 text-[10px] uppercase font-bold tracking-wider opacity-80">
                                                        <div className="text-purple-400" title="Injection Water">
                                                            💧 ₱ {(match.meron_injected || 0).toLocaleString()}
                                                        </div>
                                                        <div className="text-blue-300" title="Auto-CounterBot">
                                                            🤖 ₱ {(match.meron_auto_counter || 0).toLocaleString()}
                                                        </div>
                                                        <div className="text-green-400" title="Real Players">
                                                            👤 ₱ {((match.meron_total || 0) - (match.meron_injected || 0) - (match.meron_auto_counter || 0)).toLocaleString()}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="text-neutral-500 font-bold text-sm">VS</div>

                                                    {/* DRAW POOL DISPLAY */}
                                                    <div className="flex flex-col items-center gap-0.5 bg-green-500/5 px-4 py-2 rounded-xl border border-green-500/10 min-w-[120px]">
                                                        <span className="text-[10px] text-green-500 uppercase font-black tracking-widest">Draw Pool</span>
                                                        <div className="text-white font-black text-lg font-mono">
                                                            ₱ {(match.draw_total || 0).toLocaleString()}
                                                        </div>
                                                        <div className="flex gap-2 text-[9px] uppercase font-bold tracking-tight opacity-70">
                                                            <div className="text-purple-400" title="Injected">
                                                                💧 {(match.draw_injected || 0).toLocaleString()}
                                                            </div>
                                                            <div className="text-green-400" title="Real Players">
                                                                👤 {((match.draw_total || 0) - (match.draw_injected || 0) - (match.draw_auto_counter || 0)).toLocaleString()}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* PROFIT DISPLAY (House Income) */}
                                                    <div className="flex flex-col items-center gap-1 bg-neutral-900/80 px-3 py-2 rounded border border-white/5 w-full">
                                                        <span className="text-[10px] text-neutral-400 uppercase font-black tracking-widest">Est. Income</span>
                                                        <div className="text-casino-gold-400 font-black text-sm">
                                                            ₱ {Math.floor(
                                                                (((match.meron_total || 0) - (match.meron_injected || 0) - (match.meron_auto_counter || 0)) +
                                                                    ((match.wala_total || 0) - (match.wala_injected || 0) - (match.wala_auto_counter || 0)) +
                                                                    ((match.draw_total || 0) - (match.draw_injected || 0) - (match.draw_auto_counter || 0))) * 0.05
                                                            ).toLocaleString()}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="text-center group/stats relative">
                                                    <h3 className="text-blue-500 font-bold text-sm uppercase tracking-wider">Wala</h3>
                                                    <p className="text-white text-xl font-black mt-1">{match.wala_name}</p>

                                                    {/* TOTAL WAGER */}
                                                    <div className="mt-2 text-xl font-display font-bold text-blue-400">
                                                        ₱ {(match.wala_total || 0).toLocaleString()}
                                                    </div>

                                                    {/* BREAKDOWN */}
                                                    <div className="flex flex-col gap-0.5 mt-1 text-[10px] uppercase font-bold tracking-wider opacity-80">
                                                        <div className="text-purple-400" title="Injection Water">
                                                            💧 ₱ {(match.wala_injected || 0).toLocaleString()}
                                                        </div>
                                                        <div className="text-blue-300" title="Auto-CounterBot">
                                                            🤖 ₱ {(match.wala_auto_counter || 0).toLocaleString()}
                                                        </div>
                                                        <div className="text-green-400" title="Real Players">
                                                            👤 ₱ {((match.wala_total || 0) - (match.wala_injected || 0) - (match.wala_auto_counter || 0)).toLocaleString()}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Status & Controls */}
                                            <div className="flex flex-col items-center md:items-end gap-3 w-full md:w-auto">
                                                <div className="flex items-center gap-2">
                                                    <span className={clsx(
                                                        "px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest",
                                                        match.status === 'open' ? "bg-green-500/20 text-green-500 border border-green-500/30" :
                                                            match.status === 'closed' ? "bg-red-500/20 text-red-500 border border-red-500/30" :
                                                                match.status === 'ongoing' ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 animate-pulse" :
                                                                    match.status === 'last_call' ? "bg-orange-500/20 text-orange-500 border border-orange-500/30 animate-pulse" :
                                                                        "bg-neutral-600 text-neutral-300 border border-neutral-500/30"
                                                    )}>
                                                        {match.status === 'last_call' ? 'LAST CALL' : match.status}
                                                    </span>
                                                </div>

                                                {/* Control Buttons */}
                                                <div className="flex gap-2 flex-wrap justify-center md:justify-end mt-2">
                                                    {match.status === 'open' && (
                                                        <>
                                                            <button onClick={() => updateMatchStatus(match.id, 'last_call')} className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm flex items-center gap-2 font-bold transition-all animate-pulse">
                                                                <AlertCircle className="w-4 h-4" /> LAST CALL
                                                            </button>
                                                            <button onClick={() => updateMatchStatus(match.id, 'closed')} className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-sm flex items-center gap-2 font-bold transition-all">
                                                                <Lock className="w-4 h-4" /> Close Bets
                                                            </button>
                                                            <button onClick={() => updateMatchStatus(match.id, 'ongoing')} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm flex items-center gap-2 font-bold shadow-lg transition-all">
                                                                <PlayCircle className="w-4 h-4" /> Start Fight
                                                            </button>
                                                        </>
                                                    )}
                                                    {match.status === 'last_call' && (
                                                        <>
                                                            <button onClick={() => updateMatchStatus(match.id, 'closed')} className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg text-sm flex items-center gap-2 font-bold transition-all">
                                                                <Lock className="w-4 h-4" /> Close Bets
                                                            </button>
                                                        </>
                                                    )}
                                                    {match.status === 'closed' && (
                                                        <>
                                                            <button onClick={() => updateMatchStatus(match.id, 'ongoing')} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm flex items-center gap-2 font-bold shadow-lg transition-all">
                                                                <PlayCircle className="w-4 h-4" /> Start Fight
                                                            </button>
                                                            <button onClick={() => updateMatchStatus(match.id, 'open')} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold shadow-lg transition-all">
                                                                Re-open Betting
                                                            </button>
                                                        </>
                                                    )}
                                                    {match.status === 'ongoing' && (
                                                        <div className="flex flex-col items-center md:items-end gap-2">
                                                            <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Declare Winner:</span>
                                                            <div className="flex gap-2">
                                                                <button onClick={() => declareWinner(match.id, 'meron')} className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-black shadow-lg shadow-red-900/20 transition-all">MERON</button>
                                                                <button onClick={() => declareWinner(match.id, 'wala')} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-black shadow-lg shadow-blue-900/20 transition-all">WALA</button>
                                                                <button onClick={() => declareWinner(match.id, 'draw')} className="px-5 py-2 bg-neutral-600 hover:bg-neutral-700 text-white rounded-lg text-sm font-black transition-all">DRAW</button>
                                                            </div>
                                                            <button onClick={() => cancelMatch(match.id)} className="text-[10px] text-neutral-500 hover:text-red-500 uppercase font-bold mt-1 flex items-center gap-1">
                                                                <AlertCircle size={10} /> Cancel Match
                                                            </button>
                                                        </div>
                                                    )}
                                                    {/* GLOBAL CANCEL MATCH BUTTON (Available in all active states) */}
                                                    {['open', 'last_call', 'closed', 'ongoing'].includes(match.status) && (
                                                        <div className={clsx("w-full flex justify-end mt-2", match.status === 'ongoing' ? "hidden" : "")}>
                                                            {/* Hidden for ongoing because it's already inside the declaration block below, avoiding duplicate buttons */}
                                                            <button onClick={() => cancelMatch(match.id)} className="text-[10px] text-neutral-500 hover:text-red-500 uppercase font-bold flex items-center gap-1 transition-colors">
                                                                <AlertCircle size={10} /> Cancel Match
                                                            </button>
                                                        </div>
                                                    )}

                                                    {match.status === 'finished' && (
                                                        <div className="flex items-center gap-3 bg-yellow-400/10 px-4 py-2 rounded-xl border border-yellow-400/20">
                                                            <Trophy className="w-5 h-5 text-yellow-400" />
                                                            <span className="text-yellow-400 font-black uppercase tracking-widest">Winner: {match.winner}</span>
                                                        </div>
                                                    )}
                                                    {match.status === 'cancelled' && (
                                                        <div className="flex items-center gap-2 text-neutral-500 font-bold uppercase text-xs">
                                                            <AlertCircle className="w-4 h-4" />
                                                            Refunds Processed
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                    )}
                </div>

                {/* Create Modal */}
                {isCreateModalOpen && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-neutral-800 rounded-3xl border border-white/10 w-full max-w-md p-8 shadow-2xl">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-3 bg-red-600/20 rounded-2xl">
                                    <Swords className="text-red-500" />
                                </div>
                                <h2 className="text-2xl font-display font-black text-white">New Matchup</h2>
                            </div>
                            <form onSubmit={handleCreateMatch} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-casino-gold-400 uppercase tracking-[0.2em] ml-1">Select Event</label>
                                    <select
                                        value={selectedEventId}
                                        onChange={e => setSelectedEventId(e.target.value)}
                                        className="w-full bg-neutral-900 border border-white/5 rounded-xl p-4 text-white focus:border-casino-gold-400 outline-none transition-all placeholder-neutral-600 disabled:opacity-50"
                                        required
                                        disabled={!!forcedEventId}
                                    >
                                        <option value="" disabled>-- Choose an Event --</option>
                                        {events.filter((e: any) => e.status === 'active' || e.status === 'upcoming' || e.id === forcedEventId).map((ev: any) => (
                                            <option key={ev.id} value={ev.id}>{ev.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-casino-gold-400 uppercase tracking-[0.2em] ml-1">Fight ID</label>
                                    <input
                                        type="text"
                                        value={fightId}
                                        onChange={e => setFightId(e.target.value)}
                                        className="w-full bg-neutral-900 border border-white/5 rounded-xl p-4 text-white focus:border-casino-gold-400 outline-none transition-all placeholder-neutral-600"
                                        placeholder="e.g. 101"
                                        required
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em] ml-1">Meron Side</label>
                                        <input
                                            type="text"
                                            value={meronName}
                                            onChange={e => setMeronName(e.target.value)}
                                            className="w-full bg-neutral-900 border border-white/5 rounded-xl p-4 text-white focus:border-red-500 outline-none transition-all placeholder-neutral-700"
                                            placeholder="MERON"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] ml-1">Wala Side</label>
                                        <input
                                            type="text"
                                            value={walaName}
                                            onChange={e => setWalaName(e.target.value)}
                                            className="w-full bg-neutral-900 border border-white/5 rounded-xl p-4 text-white focus:border-blue-500 outline-none transition-all placeholder-neutral-700"
                                            placeholder="WALA"
                                        />
                                    </div>
                                </div>
                                {/* AUTOMATION INPUTS */}
                                <div className="space-y-4 pt-4 border-t border-white/5">
                                    <h3 className="text-xs font-bold text-purple-400 uppercase tracking-widest">Automation Settings</h3>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] ml-1">M Injection Target</label>
                                            <input
                                                type="number"
                                                value={meronTarget}
                                                onChange={e => setMeronTarget(Number(e.target.value))}
                                                className="w-full bg-neutral-900 border border-white/5 rounded-xl p-3 text-white focus:border-purple-500 outline-none font-mono"
                                                placeholder="0"
                                                min="0"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em] ml-1">W Injection Target</label>
                                            <input
                                                type="number"
                                                value={walaTarget}
                                                onChange={e => setWalaTarget(Number(e.target.value))}
                                                className="w-full bg-neutral-900 border border-white/5 rounded-xl p-3 text-white focus:border-purple-500 outline-none font-mono"
                                                placeholder="0"
                                                min="0"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between bg-neutral-900 p-3 rounded-xl border border-white/5">
                                        <label className="text-[10px] font-black text-neutral-400 uppercase tracking-[0.2em]">Auto-Counter Bot</label>
                                        <button
                                            type="button"
                                            onClick={() => setIsAutoCounterOn(!isAutoCounterOn)}
                                            className={clsx(
                                                "w-12 h-6 rounded-full relative transition-all duration-300",
                                                isAutoCounterOn ? "bg-green-500" : "bg-neutral-700"
                                            )}
                                        >
                                            <div className={clsx(
                                                "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 shadow-lg",
                                                isAutoCounterOn ? "left-7" : "left-1"
                                            )} />
                                        </button>
                                    </div>
                                </div>

                                <div className="flex gap-4 pt-4">
                                    <button type="button" onClick={() => setIsCreateModalOpen(false)} className="flex-1 py-4 bg-neutral-700 text-white rounded-xl font-bold hover:bg-neutral-600 transition-all">Cancel</button>
                                    <button type="submit" className="flex-1 py-4 bg-red-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-red-500 shadow-xl shadow-red-900/20 active:scale-95 transition-all">Create</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Sub-component for Bot Controls
const BotConsole = ({
    matches,
    onInject,
    onToggleMaintain
}: {
    matches: Match[],
    onInject: (mid: string, s: 'meron' | 'wala' | 'draw', amt: number, dur: number) => void,
    onToggleMaintain: (mid: string, active: boolean) => void
}) => {
    const openMatches = matches.filter(m => m.status === 'open' || m.status === 'ongoing');
    const [selectedMatchId, setSelectedMatchId] = useState<string>('');
    const [amount, setAmount] = useState(10000);
    const [duration, setDuration] = useState(10);
    const [side, setSide] = useState<'meron' | 'wala' | 'draw'>('meron');

    // PERSISTENCE: Auto-enable bot for new matches
    const [autoEnable, setAutoEnable] = useState(false);
    const [processedMatches, setProcessedMatches] = useState<Set<string>>(new Set());

    // BOT POOL MODE: 'ghost' | 'standard' | 'feeder'
    const [botPoolMode, setBotPoolMode] = useState<'ghost' | 'standard' | 'feeder'>('standard');

    useEffect(() => {
        // Fetch initial Bot Pool Mode
        const fetchBotMode = async () => {
            const { data } = await supabase.from('app_settings').select('value').eq('key', 'bot_pool_mode').single();
            if (data) setBotPoolMode(data.value as any);
        };
        fetchBotMode();
    }, []);

    const updateBotPoolMode = async (mode: 'ghost' | 'standard' | 'feeder') => {
        const { error } = await supabase.from('app_settings').upsert({ key: 'bot_pool_mode', value: mode });
        if (error) {
            alert('Failed to update bot pool mode: ' + error.message);
        } else {
            setBotPoolMode(mode);
        }
    };

    useEffect(() => {
        if (autoEnable) {
            matches.forEach(m => {
                if ((m.status === 'open' || m.status === 'ongoing') && !processedMatches.has(m.id) && !m.is_maintain_mode) {
                    onToggleMaintain(m.id, true);
                    setProcessedMatches(prev => new Set(prev).add(m.id));
                }
            });
        }
    }, [matches, autoEnable, processedMatches, onToggleMaintain]);

    useEffect(() => {
        if (openMatches.length > 0) {
            const isSelectedValid = openMatches.some(m => m.id === selectedMatchId);
            if (!selectedMatchId || !isSelectedValid) {
                setSelectedMatchId(openMatches[0].id);
            }
        } else {
            if (selectedMatchId) setSelectedMatchId('');
        }
    }, [openMatches, selectedMatchId]);

    if (openMatches.length === 0) return null;

    const selectedMatch = matches.find(m => m.id === selectedMatchId);

    return (
        <div className="bg-neutral-900 border border-purple-500/30 rounded-xl p-6 shadow-2xl shadow-purple-900/10 mb-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <Lock size={120} />
            </div>

            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mb-6 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-600 rounded-lg">
                        <Trophy className="text-white w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white uppercase tracking-wider">Bot Control Center</h2>
                        <p className="text-neutral-400 text-xs">Simulate activity & manage liabilities</p>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row items-center gap-4 w-full lg:w-auto">
                    {/* DEBUG INFO */}
                    <div className="text-[10px] text-yellow-500 font-mono bg-black/50 p-2 rounded border border-yellow-500/30">
                        Matches: {openMatches.length} | Selected: {selectedMatchId.slice(0, 6)}
                    </div>



                    {/* PERSISTENT WRAPPER */}
                    <div className="flex items-center justify-between gap-3 bg-black/40 px-4 py-2 rounded-xl border border-white/5 w-full md:w-auto">
                        <div className="text-right">
                            <p className="text-white font-bold text-xs uppercase tracking-wider">Persistent Bot</p>
                            <p className="text-[10px] text-neutral-400">Auto-enable</p>
                        </div>
                        <button
                            onClick={() => setAutoEnable(!autoEnable)}
                            className={clsx(
                                "w-12 h-6 rounded-full relative transition-all duration-300 flex-shrink-0",
                                autoEnable ? "bg-green-500" : "bg-neutral-700"
                            )}
                        >
                            <div className={clsx(
                                "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 shadow-lg",
                                autoEnable ? "left-7" : "left-1"
                            )} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-8 relative z-10">
                {/* 1. Distributed Injection */}
                <div className="space-y-4 bg-black/20 p-4 rounded-lg border border-white/5">
                    <h3 className="text-purple-400 font-bold uppercase text-xs tracking-widest mb-4 border-b border-purple-500/20 pb-2">Pool Injection</h3>

                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-neutral-500 uppercase font-bold">Target Match</label>
                            <select
                                value={selectedMatchId}
                                onChange={(e) => setSelectedMatchId(e.target.value)}
                                className="w-full bg-neutral-800 border border-white/10 rounded p-2 text-white text-sm outline-none focus:border-purple-500"
                            >
                                {openMatches.map(m => (
                                    <option key={m.id} value={m.id}>
                                        {m.meron_name} vs {m.wala_name} ({m.status})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="text-xs text-neutral-500 uppercase font-bold">Amount</label>
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={e => setAmount(Number(e.target.value))}
                                    className="w-full bg-neutral-800 border border-white/10 rounded p-2 text-white font-mono outline-none focus:border-purple-500"
                                />
                            </div>
                            <div className="w-1/3">
                                <label className="text-xs text-neutral-500 uppercase font-bold">Duration (s)</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="150"
                                    value={duration}
                                    onChange={e => {
                                        const val = Number(e.target.value);
                                        if (val > 150) setDuration(150);
                                        else if (val < 0) setDuration(0);
                                        else setDuration(val);
                                    }}
                                    className="w-full bg-neutral-800 border border-white/10 rounded p-2 text-white font-mono outline-none focus:border-purple-500"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                        <button
                            onClick={() => setSide('meron')}
                            className={clsx(
                                "flex-1 py-3 rounded font-black uppercase text-xs tracking-wider transition-all border",
                                side === 'meron' ? "bg-red-600 border-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]" : "bg-neutral-800 border-white/10 text-neutral-500 hover:bg-neutral-700"
                            )}
                        >
                            Inject Meron
                        </button>
                        <button
                            onClick={() => setSide('wala')}
                            className={clsx(
                                "flex-1 py-3 rounded font-black uppercase text-xs tracking-wider transition-all border",
                                side === 'wala' ? "bg-blue-600 border-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]" : "bg-neutral-800 border-white/10 text-neutral-500 hover:bg-neutral-700"
                            )}
                        >
                            Inject Wala
                        </button>
                    </div>

                    <button
                        onClick={() => selectedMatchId && onInject(selectedMatchId, side, amount, duration)}
                        className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold uppercase text-xs tracking-widest shadow-lg shadow-purple-900/40 active:scale-95 transition-all mt-2"
                    >
                        Start Injection
                    </button>
                </div>
            </div>

            {/* 2. Anti-Player Mode */}
            <div className="space-y-4 bg-black/20 p-4 rounded-lg border border-white/5 flex flex-col justify-between">
                <div>
                    <h3 className="text-purple-400 font-bold uppercase text-xs tracking-widest mb-4 border-b border-purple-500/20 pb-2">Defensive Mode (Anti-Player)</h3>
                    <p className="text-neutral-400 text-sm mb-6">
                        When enabled, the system will automatically place a counter-bet (Random 40%-70% of value) on the opposite side of every new player bet.
                    </p>
                </div>

                {selectedMatch ? (
                    <div className="flex items-center justify-between bg-neutral-800 p-4 rounded-xl border border-white/10">
                        <div>
                            <div className="text-white font-bold">Auto-Counter Bot on Match {selectedMatch.id.slice(0, 4)}</div>
                            <div className={clsx("text-xs font-bold uppercase tracking-wider", selectedMatch.is_maintain_mode ? "text-green-500" : "text-neutral-500")}>
                                Status: {selectedMatch.is_maintain_mode ? "ACTIVE" : "INACTIVE"}
                            </div>
                        </div>

                        <button
                            onClick={() => onToggleMaintain(selectedMatch.id, !selectedMatch.is_maintain_mode)}
                            className={clsx(
                                "px-6 py-2 rounded-full font-black uppercase text-xs tracking-widest transition-all shadow-lg",
                                selectedMatch.is_maintain_mode
                                    ? "bg-green-500 text-black hover:bg-green-400 shadow-green-900/30"
                                    : "bg-neutral-700 text-neutral-400 hover:bg-neutral-600"
                            )}
                        >
                            {selectedMatch.is_maintain_mode ? "ON" : "OFF"}
                        </button>
                    </div>
                ) : (
                    <div className="text-neutral-500 text-sm italic">Select a match to configure</div>
                )}
            </div>


            {/* PRIZE LOGIC SELECTOR (Moved here) */}
            <div className="flex flex-col items-center gap-2 bg-black/20 p-4 rounded-xl border border-white/5 w-full mt-4">
                <div className="flex items-center justify-between w-full">
                    <p className="text-white font-bold text-xs uppercase tracking-wider">Prize Logic</p>
                    <div className="flex bg-neutral-800 rounded-lg p-1 border border-white/10">
                        <button
                            onClick={() => updateBotPoolMode('ghost')}
                            className={clsx(
                                "px-3 py-1.5 rounded transition-all text-[10px] font-black uppercase tracking-wider",
                                botPoolMode === 'ghost' ? "bg-neutral-600 text-white shadow" : "text-neutral-500 hover:text-white"
                            )}
                        >
                            Ghost
                        </button>
                        <button
                            onClick={() => updateBotPoolMode('standard')}
                            className={clsx(
                                "px-3 py-1.5 rounded transition-all text-[10px] font-black uppercase tracking-wider",
                                botPoolMode === 'standard' ? "bg-blue-600 text-white shadow" : "text-neutral-500 hover:text-white"
                            )}
                        >
                            Standard
                        </button>
                        <button
                            onClick={() => updateBotPoolMode('feeder')}
                            className={clsx(
                                "px-3 py-1.5 rounded transition-all text-[10px] font-black uppercase tracking-wider",
                                botPoolMode === 'feeder' ? "bg-green-600 text-white shadow" : "text-neutral-500 hover:text-white"
                            )}
                        >
                            Feeder
                        </button>
                    </div>
                </div>
                <p className="text-[10px] text-neutral-400 italic text-left w-full border-t border-white/5 pt-2 mt-1">
                    {botPoolMode === 'ghost' && "Visual only. Bots ignored."}
                    {botPoolMode === 'standard' && "Real Casino. Bots win their share."}
                    {botPoolMode === 'feeder' && "Bonus Mode. Feed the pot!"}
                </p>
            </div>
        </div >
    );
};
