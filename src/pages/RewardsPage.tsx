import { useEffect, useState } from 'react';
import { useAuthStore } from '../lib/store';
import { supabase } from '../lib/supabase';
import { Trophy, Flame, Ticket, Check, Lock, Gift, Clock, AlertOctagon } from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import type { RewardConfig, RaffleEvent } from '../types';
import clsx from 'clsx';

export const RewardsPage = () => {
    const { profile, refreshProfile } = useAuthStore();
    const { showToast } = useToast();
    const [configs, setConfigs] = useState<RewardConfig[]>([]);
    const [claimed, setClaimed] = useState<Set<string>>(new Set());
    const [raffles, setRaffles] = useState<RaffleEvent[]>([]);
    const [myEntries, setMyEntries] = useState<Record<string, number>>({});

    useEffect(() => {
        if (profile) fetchData();
    }, [profile?.id]);

    const fetchData = async () => {
        try {
            const { data: configData } = await supabase.from('reward_configs').select('*').eq('is_active', true);
            if (configData) setConfigs(configData as RewardConfig[]);

            const currentMonth = new Date().toISOString().slice(0, 7);
            const { data: claimData } = await supabase
                .from('claimed_rewards')
                .select('reward_config_id')
                .eq('user_id', profile!.id)
                .eq('month_year', currentMonth);

            if (claimData) setClaimed(new Set(claimData.map(((c: any) => c.reward_config_id))));

            const { data: raffleData } = await supabase.from('raffle_events').select('*').eq('status', 'active');
            if (raffleData) setRaffles(raffleData as RaffleEvent[]);

            if (raffleData) {
                const { data: entriesData } = await supabase
                    .from('raffle_entries')
                    .select('raffle_id, entries_count')
                    .eq('user_id', profile!.id)
                    .in('raffle_id', raffleData.map((r: any) => r.id));

                const entriesMap: Record<string, number> = {};
                entriesData?.forEach((e: any) => entriesMap[e.raffle_id] = e.entries_count);
                setMyEntries(entriesMap);
            }
        } catch (error) {
            console.error(error);
        }
    };

    const handleClaim = async (configId: string) => {
        try {
            const { data, error } = await supabase.rpc('claim_streak_reward', { p_reward_id: configId });
            if (error) throw error;
            if (!data.success) throw new Error(data.error);

            showToast('Reward claimed!', 'success');
            setClaimed(prev => new Set(prev).add(configId));
            setConfigs(prev => prev.map(c => c.id === configId ? { ...c, total_claimed: (c.total_claimed || 0) + 1 } : c));
            refreshProfile();
        } catch (error: any) {
            showToast(error.message, 'error');
            if (error.message.includes('Sold Out')) fetchData();
        }
    };

    const handleJoinRaffle = async (raffleId: string, ticketPrice: number) => {
        if ((profile?.tickets || 0) < ticketPrice) {
            showToast('Not enough tickets!', 'error');
            return;
        }
        try {
            const { data, error } = await supabase.rpc('join_raffle', { p_raffle_id: raffleId, p_ticket_count: 1 });
            if (error) throw error;
            if (!data.success) throw new Error(data.error);

            showToast('Joined raffle!', 'success');
            setMyEntries(prev => ({ ...prev, [raffleId]: (prev[raffleId] || 0) + 1 }));
            refreshProfile();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    if (!profile) return null;

    const winConfigs = configs.filter(c => c.type === 'win_streak').sort((a, b) => a.milestone - b.milestone);
    const loseConfigs = configs.filter(c => c.type === 'lose_streak').sort((a, b) => a.milestone - b.milestone);

    return (
        <div className="space-y-4 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-casino-gold-500" />
                    <h1 className="text-lg font-bold text-white">Rewards</h1>
                </div>
            </div>

            {/* Stats Bar - Compact */}
            <div className="glass-panel p-4 rounded-xl">
                <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                        <p className="text-xs text-gray-300 uppercase font-semibold">Balance</p>
                        <p className="text-base font-mono text-white font-bold">₱{profile.balance.toLocaleString()}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-300 uppercase font-semibold">Win Streak</p>
                        <p className="text-base font-mono text-green-400 font-bold">{profile.win_streak || 0}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-300 uppercase font-semibold">Lose Streak</p>
                        <p className="text-base font-mono text-red-400 font-bold">{profile.lose_streak || 0}</p>
                    </div>
                    <div>
                        <p className="text-xs text-gray-300 uppercase font-semibold">Tickets</p>
                        <p className="text-base font-mono text-yellow-400 font-bold">{profile.tickets || 0}</p>
                    </div>
                </div>
            </div>

            {/* Streak Rewards - 2 Column Layout */}
            <div className="flex items-center gap-2 mb-3">
                <Flame className="w-4 h-4 text-orange-500" />
                <h2 className="text-sm font-bold text-white uppercase">Streak Rewards</h2>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
                {/* Win Streak - Left Column */}
                <div className="space-y-2">
                    <h3 className="text-xs font-bold text-green-500 uppercase tracking-wide">Win Streak</h3>
                    {winConfigs.map(config => (
                        <StreakRewardCard
                            key={config.id}
                            config={config}
                            currentStreak={profile.win_streak || 0}
                            isClaimed={claimed.has(config.id)}
                            onClaim={() => handleClaim(config.id)}
                        />
                    ))}
                    {winConfigs.length === 0 && <div className="text-casino-slate-500 text-xs italic">No active rewards</div>}
                </div>

                {/* Lose Streak - Right Column */}
                <div className="space-y-2">
                    <h3 className="text-xs font-bold text-red-500 uppercase tracking-wide">Lose Streak</h3>
                    {loseConfigs.map(config => (
                        <StreakRewardCard
                            key={config.id}
                            config={config}
                            currentStreak={profile.lose_streak || 0}
                            isClaimed={claimed.has(config.id)}
                            onClaim={() => handleClaim(config.id)}
                        />
                    ))}
                    {loseConfigs.length === 0 && <div className="text-casino-slate-500 text-xs italic">No active rewards</div>}
                </div>
            </div>

            {/* Weekly Raffle - Full Width Bottom */}
            <div className="space-y-3 pt-4 border-t border-white/5">
                <div className="flex items-center gap-2">
                    <Ticket className="w-4 h-4 text-purple-500" />
                    <h2 className="text-sm font-bold text-white uppercase">Weekly Raffle</h2>
                </div>

                {raffles.length === 0 ? (
                    <div className="text-center py-6 bg-casino-dark-850 rounded-xl border border-white/5">
                        <Gift className="w-8 h-8 text-casino-slate-600 mx-auto mb-2" />
                        <p className="text-casino-slate-400 text-sm">No active raffles</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        {raffles.map(raffle => (
                            <div key={raffle.id} className="glass-panel rounded-xl overflow-hidden">
                                <div className="h-32 bg-casino-dark-850 relative">
                                    {raffle.image_url ? (
                                        <img src={raffle.image_url} alt={raffle.title} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <Gift size={32} className="text-purple-500/50" />
                                        </div>
                                    )}
                                    <div className="absolute top-2 right-2">
                                        <div className="bg-purple-600 text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                                            Active
                                        </div>
                                    </div>
                                </div>
                                <div className="p-3">
                                    <h3 className="text-sm font-bold text-white mb-1">{raffle.title}</h3>
                                    <div className="flex items-center gap-3 text-xs text-casino-slate-400 mb-3">
                                        <div className="flex items-center gap-1">
                                            <Clock size={12} />
                                            <span>{new Date(raffle.draw_date).toLocaleDateString()}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-casino-gold-500 font-semibold">
                                            <Ticket size={12} />
                                            <span>{raffle.ticket_price} Ticket</span>
                                        </div>
                                    </div>

                                    <div className="bg-casino-dark-850 px-3 py-2 rounded-lg mb-3 flex justify-between items-center">
                                        <span className="text-xs text-casino-slate-500">Your Entries</span>
                                        <span className="font-mono font-bold text-white">{myEntries[raffle.id] || 0}</span>
                                    </div>

                                    <button
                                        onClick={() => handleJoinRaffle(raffle.id, raffle.ticket_price)}
                                        className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2"
                                    >
                                        <Ticket size={14} />
                                        Join ({raffle.ticket_price} Tix)
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const StreakRewardCard = ({ config, currentStreak, isClaimed, onClaim }: { config: RewardConfig, currentStreak: number, isClaimed: boolean, onClaim: () => void }) => {
    const isUnlocked = currentStreak >= config.milestone;
    const progress = Math.min(100, (currentStreak / config.milestone) * 100);
    const isSoldOut = config.max_claims !== null && config.max_claims !== undefined && (config.total_claimed || 0) >= config.max_claims;

    return (
        <div className={clsx(
            "relative p-3 rounded-lg border transition-all",
            isClaimed ? "bg-casino-dark-850 border-white/5 opacity-50" :
                isSoldOut ? "bg-casino-dark-850 border-white/5 opacity-60 grayscale" :
                    isUnlocked ? "bg-casino-dark-800 border-casino-gold-500/30 shadow-[0_0_10px_rgba(255,204,0,0.1)]" :
                        "bg-casino-dark-850 border-white/5"
        )}>
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="text-xl font-black text-white">{config.milestone}</div>
                    <div>
                        {config.reward_type === 'balance' ? (
                            <div className="text-casino-gold-500 font-bold text-sm">₱ {config.reward_value?.toLocaleString()}</div>
                        ) : (
                            <div className="text-purple-400 font-bold text-sm">{config.item_name}</div>
                        )}
                        <div className="text-[10px] text-casino-slate-500 uppercase">Streak</div>
                    </div>
                </div>

                {isClaimed ? (
                    <div className="flex items-center gap-1 text-green-500 text-[10px] font-bold bg-green-500/10 px-2 py-1 rounded">
                        <Check size={10} /> Claimed
                    </div>
                ) : isSoldOut ? (
                    <div className="flex items-center gap-1 text-red-500 text-[10px] font-bold bg-red-500/10 px-2 py-1 rounded">
                        <AlertOctagon size={10} /> Sold Out
                    </div>
                ) : isUnlocked ? (
                    <button
                        onClick={onClaim}
                        className="btn-casino-primary px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1"
                    >
                        <Gift size={10} /> Claim
                    </button>
                ) : (
                    <div className="flex items-center gap-1 text-casino-slate-600 text-[10px] font-bold">
                        <Lock size={10} /> Locked
                    </div>
                )}
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-black/50 h-1 rounded-full overflow-hidden mt-2">
                <div className={clsx("h-full transition-all", isUnlocked ? "bg-casino-gold-500" : "bg-casino-slate-600")} style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between mt-1">
                <div className="text-[10px] text-casino-slate-500 font-mono">{currentStreak} / {config.milestone}</div>
                <div className="text-[10px] text-casino-slate-500 font-mono">{config.total_claimed || 0} / {config.max_claims || '∞'}</div>
            </div>
        </div>
    );
};
