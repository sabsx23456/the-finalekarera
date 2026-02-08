import { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { Info, Loader2, Plus, Trash2, Play, Pause } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { useToast } from '../../components/ui/Toast';
import type { Match, Bet } from '../../types';
import { TrendsDisplay } from '../../components/dashboard/TrendsDisplay';
import { AnimatedCounter } from '../../components/ui/AnimatedCounter';
import { StreamOverlay } from '../../components/dashboard/StreamOverlay';
import { useStreamSettings } from '../../hooks/useStreamSettings';
import { useUserPreferences } from '../../hooks/useUserPreferences';

import clsx from 'clsx';

// ReactPlayer (and its HLS/DASH deps) is heavy. Only load it if we actually render it.
const LazyReactPlayer = lazy(() => import('react-player'));
const Player = LazyReactPlayer as any;

const audioContextRef = { current: null as AudioContext | null };

const getAudioContext = () => {
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
};

const playTone = (frequency: number, durationMs: number) => {
    try {
        const context = getAudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.value = 0.04;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + durationMs / 1000);
    } catch (error) {
        console.error("Unable to play sound:", error);
    }
};

export const UserDashboard = () => {
    const { eventId } = useParams();
    const { profile, refreshProfile } = useAuthStore();
    const { showToast } = useToast();
    useStreamSettings();
    const [currentMatch, setCurrentMatch] = useState<Match | null>(null);
    const [eventStream, setEventStream] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [betAmount, setBetAmount] = useState<number>(0);
    const [isPlacingBet, setIsPlacingBet] = useState(false);
    const [myBets, setMyBets] = useState<Bet[]>([]);
    const [matchBetTotals, setMatchBetTotals] = useState({ meron: 0, wala: 0, draw: 0 });
    const [plasadaRate, setPlasadaRate] = useState<number>(0.04); // Default 4%
    const preferences = useUserPreferences(profile?.id);

    const confirmThreshold = 1000;

    // Announcement State
    // REMOVED UNUSED STATE

    // Track previous match to detect changes
    const [prevMatchId, setPrevMatchId] = useState<string | null>(null);
    const [prevStatus, setPrevStatus] = useState<string | null>(null);
    const [showLastCallOverlay, setShowLastCallOverlay] = useState(false);
    const [showWinnerOverlay, setShowWinnerOverlay] = useState(false);
    const [isPlaying, setIsPlaying] = useState(true);

    // Track notified state to prevent spam
    const lastNotifiedWinnerRef = useRef<string | null>(null);
    const previousBalanceRef = useRef<number | null>(null);
    const lastWinAmountRef = useRef<number | null>(null);
    const lastWinTimeRef = useRef<number>(0);
    const prevMyBetsRef = useRef<Bet[]>([]);

    // Initialize Audio Context on first user interaction to comply with Autoplay Policy
    useEffect(() => {
        const initAudio = () => {
            const context = getAudioContext();
            if (context && context.state === 'suspended') {
                context.resume().catch(err => console.warn("Audio resume failed", err));
            }
        };

        window.addEventListener('click', initAudio, { once: true });
        window.addEventListener('keydown', initAudio, { once: true });
        window.addEventListener('touchstart', initAudio, { once: true });

        return () => {
            window.removeEventListener('click', initAudio);
            window.removeEventListener('keydown', initAudio);
            window.removeEventListener('touchstart', initAudio);
        };
    }, []);

    useEffect(() => {
        // Fetch initial Plasada Rate
        const fetchPlasada = async () => {
            const { data } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'plasada_rate')
                .single();
            if (data && data.value) {
                const rate = parseFloat(data.value);
                if (!isNaN(rate)) setPlasadaRate(rate);
            }
        };
        fetchPlasada();

        // Subscribe to Plasada Rate changes
        const settingsChannel = supabase
            .channel('app_settings_changes')
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'app_settings',
                filter: "key=eq.plasada_rate"
            }, (payload) => {
                const newValue = payload.new.value;
                if (newValue) {
                    const rate = parseFloat(newValue);
                    if (!isNaN(rate)) setPlasadaRate(rate);
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(settingsChannel);
        };
    }, []);

    useEffect(() => {
        if (!currentMatch) return;
        // ... (rest of the existing effect)

        // Reset notification ref if match changes or is re-opened
        if (currentMatch.id !== prevMatchId || currentMatch.status === 'open') {
            lastNotifiedWinnerRef.current = null;
        }

        // 1. Detect Winner Declaration (Global Overlay)
        if (currentMatch.status === 'finished' && currentMatch.winner) {
            const notificationKey = `${currentMatch.id}-${currentMatch.winner}`;

            if (prevStatus !== null && lastNotifiedWinnerRef.current !== notificationKey) {
                lastNotifiedWinnerRef.current = notificationKey;

                // Show Global Winner Overlay & Start Effect
                setShowWinnerOverlay(true);

                // 4 Second Timer to reset effects
                setTimeout(() => {
                    setShowWinnerOverlay(false);
                }, 4000);

                // Play Sound for Winner
                if (preferences.soundEffects) {
                    playTone(520, 220); // Winner Fanfare
                }

                // Optimized Refresh - Run immediately when winner is known
                refreshProfile();
            }
        }

        // 2. Last Call Trigger
        if (currentMatch.status === 'last_call' && prevStatus !== 'last_call' && preferences.matchAlerts) {
            setShowLastCallOverlay(true);
            setTimeout(() => setShowLastCallOverlay(false), 5000);
        }

        // Update refs
        setPrevMatchId(currentMatch.id);
        setPrevStatus(currentMatch.status);
    }, [currentMatch, prevMatchId, prevStatus, showToast, preferences]);

    // NEW: Watch for specific bet wins to trigger "Match Result" toast with correct amount
    useEffect(() => {
        if (!currentMatch || myBets.length === 0) return;

        // Check for newly won bets
        myBets.forEach(bet => {
            const prevBet = prevMyBetsRef.current.find(b => b.id === bet.id);

            // Trigger if status CHANGED to 'won'
            if (prevBet && prevBet.status !== 'won' && bet.status === 'won') {
                const message = `Match Result: ${bet.selection.toUpperCase()} WINS! You won ₱${bet.payout.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}!`;

                if (preferences.payoutAlerts) {
                    showToast(message, 'success');


                    if (preferences.soundEffects) {
                        playTone(520, 220);
                    }

                    // Mark this win to suppress generic balance toast
                    lastWinAmountRef.current = bet.payout;
                    lastWinTimeRef.current = Date.now();
                }
            }
        });

        prevMyBetsRef.current = myBets;
    }, [myBets, currentMatch, preferences, showToast]);

    // Generic Balance alert removed in favor of RealtimeMonitor (transactions listener)
    // which provides more specific feedback (Cash In vs Win vs Transfer).
    useEffect(() => {
        if (!profile) return;
        previousBalanceRef.current = profile.balance;
    }, [profile?.balance]);

    useEffect(() => {
        fetchCurrentMatch();
        fetchMyBets();

        if (eventId) {
            fetchEventDetails();
        }

        const matchChannel = supabase.channel(eventId ? `current_match:${eventId}` : 'current_match');

        const onMatchChange = (payload: any) => {
                if (payload.eventType === 'UPDATE' && payload.new) {
                    setCurrentMatch((prev) => {
                        if (prev && prev.id === payload.new.id) {
                            return { ...prev, ...payload.new } as Match;
                        }
                        return prev;
                    });
                    // Avoid refetching on every UPDATE (match totals can change frequently).
                    // INSERT/DELETE will still trigger a refresh to pick up match rotations.
                    return;
                }
                fetchCurrentMatch();
            };

        if (eventId) {
            matchChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `event_id=eq.${eventId}` }, onMatchChange);
        } else {
            matchChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, onMatchChange);
        }

        matchChannel.subscribe();

        // FIXED: Listen to UPDATE events for bets to get Payout amount
        const betsChannel = supabase
            .channel('my_bets')
            .on('postgres_changes', {
                event: '*', // Listen to INSERT and UPDATE
                schema: 'public',
                table: 'bets',
                filter: `user_id=eq.${profile?.id}`
            }, () => {
                fetchMyBets();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(matchChannel);
            supabase.removeChannel(betsChannel);
        };
    }, [profile?.id, eventId]);

    // Use aggregated totals from Server
    useEffect(() => {
        if (!currentMatch) return;
        setMatchBetTotals({
            meron: currentMatch.meron_total || 0,
            wala: currentMatch.wala_total || 0,
            draw: currentMatch.draw_total || 0,
        });
    }, [currentMatch?.meron_total, currentMatch?.wala_total, currentMatch?.draw_total]);

    /* REMOVED CLIENT-SIDE AGGREGATION - MOVED TO SERVER TRIGGERS FOR SECURITY */
    /*
    useEffect(() => {
        // Old logic removed to prevent RLS errors and improve performance
    }, [currentMatch?.id]);
    */

    const fetchCurrentMatch = async () => {
        // 1. Try to fetch an ACTIVE match first (Open, Ongoing, Last Call) - Strict Priority
        let activeQuery = supabase
            .from('matches')
            .select('*')
            .in('status', ['open', 'ongoing', 'last_call', 'closed'])
            .order('created_at', { ascending: false })
            .limit(1);

        if (eventId) {
            activeQuery = activeQuery.eq('event_id', eventId);
        }

        const { data: activeData } = await activeQuery.maybeSingle();

        if (activeData) {
            setCurrentMatch(activeData as Match);
            fetchMyBets(activeData.id);
        } else {
            // 2. If no active match, CHECK FOR RECENT FINISHED MATCH
            // Keep showing the winner for 13 seconds (buffer for 10s request)
            let finishedQuery = supabase
                .from('matches')
                .select('*')
                .eq('status', 'finished')
                .order('created_at', { ascending: false })
                .limit(1);

            if (eventId) {
                finishedQuery = finishedQuery.eq('event_id', eventId);
            }

            const { data: finData } = await finishedQuery.maybeSingle();

            if (finData) {
                // FIXED: Removed restrictive updated_at check which caused "blink once" issues if timestamp wasn't updated.
                // We now show the latest finished match regardless of timestamp, UNTIL a new match is created (handled by activeQuery above).
                // Added a safety check for 24 hours to prevent showing ancient history on fresh load.
                const createTime = new Date(finData.created_at).getTime();
                const now = Date.now();
                if (now - createTime < 86400000) { // 24 hours
                    setCurrentMatch(finData as Match);
                    fetchMyBets(finData.id);
                } else {
                    setCurrentMatch(null);
                }
            } else {
                setCurrentMatch(null);
            }
        }

        setLoading(false);
    };

    const fetchEventDetails = async () => {
        if (!eventId) return;
        const { data } = await supabase.from('events').select('stream_url').eq('id', eventId).single();
        if (data && data.stream_url) {
            setEventStream(data.stream_url);
        }
    };

    const fetchMyBets = async (matchId?: string) => {
        const id = matchId || currentMatch?.id;
        if (!profile || !id) return;

        const { data } = await supabase
            .from('bets')
            .select('*')
            .eq('user_id', profile.id)
            .eq('match_id', id);

        if (data) setMyBets(data as Bet[]);
    };

    const handlePlaceBet = async (selection: 'meron' | 'wala' | 'draw') => {
        if (!currentMatch || betAmount <= 0 || !profile) return;
        if (currentMatch.status !== 'open' && currentMatch.status !== 'last_call') {
            showToast('Betting is closed for this match.', 'error');
            return;
        }

        if (betAmount < 20) {
            showToast('Minimum bet amount is ₱20.', 'error');
            return;
        }

        if (selection === 'draw' && (myBetOnCurrent('draw') + betAmount) > 1000) {
            const currentDrawTotal = myBetOnCurrent('draw');
            showToast(`Maximum total bet for Draw is ₱1,000. Your current total: ₱${currentDrawTotal.toLocaleString()}`, 'error');
            return;
        }

        if (profile.balance < betAmount) {
            showToast('Insufficient balance.', 'error');
            setIsPlacingBet(false);
            return;
        }

        const requiresConfirm = !preferences.quickBet || (preferences.confirmBets && betAmount >= confirmThreshold);
        if (requiresConfirm) {
            const confirmed = window.confirm(`Confirm bet of ₱${betAmount.toLocaleString()} on ${selection.toUpperCase()}?`);
            if (!confirmed) return;
        }

        setIsPlacingBet(true);
        try {
            const { error } = await supabase.from('bets').insert({
                user_id: profile.id,
                match_id: currentMatch.id,
                amount: betAmount,
                selection
            });

            if (error) throw error;

            setBetAmount(0);
            await refreshProfile();
            await fetchMyBets();
            showToast('Your bet has been placed successfully!', 'success');
            if (preferences.soundEffects) {
                playTone(840, 140);
            }
        } catch (error: any) {
            showToast(error.message || 'Failed to place bet.', 'error');
        } finally {
            setIsPlacingBet(false);
        }
    };

    const getOddsDisplay = (sideTotal: number, totalPool: number) => {
        const netMultiplier = 1 - plasadaRate;
        const fallbackOdds = 2 * netMultiplier;

        const decimalOdds = sideTotal > 0 && totalPool > 0 ? (totalPool * netMultiplier) / sideTotal : fallbackOdds;
        const safeDecimal = isFinite(decimalOdds) && decimalOdds > 0 ? decimalOdds : fallbackOdds;

        if (preferences.oddsFormat === 'hong-kong') {
            return { value: Math.max(safeDecimal - 1, 0), suffix: ' HK', decimals: 2 };
        }

        if (preferences.oddsFormat === 'malay') {
            const hkOdds = safeDecimal - 1;
            if (hkOdds === 0) return { value: 0, suffix: ' MY', decimals: 2 };
            const malayOdds = hkOdds >= 1 ? hkOdds : -1 / hkOdds;
            return { value: malayOdds, suffix: ' MY', decimals: 2 };
        }

        return { value: safeDecimal * 100, suffix: '%', decimals: 1 };
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] text-casino-slate-400 gap-4">
                <Loader2 className="animate-spin text-casino-gold-400 w-10 h-10" />
                <span className="text-sm font-bold uppercase tracking-[0.2em]">Loading Arena...</span>
            </div>
        );
    }

    const myBetOnCurrent = (selection: string) => {
        return myBets
            .filter(b => b.match_id === currentMatch?.id && b.selection === selection)
            .reduce((sum, b) => sum + b.amount, 0);
    };

    // Helper to proxy stream URL if needed
    const getStreamUrl = (url: string | null) => {
        if (!url) return null;
        if (url.includes('stream.wccgames7.xyz/wccstream')) {
            return url.replace('https://stream.wccgames7.xyz', ''); // Make relative to use proxy
        }
        return url;
    };

    const displayStreamUrl = getStreamUrl(eventStream);

    // We controls currentMatch persistence specifically for the desired "Celebration Window" (15s).
    // So if currentMatch exists, we should show the result interpretation (stats).
    const shouldShowResult = true; // Simplified: Logic is now handled by fetchCurrentMatch returning null for stale matches.

    // For calculating stats
    // UPDATED: Use the state which is now driven by currentMatch totals
    const totalPool = shouldShowResult ? (matchBetTotals.meron + matchBetTotals.wala) : 0;
    const meronSideTotal = shouldShowResult ? matchBetTotals.meron : 0;
    const walaSideTotal = shouldShowResult ? matchBetTotals.wala : 0;
    // When pool resets to 0, getOddsDisplay will naturally use fallbackOdds
    const meronOddsDisplay = getOddsDisplay(meronSideTotal, totalPool);
    const walaOddsDisplay = getOddsDisplay(walaSideTotal, totalPool);

    return (
        <div className="flex flex-col lg:flex-row h-full w-full bg-casino-dark-950 overflow-hidden rounded-3xl border border-white/5">
            {/* LEFT COLUMN: LIVE STREAM */}
            <div className="flex-1 flex flex-col relative bg-black group min-h-0">
                <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-start pointer-events-none">
                    <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                        <span className="text-white font-bold text-[10px] uppercase tracking-wider">Live Stream</span>
                    </div>
                    {currentMatch && shouldShowResult && (
                        <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-[10px] text-casino-slate-300 font-medium">
                            Match #{currentMatch.id.slice(0, 4).toUpperCase()}
                        </div>
                    )}
                </div>

                    <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
                    <div className='w-full h-full relative'>
                        {(() => {
                            const url = displayStreamUrl ?? '';

                            // User Requested Hardcoded Embed (Testing/Default)
                            // Only used when there is no configured stream url.
                            if (!url) {
                                return (
                                    <iframe
                                        width="100%"
                                        height="100%"
                                        src="https://www.youtube.com/embed/HpHQqz3J48c?si=eM9svc3jE3p1FVZ3&autoplay=1&mute=1"
                                        title="YouTube video player"
                                        frameBorder="0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                        referrerPolicy="strict-origin-when-cross-origin"
                                        allowFullScreen
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            pointerEvents: 'none',
                                            transform: 'scale(1.2)'
                                        }}
                                    ></iframe>
                                );
                            }

                        const isFile = url.includes('.m3u8') || url.includes('.mp4');
                        const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');
                        const isFacebook = url.includes('facebook.com') || url.includes('fb.watch');
                        const isSupportedByPlayer = isFile || isYouTube || isFacebook;

                        if (isSupportedByPlayer) {
                                return (
                        <>
                            <Suspense fallback={<div className="absolute inset-0 bg-black" />}>
                                <Player
                                    url={url}
                                    width="100%"
                                    height="100%"
                                    playing={isPlaying}
                                    loop={true}
                                    muted={true}
                                    controls={false}
                                    playsinline={true}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: '100%',
                                        pointerEvents: 'none',
                                        transform: 'scale(1.2)', // Apply zoom to Player types too
                                        transformOrigin: 'center center',
                                    }}
                                    config={{
                                        file: { forceHLS: url.includes('.m3u8') },
                                        youtube: { playerVars: { showinfo: 0, controls: 0, disablekb: 1, modestbranding: 1, rel: 0 } },
                                        facebook: { attributes: { style: { width: '100%', height: '100%' } } }
                                    }}
                                    onError={(e: any) => console.error("Stream Error:", e)}
                                />
                            </Suspense>
                            {/* CUSTOM PLAY BUTTON OVERLAY */}
                            <div className="absolute bottom-4 left-4 z-50">
                                <button
                                    onClick={() => setIsPlaying(!isPlaying)}
                                    className="bg-black/50 hover:bg-black/70 text-white rounded-full p-3 transition-all backdrop-blur-sm border border-white/10"
                                >
                                    {isPlaying ? <Pause size={24} fill="white" /> : <Play size={24} fill="white" />}
                                </button>
                            </div>
                        </>
                        );
                            }

                        // Fallback for Generic iFrames
                        return (
                        <iframe
                            src={url.includes('?') ? `${url}&autoplay=1&muted=1` : `${url}?autoplay=1&muted=1`}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                border: 0,
                                transform: 'scale(1.2)',
                                transformOrigin: 'center center',
                                pointerEvents: 'none'
                            }}
                            allow="autoplay; camera; microphone; fullscreen; picture-in-picture; display-capture; midi; geolocation;"
                        />
                        );
                        })()}

                        {/* STREAM OVERLAY: Date/Time */}
                        <StreamOverlay />

                        {/* LAST CALL OVERLAY */}
                        {showLastCallOverlay && currentMatch?.status === 'last_call' && (
                            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                                <div className="text-center transform scale-150">
                                    <h2 className="text-6xl font-black text-orange-500 uppercase tracking-widest animate-pulse drop-shadow-[0_0_30px_rgba(249,115,22,0.6)]">
                                        LAST CALL
                                    </h2>
                                </div>
                            </div>
                        )}
                        {/* PERSISTENT LAST CALL BADGE OVER STREAM (When overlay is gone but status is still last_call) */}
                        {currentMatch?.status === 'last_call' && !showLastCallOverlay && (
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                                <h2 className="text-6xl font-black text-orange-500/50 uppercase tracking-widest rotate-[-15deg] pointer-events-none border-4 border-orange-500/50 px-8 py-4 rounded-xl">
                                    LAST CALL
                                </h2>
                            </div>
                        )}
                        {/* WINNER OVERLAY */}
                        {showWinnerOverlay && currentMatch?.winner && (
                            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                                <div className="text-center transform scale-150">
                                    <h2 className={clsx(
                                        "text-6xl font-black uppercase tracking-widest animate-pulse drop-shadow-[0_0_50px_rgba(255,255,255,0.8)]",
                                        currentMatch.winner === 'meron' ? "text-red-500" :
                                            currentMatch.winner === 'wala' ? "text-blue-500" : "text-white"
                                    )}>
                                        WINNER
                                    </h2>
                                    <h1 className={clsx(
                                        "text-8xl font-black uppercase tracking-tighter mt-2 drop-shadow-2xl",
                                        currentMatch.winner === 'meron' ? "text-red-500" :
                                            currentMatch.winner === 'wala' ? "text-blue-500" : "text-white"
                                    )}>
                                        {currentMatch.winner}
                                    </h1>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="absolute inset-0 pointer-events-none border-[12px] border-transparent shadow-[inset_0_0_100px_rgba(0,0,0,0.4)] z-20" />
                </div>
            </div>

            {/* RIGHT COLUMN: BETTING CONSOLE - PREMIUM GRID LAYOUT */}
            <div className="w-full lg:w-[550px] bg-[#111] flex flex-col border-l border-white/5 font-sans">
                {/* 1. TOP HEADER: SPLIT BETTING / FIGHT # */}
                <div className="flex border-b border-white/10 bg-[#1a1a1a]">
                    <div className="w-1/2 p-2 text-center">
                        <span className="text-white font-black text-xs uppercase tracking-widest">Betting</span>
                    </div>
                    <div className="w-1/2 p-2 text-center border-l border-white/10 relative">
                        <span className="text-white font-black text-xs uppercase tracking-widest">
                            {currentMatch?.fight_id ? `Fight ID: ${currentMatch.fight_id}` : 'Fight ID'}
                        </span>
                        <div className="absolute top-0 right-0 p-1 opacity-50">
                            <Info size={10} className="text-white" />
                        </div>
                    </div>
                </div>

                {/* 2. STATUS & ID ROW */}
                <div className="flex bg-[#111]">
                    <div className="w-1/2 p-2 flex items-center justify-center border-r border-white/5">
                        <div className={clsx(
                            "px-4 py-1 rounded-sm font-black text-[10px] uppercase tracking-[0.2em] shadow-lg",
                            currentMatch?.status === 'open' ? "bg-green-700 text-white shadow-green-900/40" :
                                currentMatch?.status === 'closed' ? "bg-red-700 text-white shadow-red-900/40" :
                                    currentMatch?.status === 'ongoing' ? "bg-yellow-600 text-white animate-pulse" :
                                        currentMatch?.status === 'last_call' ? "bg-orange-600 text-white animate-pulse" :
                                            "bg-neutral-700 text-neutral-400"
                        )}>
                            {currentMatch?.status === 'open' ? 'OPEN' :
                                currentMatch?.status === 'closed' ? 'CLOSED' :
                                    currentMatch?.status === 'ongoing' ? 'LIVE' :
                                        currentMatch?.status === 'last_call' ? 'LAST CALL' :
                                            'WAITING'}
                        </div>
                    </div>
                    <div className="w-1/2 p-2 flex items-center justify-center">
                        <span className="text-lg font-black text-white tracking-tighter">
                            {currentMatch ? (currentMatch.fight_id || currentMatch.id.slice(0, 8).toUpperCase()) : '--'}
                        </span>
                    </div>
                </div>

                {/* 4. TEAM BANNERS (RED/BLUE) */}
                <div className="flex relative z-10 transition-all">
                    {/* MERON BANNER */}
                    <div className={clsx(
                        "w-1/2 py-3 text-center relative overflow-hidden transition-all duration-500",
                        currentMatch?.winner === 'meron'
                            ? "bg-neutral-900 animate-pulse border-white/10" // Winner: Dark BG + Blink
                            : "bg-red-700 opacity-80"
                    )}>
                        <h2 className={clsx(
                            "font-black text-xl md:text-2xl uppercase tracking-tighter relative z-10 drop-shadow-md",
                            currentMatch?.winner === 'meron' ? "text-red-500" : "text-white"
                        )}>
                            {currentMatch?.winner === 'meron' ? "WINNER" : "MERON"}
                        </h2>
                        {/* Remove old gradients/animations for winner to keep it clean for the new text effect */}
                    </div>

                    {/* WALA BANNER */}
                    <div className={clsx(
                        "w-1/2 py-3 text-center relative overflow-hidden transition-all duration-500",
                        currentMatch?.winner === 'wala'
                            ? "bg-neutral-900 animate-pulse border-white/10" // Winner: Dark BG + Blink
                            : "bg-blue-700 opacity-80"
                    )}>
                        <h2 className={clsx(
                            "font-black text-xl md:text-2xl uppercase tracking-tighter relative z-10 drop-shadow-md",
                            currentMatch?.winner === 'wala' ? "text-blue-500" : "text-white"
                        )}>
                            {currentMatch?.winner === 'wala' ? "WINNER" : "WALA"}
                        </h2>
                    </div>
                </div>

                {/* 3. TOTALS ROW (YELLOW) - Moved below Team Banners */}
                <div className="flex pb-2 bg-[#111]">
                    <div className={clsx("w-1/2 text-center px-2 pt-2 border-r border-white/5", currentMatch?.winner === 'meron' && "animate-pulse")}>
                        <div className="text-xl md:text-2xl font-black text-yellow-400 font-mono tracking-tighter drop-shadow-md">
                            <AnimatedCounter
                                value={meronSideTotal}
                                prefix="₱ "
                                duration={currentMatch?.status === 'open' ? 1000 : 0}
                            />
                        </div>
                    </div>
                    <div className={clsx("w-1/2 text-center px-2 pt-2", currentMatch?.winner === 'wala' && "animate-pulse")}>
                        <div className="text-xl md:text-2xl font-black text-yellow-400 font-mono tracking-tighter drop-shadow-md">
                            <AnimatedCounter
                                value={walaSideTotal}
                                prefix="₱ "
                                duration={currentMatch?.status === 'open' ? 1000 : 0}
                            />
                        </div>
                    </div>
                </div>

                {/* 5. PAYOUTS & MY BETS */}
                <div className="flex bg-[#1a1a1a] border-b border-white/5">
                    {/* MERON STATS */}
                    <div className={clsx("w-1/2 p-3 text-center space-y-1 border-r border-white/5", currentMatch?.winner === 'meron' && "animate-pulse")}>
                        <div className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Payout</div>
                        <div className="text-white font-bold text-lg">
                            <AnimatedCounter
                                value={meronOddsDisplay.value}
                                decimals={meronOddsDisplay.decimals}
                                suffix={meronOddsDisplay.suffix}
                            />
                        </div>
                        <div className={clsx("text-xs font-mono font-bold mt-1", myBetOnCurrent('meron') > 0 ? "text-green-400" : "text-neutral-600")}>
                            {shouldShowResult ? myBetOnCurrent('meron').toLocaleString() : 0} = <AnimatedCounter value={
                                (() => {
                                    if (!shouldShowResult) return 0;
                                    const bet = myBetOnCurrent('meron');
                                    const total = meronSideTotal + walaSideTotal;
                                    const side = meronSideTotal;
                                    // Dynamic calculation
                                    const netMultiplier = 1 - plasadaRate;
                                    const odds = (side > 0 && total > 0) ? (total * netMultiplier / side) : 0;
                                    return (bet * (odds || 0));
                                })()
                            } />
                        </div>
                    </div>

                    {/* WALA STATS */}
                    <div className={clsx("w-1/2 p-3 text-center space-y-1", currentMatch?.winner === 'wala' && "animate-pulse")}>
                        <div className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Payout</div>
                        <div className="text-white font-bold text-lg">
                            <AnimatedCounter
                                value={walaOddsDisplay.value}
                                decimals={walaOddsDisplay.decimals}
                                suffix={walaOddsDisplay.suffix}
                            />
                        </div>
                        <div className={clsx("text-xs font-mono font-bold mt-1", myBetOnCurrent('wala') > 0 ? "text-green-400" : "text-neutral-600")}>
                            {shouldShowResult ? myBetOnCurrent('wala').toLocaleString() : 0} = <AnimatedCounter value={
                                (() => {
                                    if (!shouldShowResult) return 0;
                                    const bet = myBetOnCurrent('wala');
                                    const total = meronSideTotal + walaSideTotal;
                                    const side = walaSideTotal;
                                    // Dynamic calculation
                                    const netMultiplier = 1 - plasadaRate;
                                    const odds = (side > 0 && total > 0) ? (total * netMultiplier / side) : 0;
                                    return (bet * (odds || 0));
                                })()
                            } />
                        </div>
                    </div>
                </div>

                {/* 6. ACTION BUTTONS */}
                <div className="flex p-3 gap-3 bg-[#111]">
                    <button
                        disabled={(currentMatch?.status !== 'open' && currentMatch?.status !== 'last_call') || isPlacingBet}
                        onClick={() => handlePlaceBet('meron')}
                        className={clsx(
                            "w-1/2 py-4 rounded bg-red-700 hover:bg-red-600 text-white flex flex-col items-center justify-center transition-all active:scale-95 shadow-lg border-b-4 border-red-900",
                            ((currentMatch?.status !== 'open' && currentMatch?.status !== 'last_call') || isPlacingBet) && "opacity-50 cursor-not-allowed border-none",
                            currentMatch?.winner === 'meron' && "animate-pulse ring-2 ring-red-500 ring-offset-2 ring-offset-black"
                        )}
                    >
                        <span className="text-xl font-black uppercase tracking-wider flex items-center gap-2">
                            <Plus size={20} strokeWidth={3} />
                            Bet Meron
                        </span>

                    </button>
                    <button
                        disabled={(currentMatch?.status !== 'open' && currentMatch?.status !== 'last_call') || isPlacingBet}
                        onClick={() => handlePlaceBet('wala')}
                        className={clsx(
                            "w-1/2 py-4 rounded bg-blue-700 hover:bg-blue-600 text-white flex flex-col items-center justify-center transition-all active:scale-95 shadow-lg border-b-4 border-blue-900",
                            ((currentMatch?.status !== 'open' && currentMatch?.status !== 'last_call') || isPlacingBet) && "opacity-50 cursor-not-allowed border-none",
                            currentMatch?.winner === 'wala' && "animate-pulse ring-2 ring-blue-500 ring-offset-2 ring-offset-black"
                        )}
                    >
                        <span className="text-xl font-black uppercase tracking-wider flex items-center gap-2">
                            <Plus size={20} strokeWidth={3} />
                            Bet Wala
                        </span>
                    </button>
                </div>



                {/* 7. FOOTER: INPUT & BALANCE (Moved Above Trends as requested) */}
                <div className="p-4 bg-[#1a1a1a] border-t border-b border-white/10 space-y-4">
                    {/* Balance REMOVED - already in header */}

                    {/* Input Control */}
                    <div className="flex gap-3">
                        <div className="flex-1 relative">
                            <span className="absolute -top-2 left-3 bg-[#1a1a1a] px-1 text-[10px] text-white/50 uppercase font-bold">Enter Amount</span>
                            <input
                                type="number"
                                value={betAmount || ''}
                                onChange={(e) => setBetAmount(Math.max(0, parseInt(e.target.value) || 0))}
                                placeholder="0"
                                className="w-full h-12 bg-[#111] border border-white/20 rounded pl-4 pr-4 text-yellow-400 font-black font-mono text-xl outline-none focus:border-yellow-400 transition-all"
                            />
                        </div>
                        <button
                            onClick={() => setBetAmount(0)}
                            className="h-12 px-6 bg-[#ff0055] hover:bg-[#ff0055]/80 text-white font-black uppercase tracking-widest rounded flex items-center gap-2 transition-all"
                        >
                            <Trash2 size={16} />
                            Clear
                        </button>
                    </div>

                    {/* Chips */}
                    <div className="grid grid-cols-5 gap-2">
                        {[100, 500, 1000, 5000, 10000].map(val => (
                            <button
                                key={val}
                                onClick={() => setBetAmount(prev => prev + val)}
                                className="py-2 bg-[#222] border border-white/5 hover:bg-[#333] rounded text-[10px] font-bold text-white transition-all active:scale-95"
                            >
                                +{val.toLocaleString()}
                            </button>
                        ))}
                    </div>
                </div>

                {/* DEDICATED DRAW SECTION (Compacted) */}
                <div className="px-3 pb-2 bg-[#111]">
                    <div className="flex flex-col gap-2 p-2.5 bg-black/40 rounded-xl border border-white/5 shadow-inner">
                        <div className="flex justify-between items-center">
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black text-green-500 uppercase tracking-widest leading-none mb-0.5">Liquidity</span>
                                <div className="text-lg font-black text-white font-mono leading-none">
                                    <AnimatedCounter value={matchBetTotals.draw} prefix="₱ " />
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-[9px] font-black text-white/40 uppercase tracking-widest leading-none mb-0.5">Payout</span>
                                <div className="text-lg font-black text-green-500 leading-none">x8.0</div>
                            </div>
                        </div>

                        <div className="flex gap-3 items-center border-t border-white/5 pt-2">
                            <div className="flex-1 flex items-center gap-2">
                                <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider">Your Bet</span>
                                <div className="text-green-500 font-bold font-mono text-sm">
                                    ₱ {myBetOnCurrent('draw').toLocaleString()}
                                </div>
                            </div>
                            <button
                                disabled={((currentMatch?.status !== 'open' && currentMatch?.status !== 'last_call') || isPlacingBet)}
                                onClick={() => handlePlaceBet('draw')}
                                className={clsx(
                                    "px-6 py-2 rounded bg-green-700 hover:bg-green-600 text-white font-black uppercase tracking-widest text-xs transition-all active:scale-95 shadow-lg border-b-2 border-green-900",
                                    ((currentMatch?.status !== 'open' && currentMatch?.status !== 'last_call') || isPlacingBet) && "opacity-50 cursor-not-allowed border-none",
                                    currentMatch?.winner === 'draw' && "animate-pulse"
                                )}
                            >
                                Bet Draw
                            </button>
                        </div>
                    </div>
                </div>


                {/* 8. SCROLLABLE CONTENT (Trends) */}
                <div className="flex-1 overflow-y-auto bg-[#0a0a0a]">
                    <TrendsDisplay eventId={eventId} />
                </div>
            </div>
        </div >
    );
};
