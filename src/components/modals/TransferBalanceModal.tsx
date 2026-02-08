import React, { useState } from 'react';
import { X, ArrowRightLeft, Plus, Loader } from 'lucide-react';
import { useToast } from '../ui/Toast';
import type { Profile } from '../../types';
import { apiFetchJson } from '../../lib/apiClient';

interface TransferBalanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (updatedUsers?: { id: string; balance: number }[]) => void;
    user: Profile | null;
    adminId: string;
}

export const TransferBalanceModal = ({ isOpen, onClose, onSuccess, user, adminId }: TransferBalanceModalProps) => {
    const { showToast } = useToast();
    const [amount, setAmount] = useState(0);
    const [action, setAction] = useState<'add' | 'transfer'>('add');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen || !user) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (amount <= 0) {
            setError('Amount must be greater than 0');
            setLoading(false);
            return;
        }

        try {
            const { updatedProfiles } = await apiFetchJson<{
                updatedProfiles: { id: string; balance: number }[];
            }>('/api/admin/balance', {
                body: { action, userId: user.id, amount, adminId },
            });

            if (action === 'add') {
                showToast(`Successfully added P${amount.toLocaleString()} to ${user.username}'s balance!`, 'success');
            } else {
                showToast(`Successfully transferred P${amount.toLocaleString()} to ${user.username}!`, 'success');
            }

            setAmount(0);
            onSuccess(updatedProfiles);
            onClose();
        } catch (err: any) {
            console.error('Transaction error:', err);
            setError(err.message || 'Failed to complete transaction');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="bg-neutral-800 rounded-xl border border-neutral-700 w-full max-w-md shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-neutral-700 flex justify-between items-center bg-neutral-900/50">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <ArrowRightLeft className="w-5 h-5 text-green-500" />
                        Manage Balance
                    </h3>
                    <button onClick={onClose} className="text-neutral-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6">
                    <div className="mb-4 p-4 bg-neutral-900/50 rounded-lg border border-neutral-700">
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="text-sm text-neutral-400">User</p>
                                <p className="text-white font-bold">{user.username}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm text-neutral-400">Current Balance</p>
                                <p className="text-white font-bold font-mono">P {(Number(user.balance) || 0).toLocaleString()}</p>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-neutral-400 mb-2">Action Type</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setAction('add')}
                                    className={`px-4 py-3 rounded-lg text-sm font-medium border transition-all flex items-center justify-center gap-2 ${
                                        action === 'add'
                                            ? 'bg-green-600 border-green-500 text-white'
                                            : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-500'
                                    }`}
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Balance
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAction('transfer')}
                                    className={`px-4 py-3 rounded-lg text-sm font-medium border transition-all flex items-center justify-center gap-2 ${
                                        action === 'transfer'
                                            ? 'bg-blue-600 border-blue-500 text-white'
                                            : 'bg-neutral-900 border-neutral-700 text-neutral-400 hover:border-neutral-500'
                                    }`}
                                >
                                    <ArrowRightLeft className="w-4 h-4" />
                                    Transfer
                                </button>
                            </div>
                            <p className="text-xs text-neutral-500 mt-2">
                                {action === 'add' ? 'Add balance without deducting from your account' : 'Transfer balance from your account to this user'}
                            </p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-neutral-400 mb-1">Amount</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">P</span>
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(Number(e.target.value))}
                                    className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-2.5 pl-8 text-white focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none transition-all"
                                    placeholder="0"
                                    min="0"
                                    step="0.01"
                                    required
                                />
                            </div>
                        </div>

                        <div className="p-4 bg-neutral-900/50 rounded-lg border border-neutral-700">
                            <p className="text-sm text-neutral-400 mb-2">Preview</p>
                            <div className="space-y-1">
                                <div className="flex justify-between text-sm">
                                    <span className="text-neutral-400">New Balance:</span>
                                    <span className="text-white font-mono font-bold">
                                        P {((Number(user.balance) || 0) + amount).toLocaleString()}
                                    </span>
                                </div>
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
                                disabled={loading || amount <= 0}
                                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading && <Loader className="w-4 h-4 animate-spin" />}
                                {action === 'add' ? 'Add Balance' : 'Transfer'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

