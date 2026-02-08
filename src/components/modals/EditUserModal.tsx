import React, { useState, useEffect } from 'react';
import { X, Edit, Loader } from 'lucide-react';
import type { UserRole, Profile } from '../../types';
import { apiFetchJson } from '../../lib/apiClient';

interface EditUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    user: Profile | null;
}

export const EditUserModal = ({ isOpen, onClose, onSuccess, user }: EditUserModalProps) => {
    const [username, setUsername] = useState('');
    const [role, setRole] = useState<UserRole>('user');
    const [balance, setBalance] = useState(0);
    const [status, setStatus] = useState<'pending' | 'active' | 'banned'>('active');
    const [winStreak, setWinStreak] = useState(0);
    const [loseStreak, setLoseStreak] = useState(0);
    const [tickets, setTickets] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (user) {
            setUsername(user.username);
            setRole(user.role);
            setBalance(user.balance); // Updated to use balance
            setStatus(user.status); // Set status from user
            setWinStreak(user.win_streak || 0);
            setLoseStreak(user.lose_streak || 0);
            setTickets(user.tickets || 0);
        }
    }, [user]);

    if (!isOpen || !user) return null;

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            await apiFetchJson<{ profile: Profile }>('/api/admin/update-user', {
                body: {
                    userId: user.id,
                    updates: {
                        username,
                        role,
                        balance,
                        status,
                        win_streak: winStreak,
                        lose_streak: loseStreak,
                        tickets
                    }
                }
            });

            onSuccess();
            onClose();
            alert('User updated successfully!');
        } catch (err: any) {
            console.error("Update error:", err);
            setError(err.message || 'Failed to update user');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-neutral-800 rounded-xl border border-neutral-700 w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-neutral-700 flex justify-between items-center bg-neutral-900/50 sticky top-0 backdrop-blur-md">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Edit className="w-5 h-5 text-blue-500" />
                        Edit User
                    </h3>
                    <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6">
                    {error && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleUpdate} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-neutral-400 mb-1">Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                                placeholder="johndoe123"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-neutral-400 mb-1">Role</label>
                            <div className="grid grid-cols-2 gap-2">
                                {(['user', 'agent', 'master_agent', 'loader', 'admin'] as UserRole[]).map((r) => (
                                    <button
                                        key={r}
                                        type="button"
                                        onClick={() => setRole(r)}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium capitalize border transition-all ${role === r
                                            ? 'bg-blue-600 border-blue-500 text-white'
                                            : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-500'
                                            }`}
                                    >
                                        {r.replace('_', ' ')}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-neutral-400 mb-1">Account Balance</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-casino-gold-400 font-bold">₱</span>
                                    <input
                                        type="number"
                                        value={balance}
                                        onChange={(e) => setBalance(Number(e.target.value))}
                                        className="w-full bg-neutral-900 border border-white/10 rounded-xl py-3 pl-8 pr-4 text-white outline-none focus:border-casino-gold-400 transition-all font-mono"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-neutral-400 mb-1">Tickets</label>
                                <input
                                    type="number"
                                    value={tickets}
                                    onChange={(e) => setTickets(Number(e.target.value))}
                                    className="w-full bg-neutral-900 border border-white/10 rounded-xl py-3 px-4 text-yellow-500 font-bold outline-none focus:border-yellow-500 transition-all font-mono"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-neutral-400 mb-1">Win Streak</label>
                                <input
                                    type="number"
                                    value={winStreak}
                                    onChange={(e) => setWinStreak(Number(e.target.value))}
                                    className="w-full bg-neutral-900 border border-white/10 rounded-xl py-3 px-4 text-green-500 font-bold outline-none focus:border-green-500 transition-all font-mono"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-neutral-400 mb-1">Lose Streak</label>
                                <input
                                    type="number"
                                    value={loseStreak}
                                    onChange={(e) => setLoseStreak(Number(e.target.value))}
                                    className="w-full bg-neutral-900 border border-white/10 rounded-xl py-3 px-4 text-red-500 font-bold outline-none focus:border-red-500 transition-all font-mono"
                                />
                            </div>
                        </div>

                        <div className="pt-4 flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-2 bg-neutral-700 text-white rounded-lg hover:bg-neutral-600 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading && <Loader className="w-4 h-4 animate-spin" />}
                                Update User
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};
