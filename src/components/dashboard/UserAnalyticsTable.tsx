
import { useState, useEffect } from 'react';
import { Search, Trophy, TrendingDown, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import type { UserBetStats } from '../../hooks/useAnalytics';

interface UserAnalyticsTableProps {
    data: UserBetStats[];
}

const ITEMS_PER_PAGE = 8;

export const UserAnalyticsTable = ({ data }: UserAnalyticsTableProps) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<keyof UserBetStats>('totalWagered');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [currentPage, setCurrentPage] = useState(1);

    const handleSort = (field: keyof UserBetStats) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm]);

    const sortedData = [...data]
        .filter(user => user.username.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
            const valA = a[sortField];
            const valB = b[sortField];
            if (typeof valA === 'number' && typeof valB === 'number') {
                return sortDirection === 'asc' ? valA - valB : valB - valA;
            }
            if (typeof valA === 'string' && typeof valB === 'string') {
                return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            return 0;
        });

    const totalPages = Math.ceil(sortedData.length / ITEMS_PER_PAGE);
    const paginatedData = sortedData.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    return (
        <div className="glass-panel rounded-2xl overflow-hidden border-casino-gold-400/10">
            <div className="p-6 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h3 className="text-white font-display font-black text-lg uppercase tracking-wider">User Analytics</h3>
                    <p className="text-casino-slate-500 text-xs mt-1">Win rates, betting volume, and cash flow</p>
                </div>
                <div className="relative w-full md:w-64">
                    <input
                        type="text"
                        placeholder="Search user..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-casino-dark-800/50 text-white pl-10 pr-4 py-2 rounded-lg text-xs font-medium border border-white/5 focus:border-casino-gold-400 outline-none transition-all placeholder-casino-slate-600"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-casino-slate-500 w-4 h-4" />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-black/20">
                        <tr>
                            <th className="px-6 py-4 text-left text-[10px] font-black text-casino-gold-400 uppercase tracking-[0.2em]">User</th>
                            <th
                                className="px-6 py-4 text-left text-[10px] font-black text-casino-gold-400 uppercase tracking-[0.2em] cursor-pointer hover:text-white"
                                onClick={() => handleSort('referralAgent')}
                            >
                                Agent
                            </th>
                            <th
                                className="px-6 py-4 text-right text-[10px] font-black text-casino-gold-400 uppercase tracking-[0.2em] cursor-pointer hover:text-white"
                                onClick={() => handleSort('totalWagered')}
                            >
                                Wagered
                            </th>
                            <th
                                className="px-6 py-4 text-right text-[10px] font-black text-casino-gold-400 uppercase tracking-[0.2em] cursor-pointer hover:text-white"
                                onClick={() => handleSort('totalCashIn')}
                            >
                                Cash In
                            </th>
                            <th
                                className="px-6 py-4 text-right text-[10px] font-black text-casino-gold-400 uppercase tracking-[0.2em] cursor-pointer hover:text-white"
                                onClick={() => handleSort('totalCashOut')}
                            >
                                Cash Out
                            </th>
                            <th
                                className="px-6 py-4 text-right text-[10px] font-black text-casino-gold-400 uppercase tracking-[0.2em] cursor-pointer hover:text-white"
                                onClick={() => handleSort('netProfit')}
                            >
                                P/L
                            </th>
                            <th
                                className="px-6 py-4 text-right text-[10px] font-black text-casino-gold-400 uppercase tracking-[0.2em] cursor-pointer hover:text-white"
                                onClick={() => handleSort('winRate')}
                            >
                                Win Rate
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {paginatedData.length > 0 ? (
                            paginatedData.map((user) => (
                                <tr key={user.userId} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-white">{user.username}</span>
                                            <span className="text-[10px] text-casino-slate-500">{user.totalBets} Bets</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-xs font-medium text-casino-gold-400/80 bg-casino-gold-400/10 px-2 py-1 rounded">
                                            {user.referralAgent}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="text-sm font-medium text-casino-slate-300">
                                            ₱{user.totalWagered.toLocaleString()}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="text-xs font-bold text-green-400">
                                            +₱{user.totalCashIn.toLocaleString()}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className="text-xs font-bold text-red-400">
                                            -₱{user.totalCashOut.toLocaleString()}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <span className={`text-sm font-bold ${user.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {user.netProfit >= 0 ? '+' : ''}₱{user.netProfit.toLocaleString()}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <span className={`text-sm font-bold ${user.winRate > 50 ? 'text-green-400' : 'text-casino-slate-300'}`}>
                                                {user.winRate.toFixed(1)}%
                                            </span>
                                            {user.winRate > 60 && <Trophy className="w-3 h-3 text-yellow-500" />}
                                            {user.winRate < 40 && <TrendingDown className="w-3 h-3 text-red-500" />}
                                            {user.winRate >= 40 && user.winRate <= 60 && <TrendingUp className="w-3 h-3 text-blue-500" />}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={7} className="px-6 py-12 text-center text-casino-slate-500 text-sm">
                                    No user data found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="p-4 border-t border-white/5 flex items-center justify-between">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-2 text-casino-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <span className="text-sm text-casino-slate-400 font-medium font-display tracking-wide">
                        Page <span className="text-white">{currentPage}</span> of <span className="text-white">{totalPages}</span>
                    </span>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2 text-casino-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>
            )}
        </div>
    );
};
