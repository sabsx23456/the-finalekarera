import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Trophy, Gift, Plus, Save } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import type { RewardConfig, RaffleEvent } from '../../types';
import clsx from 'clsx';

export const RewardManagementPage = () => {
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState<'streaks' | 'raffles'>('streaks');

    // Streaks State
    const [configs, setConfigs] = useState<RewardConfig[]>([]);
    const milestones = [5, 10, 15, 20, 25, 30];

    // Raffles State
    const [raffles, setRaffles] = useState<RaffleEvent[]>([]);
    const [isCreateRaffleOpen, setIsCreateRaffleOpen] = useState(false);
    const [newRaffle, setNewRaffle] = useState({ title: '', ticket_price: 1, draw_date: '', image_url: '' });

    const [editingRaffleId, setEditingRaffleId] = useState<string | null>(null);

    useEffect(() => {
        if (activeTab === 'streaks') fetchConfigs();
        else fetchRaffles();
    }, [activeTab]);

    const fetchConfigs = async () => {
        const { data } = await supabase.from('reward_configs').select('*').order('milestone', { ascending: true });
        if (data) setConfigs(data as RewardConfig[]);
    };

    const fetchRaffles = async () => {
        const { data } = await supabase.from('raffle_events').select('*').order('created_at', { ascending: false });
        if (data) setRaffles(data as RaffleEvent[]);
    };

    const handleSaveConfig = async (config: Partial<RewardConfig>) => {
        try {
            const { error } = await supabase.from('reward_configs').upsert(config).select();
            if (error) throw error;
            showToast('Reward configuration saved', 'success');
            fetchConfigs();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleCreateOrUpdateRaffle = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingRaffleId) {
                // Update
                const { error } = await supabase.from('raffle_events')
                    .update({
                        title: newRaffle.title,
                        ticket_price: newRaffle.ticket_price,
                        draw_date: newRaffle.draw_date,
                        image_url: newRaffle.image_url,
                    })
                    .eq('id', editingRaffleId);

                if (error) throw error;
                showToast('Raffle updated successfully', 'success');
            } else {
                // Create
                const { error } = await supabase.from('raffle_events').insert({
                    title: newRaffle.title,
                    ticket_price: newRaffle.ticket_price,
                    draw_date: newRaffle.draw_date,
                    image_url: newRaffle.image_url,
                    status: 'active'
                });
                if (error) throw error;
                showToast('Raffle event created successfully', 'success');
            }

            setIsCreateRaffleOpen(false);
            setEditingRaffleId(null);
            setNewRaffle({ title: '', ticket_price: 1, draw_date: '', image_url: '' });
            fetchRaffles();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const handleEditRaffle = (raffle: RaffleEvent) => {
        setNewRaffle({
            title: raffle.title,
            ticket_price: raffle.ticket_price,
            draw_date: raffle.draw_date.split('T')[0], // Ensure date format matches input
            image_url: raffle.image_url || ''
        });
        setEditingRaffleId(raffle.id);
        setIsCreateRaffleOpen(true);
    };

    const handleDeleteRaffle = async (id: string, title: string) => {
        if (!confirm(`Are you sure you want to delete the raffle "${title}"? This cannot be undone.`)) return;

        try {
            const { error } = await supabase.from('raffle_events').delete().eq('id', id);
            if (error) throw error;
            showToast('Raffle deleted successfully', 'success');
            fetchRaffles();
        } catch (error: any) {
            showToast(error.message, 'error');
        }
    };

    const getConfig = (type: 'win_streak' | 'lose_streak', milestone: number) => {
        return configs.find(c => c.type === type && c.milestone === milestone) || {
            type,
            milestone,
            reward_type: 'balance',
            reward_value: 0,
            is_active: true,
            max_claims: 0 // Default logic handled by DB NULL, but here 0 for controlled input if needed
        } as Partial<RewardConfig>;
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto px-4 py-8 text-white">
            <h1 className="text-3xl font-display font-black mb-6 uppercase tracking-tighter flex items-center gap-3">
                <Gift className="text-yellow-500 w-8 h-8" />
                Reward Management
            </h1>

            <div className="flex gap-4 border-b border-white/10 mb-6">
                <button
                    onClick={() => setActiveTab('streaks')}
                    className={clsx("px-6 py-3 font-bold border-b-2 transition-all", activeTab === 'streaks' ? "border-yellow-500 text-yellow-500" : "border-transparent text-neutral-400 hover:text-white")}
                >
                    Streak Rewards
                </button>
                <button
                    onClick={() => setActiveTab('raffles')}
                    className={clsx("px-6 py-3 font-bold border-b-2 transition-all", activeTab === 'raffles' ? "border-yellow-500 text-yellow-500" : "border-transparent text-neutral-400 hover:text-white")}
                >
                    Weekly Raffles
                </button>
            </div>

            {activeTab === 'streaks' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* WIN STREAKS */}
                    <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-6">
                        <h2 className="text-xl font-black text-green-500 uppercase tracking-widest flex items-center gap-2">
                            <Trophy size={20} /> Win Streaks
                        </h2>
                        {milestones.map(ms => {
                            const conf = getConfig('win_streak', ms);
                            return (
                                <RewardConfigRow
                                    key={`win-${ms}`}
                                    milestone={ms}
                                    config={conf}
                                    onSave={handleSaveConfig}
                                    color="green"
                                />
                            );
                        })}
                    </div>

                    {/* LOSE STREAKS */}
                    <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-6">
                        <h2 className="text-xl font-black text-red-500 uppercase tracking-widest flex items-center gap-2">
                            <Trophy size={20} /> Lose Streaks
                        </h2>
                        {milestones.map(ms => {
                            const conf = getConfig('lose_streak', ms);
                            return (
                                <RewardConfigRow
                                    key={`lose-${ms}`}
                                    milestone={ms}
                                    config={conf}
                                    onSave={handleSaveConfig}
                                    color="red"
                                />
                            );
                        })}
                    </div>
                </div>
            )}

            {activeTab === 'raffles' && (
                <div className="space-y-6">
                    <div className="flex justify-end">
                        <button
                            onClick={() => {
                                setEditingRaffleId(null);
                                setNewRaffle({ title: '', ticket_price: 1, draw_date: '', image_url: '' });
                                setIsCreateRaffleOpen(true);
                            }}
                            className="bg-yellow-500 hover:bg-yellow-400 text-black px-4 py-2 rounded-lg font-bold flex items-center gap-2"
                        >
                            <Plus size={18} /> Create Raffle
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {raffles.map(raffle => (
                            <div key={raffle.id} className="bg-neutral-800 rounded-xl border border-white/10 overflow-hidden relative group">
                                <div className="h-48 bg-neutral-900 relative">
                                    {raffle.image_url ? (
                                        <img src={raffle.image_url} alt={raffle.title} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-neutral-600">
                                            <Gift size={48} />
                                        </div>
                                    )}
                                    <div className={clsx(
                                        "absolute top-2 right-2 px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest",
                                        raffle.status === 'active' ? "bg-green-500 text-black" : "bg-neutral-600 text-white"
                                    )}>
                                        {raffle.status}
                                    </div>
                                </div>
                                <div className="p-4">
                                    <h3 className="font-bold text-lg text-white mb-2">{raffle.title}</h3>
                                    <div className="flex justify-between text-sm text-neutral-400 mb-4">
                                        <span>Draw Date: {new Date(raffle.draw_date).toLocaleDateString()}</span>
                                        <span>Price: <span className="text-yellow-500 font-bold">{raffle.ticket_price} Ticket(s)</span></span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleEditRaffle(raffle)}
                                            className="flex-1 py-1.5 bg-neutral-700 hover:bg-neutral-600 rounded text-xs font-bold uppercase transition-colors"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDeleteRaffle(raffle.id, raffle.title)}
                                            className="flex-1 py-1.5 bg-red-900/50 hover:bg-red-900 text-red-500 rounded text-xs font-bold uppercase transition-colors border border-red-500/20"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* CREATE RAFFLE MODAL */}
            {isCreateRaffleOpen && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-neutral-800 w-full max-w-md p-6 rounded-2xl border border-white/10">
                        <h2 className="text-xl font-bold mb-4">{editingRaffleId ? 'Edit Raffle' : 'Create New Raffle'}</h2>
                        <form onSubmit={handleCreateOrUpdateRaffle} className="space-y-4">
                            <div>
                                <label className="text-xs uppercase font-bold text-neutral-400">Title</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full bg-neutral-900 border border-white/10 rounded p-3 mt-1 outline-none focus:border-yellow-500"
                                    value={newRaffle.title}
                                    onChange={e => setNewRaffle({ ...newRaffle, title: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs uppercase font-bold text-neutral-400">Image Poster URL</label>
                                <input
                                    type="url"
                                    placeholder="https://..."
                                    className="w-full bg-neutral-900 border border-white/10 rounded p-3 mt-1 outline-none focus:border-yellow-500"
                                    value={newRaffle.image_url}
                                    onChange={e => setNewRaffle({ ...newRaffle, image_url: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs uppercase font-bold text-neutral-400">Ticket Price</label>
                                    <input
                                        type="number"
                                        min="1"
                                        required
                                        className="w-full bg-neutral-900 border border-white/10 rounded p-3 mt-1 outline-none focus:border-yellow-500"
                                        value={newRaffle.ticket_price}
                                        onChange={e => setNewRaffle({ ...newRaffle, ticket_price: parseInt(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs uppercase font-bold text-neutral-400">Draw Date</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full bg-neutral-900 border border-white/10 rounded p-3 mt-1 outline-none focus:border-yellow-500 text-white"
                                        value={newRaffle.draw_date}
                                        onChange={e => setNewRaffle({ ...newRaffle, draw_date: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 mt-6">
                                <button type="button" onClick={() => setIsCreateRaffleOpen(false)} className="flex-1 py-3 bg-neutral-700 hover:bg-neutral-600 rounded-lg font-bold">Cancel</button>
                                <button type="submit" className="flex-1 py-3 bg-yellow-500 hover:bg-yellow-400 text-black rounded-lg font-bold">{editingRaffleId ? 'Save Changes' : 'Create Raffle'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

const RewardConfigRow = ({ milestone, config, onSave, color }: { milestone: number, config: Partial<RewardConfig>, onSave: (next: Partial<RewardConfig>) => void, color: 'green' | 'red' }) => {
    const [localConfig, setLocalConfig] = useState(config);
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => { setLocalConfig(config); }, [config]);

    const handleChange = (field: string, value: any) => {
        setLocalConfig((prev: Partial<RewardConfig>) => ({ ...prev, [field]: value }));
        setHasChanges(true);
    };

    const handleSave = () => {
        onSave(localConfig);
        setHasChanges(false);
    };

    const totalClaimed = config.total_claimed || 0;
    const maxClaims = localConfig.max_claims;

    return (
        <div className="bg-neutral-900/50 p-4 rounded-xl border border-white/5 flex flex-col gap-3">
            <div className={`flex justify-between items-center text-${color}-500 font-black uppercase tracking-widest text-sm`}>
                <span>Milestone: {milestone}</span>
                {hasChanges && (
                    <button onClick={handleSave} className="text-xs bg-white text-black px-2 py-1 rounded flex items-center gap-1 hover:bg-neutral-200 shadow-lg animate-pulse">
                        <Save size={12} /> Save Changes
                    </button>
                )}
            </div>

            {/* TYPE & VALUE SELECTOR */}
            <div className="flex gap-2">
                <select
                    className="bg-neutral-800 text-xs rounded border border-white/10 p-2 outline-none"
                    value={localConfig.reward_type}
                    onChange={e => handleChange('reward_type', e.target.value)}
                >
                    <option value="balance">Balance Reward</option>
                    <option value="item">Item Reward</option>
                </select>

                {localConfig.reward_type === 'balance' ? (
                    <div className="flex items-center gap-2 flex-1 bg-neutral-800 rounded border border-white/10 px-2">
                        <span className="text-xs text-neutral-500">₱</span>
                        <input
                            type="number"
                            className="bg-transparent text-sm w-full outline-none py-2"
                            placeholder="Amount"
                            value={localConfig.reward_value ?? ''}
                            onChange={e => handleChange('reward_value', e.target.value ? Number(e.target.value) : 0)}
                        />
                    </div>
                ) : (
                    <input
                        type="text"
                        className="flex-1 bg-neutral-800 text-sm rounded border border-white/10 p-2 outline-none"
                        placeholder="Item Name"
                        value={localConfig.item_name || ''}
                        onChange={e => handleChange('item_name', e.target.value)}
                    />
                )}
            </div>

            {/* ITEM IMAGE */}
            {localConfig.reward_type === 'item' && (
                <input
                    type="url"
                    className="w-full bg-neutral-800 text-xs rounded border border-white/10 p-2 outline-none text-neutral-400"
                    placeholder="Image URL (http://...)"
                    value={localConfig.image_url || ''}
                    onChange={e => handleChange('image_url', e.target.value)}
                />
            )}

            {/* CLAIMS LIMIT */}
            <div className="flex items-center gap-2 mt-1">
                <div className="bg-neutral-800 px-3 py-1.5 rounded-lg border border-white/10 flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-neutral-500">Claim Limit</span>
                    <input
                        type="number"
                        className="bg-transparent text-xs w-16 outline-none text-white font-mono"
                        placeholder="Unlimited"
                        value={localConfig.max_claims ?? ''}
                        onChange={e => handleChange('max_claims', e.target.value ? Number(e.target.value) : null)}
                    />
                </div>
                <div className="text-[10px] text-neutral-500 font-mono flex-1 text-right">
                    Claimed: {totalClaimed} / {maxClaims || '∞'}
                </div>
            </div>
        </div>
    );
};
