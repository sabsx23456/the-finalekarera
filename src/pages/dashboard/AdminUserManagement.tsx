import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Profile } from '../../types';
import { Search, Shield, Ban, CheckCircle, UserPlus, Edit, DollarSign, ChevronLeft, ChevronRight } from 'lucide-react';
import { CreateUserModal } from '../../components/modals/CreateUserModal';
import { EditUserModal } from '../../components/modals/EditUserModal';
import { TransferBalanceModal } from '../../components/modals/TransferBalanceModal';
import { useAuthStore } from '../../lib/store';
import clsx from 'clsx';
import { apiFetchJson } from '../../lib/apiClient';

const ITEMS_PER_PAGE = 8;

export const AdminUserManagement = () => {
    const { session } = useAuthStore();
    const [users, setUsers] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
    const [searchParams] = useSearchParams();
    const [stats, setStats] = useState<Record<string, { commission: number, cashIn: number, cashOut: number }>>({});

    useEffect(() => {
        setCurrentPage(1);
    }, [filter]);

    useEffect(() => {
        const roleParam = searchParams.get('role');
        if (roleParam) {
            setFilter(roleParam);
        }
    }, [searchParams]);

    useEffect(() => {
        fetchUsers();

        // Subscribe to profile updates for live balance reflection
        const channel = supabase
            .channel('admin-profiles-sync')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'profiles'
            }, () => {
                fetchUsers();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (data) {
                setUsers(data as Profile[]);
                fetchFinancialStats(data.map(u => u.id));
            }
        } catch (error) {
            console.error("Error fetching users:", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchFinancialStats = async (userIds: string[]) => {
        try {
            const [commData, transData] = await Promise.all([
                supabase.from('commissions').select('recipient_id, amount'),
                supabase.from('transactions').select('receiver_id, amount, type').in('type', ['load', 'withdraw'])
            ]);

            const newStats: Record<string, { commission: number, cashIn: number, cashOut: number }> = {};

            // Initialize
            userIds.forEach(id => newStats[id] = { commission: 0, cashIn: 0, cashOut: 0 });

            // Aggregate Commissions
            commData.data?.forEach((c: any) => {
                if (newStats[c.recipient_id]) {
                    newStats[c.recipient_id].commission += Number(c.amount);
                }
            });

            // Aggregate Transactions
            transData.data?.forEach((t: any) => {
                if (newStats[t.receiver_id]) {
                    if (t.type === 'load') newStats[t.receiver_id].cashIn += Number(t.amount);
                    if (t.type === 'withdraw') newStats[t.receiver_id].cashOut += Number(t.amount);
                }
            });

            setStats(newStats);

        } catch (error) {
            console.error("Error calculating financial stats:", error);
        }
    };

    const toggleBan = async (user: Profile) => {
        if (!confirm(`Are you sure you want to ${user.banned ? 'unban' : 'ban'} ${user.username}?`)) return;

        try {
            await apiFetchJson('/api/admin/update-user', {
                body: {
                    userId: user.id,
                    updates: {
                        banned: !user.banned,
                        status: !user.banned ? 'banned' : 'active'
                    }
                }
            });

            // Optimistic update
            setUsers(users.map(u => u.id === user.id ? { ...u, banned: !user.banned, status: !user.banned ? 'banned' : 'active' } : u));
            alert(`User ${user.banned ? 'unbanned' : 'banned'} successfully.`);
        } catch (error) {
            console.error("Error toggling ban:", error);
            alert("Failed to update user status.");
        }
    };

    const filteredUsers = users.filter(user =>
        user.username?.toLowerCase().includes(filter.toLowerCase()) ||
        user.role.toLowerCase().includes(filter.toLowerCase())
    );

    const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
    const paginatedUsers = filteredUsers.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    return (
        <div className="bg-neutral-800 rounded-xl border border-neutral-700 overflow-hidden">
            <div className="p-6 border-b border-neutral-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Shield className="w-5 h-5 text-red-500" />
                    User Management
                </h2>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-bold transition-colors text-sm"
                    >
                        <UserPlus className="w-4 h-4" />
                        New User
                    </button>
                </div>
            </div>

            <div className="p-4 bg-neutral-900/50 border-b border-neutral-700">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-500 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Search users by name or role..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="bg-neutral-800 border border-neutral-600 text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-red-500 w-full"
                    />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-neutral-900/50 text-neutral-400 text-sm uppercase">
                        <tr>
                            <th className="p-4 font-medium">Username</th>
                            <th className="p-4 font-medium">Role</th>
                            <th className="p-4 font-medium">Last Login</th>
                            <th className="p-4 font-medium">Balance</th>
                            <th className="p-4 font-medium text-center">WS</th>
                            <th className="p-4 font-medium text-center">LS</th>
                            <th className="p-4 font-medium text-center">Tickets</th>
                            <th className="p-4 font-medium text-right text-yellow-500">Commission</th>
                            <th className="p-4 font-medium text-right text-green-500">Cash In</th>
                            <th className="p-4 font-medium text-right text-red-400">Cash Out</th>
                            <th className="p-4 font-medium">Status</th>
                            <th className="p-4 font-medium text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-700">
                        {loading ? (
                            <tr>
                                <td colSpan={9} className="p-8 text-center text-neutral-500">Loading users...</td>
                            </tr>
                        ) : paginatedUsers.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="p-8 text-center text-neutral-500">No users found.</td>
                            </tr>
                        ) : (
                            paginatedUsers.map((user) => (
                                <tr key={user.id} className={`hover:bg-neutral-700/50 transition-colors ${user.banned ? 'bg-red-900/10' : ''}`}>
                                    <td className="p-4 font-medium text-white">
                                        <div className="flex flex-col">
                                            <span className={user.banned ? 'line-through text-red-400' : ''}>{user.username}</span>
                                            {user.banned && <span className="text-[10px] text-red-500 font-bold uppercase">BANNED</span>}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className={clsx(
                                            "px-2 py-1 rounded text-xs font-bold uppercase",
                                            user.role === 'admin' ? "bg-red-500/10 text-red-500" :
                                                user.role === 'master_agent' ? "bg-purple-500/10 text-purple-500" :
                                                    user.role === 'agent' ? "bg-blue-500/10 text-blue-500" :
                                                        user.role === 'loader' ? "bg-yellow-500/10 text-yellow-500" :
                                                            "bg-neutral-500/10 text-neutral-400"
                                        )}>
                                            {user.role.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="p-4 text-sm text-neutral-400">
                                        {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                                    </td>
                                    <td className="p-4 font-mono text-neutral-300">₱ {(Number(user.balance) || 0).toLocaleString()}</td>
                                    <td className="p-4 font-mono text-center text-green-500 font-bold">{user.win_streak || 0}</td>
                                    <td className="p-4 font-mono text-center text-red-500 font-bold">{user.lose_streak || 0}</td>
                                    <td className="p-4 font-mono text-center text-yellow-500 font-bold">{user.tickets || 0}</td>

                                    {/* Financial Stats Columns */}
                                    <td className="p-4 text-right font-mono text-yellow-500">
                                        ₱ {stats[user.id]?.commission.toLocaleString() || '0.00'}
                                    </td>
                                    <td className="p-4 text-right font-mono text-green-500">
                                        ₱ {stats[user.id]?.cashIn.toLocaleString() || '0.00'}
                                    </td>
                                    <td className="p-4 text-right font-mono text-red-400">
                                        ₱ {stats[user.id]?.cashOut.toLocaleString() || '0.00'}
                                    </td>

                                    <td className="p-4">
                                        <span className={`flex items-center text-sm ${user.banned ? 'text-red-500' : 'text-green-500'}`}>
                                            {user.banned ? <Ban className="w-4 h-4 mr-1" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                                            {user.banned ? 'Banned' : 'Active'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => {
                                                    setSelectedUser(user);
                                                    setIsEditModalOpen(true);
                                                }}
                                                className="text-neutral-400 hover:text-blue-500 transition-colors p-2 hover:bg-blue-500/10 rounded"
                                                title="Edit User"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setSelectedUser(user);
                                                    setIsTransferModalOpen(true);
                                                }}
                                                className="text-neutral-400 hover:text-green-500 transition-colors p-2 hover:bg-green-500/10 rounded"
                                                title="Manage Balance"
                                            >
                                                <DollarSign className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => toggleBan(user)}
                                                className={`transition-colors p-2 rounded ${user.banned ? 'text-red-500 hover:bg-red-500/20' : 'text-neutral-400 hover:text-red-500 hover:bg-red-500/10'}`}
                                                title={user.banned ? "Unban User" : "Ban User"}
                                            >
                                                <Ban className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="p-4 border-t border-neutral-700 flex items-center justify-between">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-2 text-neutral-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm text-neutral-400 font-medium">
                        Page {currentPage} of {totalPages}
                    </span>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2 text-neutral-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            )}


            {session && (
                <>
                    <CreateUserModal
                        isOpen={isCreateModalOpen}
                        onClose={() => setIsCreateModalOpen(false)}
                        onSuccess={() => {
                            fetchUsers();
                            setIsCreateModalOpen(false);
                        }}
                        creatorId={session.user.id}
                    />
                    <EditUserModal
                        isOpen={isEditModalOpen}
                        onClose={() => {
                            setIsEditModalOpen(false);
                            setSelectedUser(null);
                        }}
                        onSuccess={() => {
                            fetchUsers();
                            setIsEditModalOpen(false);
                            setSelectedUser(null);
                        }}
                        user={selectedUser}
                    />
                    <TransferBalanceModal
                        isOpen={isTransferModalOpen}
                        onClose={() => {
                            setIsTransferModalOpen(false);
                            setSelectedUser(null);
                        }}
                        onSuccess={(updatedProfiles) => {
                            if (updatedProfiles) {
                                setUsers(prev => prev.map(u => {
                                    const update = updatedProfiles.find(p => p.id === u.id);
                                    return update ? { ...u, balance: update.balance } : u;
                                }));
                            }
                            fetchUsers(); // Still fetch for consistency
                            setIsTransferModalOpen(false);
                            setSelectedUser(null);
                        }}
                        user={selectedUser}
                        adminId={session.user.id}
                    />
                </>
            )}
        </div>
    );
};
