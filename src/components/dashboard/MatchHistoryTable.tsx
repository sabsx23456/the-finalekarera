import { ChevronDown, ChevronUp, History, Search } from 'lucide-react';
import { useMatchHistory } from '../../hooks/useMatchHistory';
import { useState } from 'react';

const ITEMS_PER_PAGE = 8;

export const MatchHistoryTable = () => {
    const { matches, loading, expandedMatchId, toggleMatch, referralBets, loadingBets } = useMatchHistory();
    const [currentPage, setCurrentPage] = useState(1);
    const [betsPage, setBetsPage] = useState(1);
    const [filter, setFilter] = useState('');

    const filteredMatches = matches.filter(m =>
        (m.event_name || '').toLowerCase().includes(filter.toLowerCase()) ||
        (m.team_a || '').toLowerCase().includes(filter.toLowerCase()) ||
        (m.team_b || '').toLowerCase().includes(filter.toLowerCase())
    );

    const totalPages = Math.ceil(filteredMatches.length / ITEMS_PER_PAGE);
    const paginatedMatches = filteredMatches.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    return (
        <div className="glass-panel rounded-2xl overflow-hidden border-casino-gold-400/10">
            <div className="p-6 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h3 className="text-white font-display font-black text-lg uppercase tracking-wider flex items-center gap-2">
                        <History className="text-casino-gold-400" size={20} />
                        Match History
                    </h3>
                    <p className="text-casino-slate-500 text-xs mt-1">Review past matches and betting activity</p>
                </div>
                <div className="relative w-full md:w-64">
                    <input
                        type="text"
                        placeholder="Search match..."
                        value={filter}
                        onChange={(e) => { setFilter(e.target.value); setCurrentPage(1); }}
                        className="w-full bg-casino-dark-800/50 text-white pl-10 pr-4 py-2 rounded-lg text-xs font-medium border border-white/5 focus:border-casino-gold-400 outline-none transition-all placeholder-casino-slate-600"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-casino-slate-500 w-4 h-4" />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-black/20 text-[10px] uppercase text-casino-gold-400 font-bold tracking-wider">
                        <tr>
                            <th className="p-4">Date</th>
                            <th className="p-4">Match / Event</th>
                            <th className="p-4 text-center">Winner</th>
                            <th className="p-4 text-center">Status</th>
                            <th className="p-4 text-center">Details</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-sm">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="p-8 text-center text-casino-slate-500">Loading history...</td>
                            </tr>
                        ) : paginatedMatches.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="p-8 text-center text-casino-slate-500">No completed matches found.</td>
                            </tr>
                        ) : (
                            paginatedMatches.map((match) => (
                                <>
                                    <tr
                                        key={match.id}
                                        onClick={() => { toggleMatch(match.id); setBetsPage(1); }}
                                        className={`hover:bg-white/5 transition-colors cursor-pointer ${expandedMatchId === match.id ? 'bg-white/5' : ''}`}
                                    >
                                        <td className="p-4 text-casino-slate-400 font-mono text-xs">
                                            {new Date(match.created_at).toLocaleString()}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-white">{match.team_a} vs {match.team_b}</span>
                                                <span className="text-[10px] text-casino-slate-500 uppercase">{match.event_name || 'Quick Match'}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${match.winner === 'meron' ? 'bg-red-500/10 text-red-500' :
                                                match.winner === 'wala' ? 'bg-blue-500/10 text-blue-500' :
                                                    'bg-white/10 text-white'
                                                }`}>
                                                {match.winner || 'DRAW'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className="text-[10px] bg-green-500/10 text-green-500 px-2 py-1 rounded font-bold uppercase">
                                                Completed
                                            </span>
                                        </td>
                                        <td className="p-4 text-center">
                                            {expandedMatchId === match.id ? (
                                                <ChevronUp className="w-4 h-4 text-casino-gold-400 mx-auto" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4 text-casino-slate-500 mx-auto" />
                                            )}
                                        </td>
                                    </tr>
                                    {/* Expanded Detail View */}
                                    {expandedMatchId === match.id && (
                                        <tr className="bg-black/20 shadow-inner">
                                            <td colSpan={5} className="p-4 md:p-6">
                                                <div className="bg-casino-dark-800 rounded-xl p-4 border border-white/5">
                                                    <h4 className="text-xs font-bold text-white mb-4 uppercase tracking-wider flex items-center gap-2">
                                                        Referred User Bets <span className="text-casino-slate-500">({referralBets.length})</span>
                                                    </h4>

                                                    {loadingBets ? (
                                                        <div className="py-4 text-center text-casino-slate-500 text-xs">Loading bets...</div>
                                                    ) : referralBets.length === 0 ? (
                                                        <div className="py-4 text-center text-casino-slate-500 text-xs italic">No downline bets found for this match.</div>
                                                    ) : (
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-left">
                                                                <thead className="bg-white/5 text-[9px] uppercase text-casino-slate-400 font-bold tracking-wider">
                                                                    <tr>
                                                                        <th className="p-2 rounded-l-lg">User</th>
                                                                        <th className="p-2 text-center">Selection</th>
                                                                        <th className="p-2 text-right">Wager</th>
                                                                        <th className="p-2 text-center">Result</th>
                                                                        <th className="p-2 text-right">Payout</th>
                                                                        <th className="p-2 text-right rounded-r-lg">Profit/Loss</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-white/5 text-xs">
                                                                    {referralBets.slice((betsPage - 1) * 5, betsPage * 5).map((bet, idx) => (
                                                                        <tr key={idx} className="hover:bg-white/5">
                                                                            <td className="p-2 font-medium text-white">{bet.username}</td>
                                                                            <td className="p-2 text-center">
                                                                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${bet.selection === 'meron' ? 'text-red-500 bg-red-500/10' :
                                                                                    bet.selection === 'wala' ? 'text-blue-500 bg-blue-500/10' :
                                                                                        'text-white bg-white/10'
                                                                                    }`}>
                                                                                    {bet.selection}
                                                                                </span>
                                                                            </td>
                                                                            <td className="p-2 text-right font-mono text-yellow-500">₱{bet.amount.toLocaleString()}</td>
                                                                            <td className="p-2 text-center">
                                                                                <span className={`font-bold ${bet.status === 'won' ? 'text-green-500' :
                                                                                    bet.status === 'lost' ? 'text-red-500' :
                                                                                        'text-casino-slate-400'
                                                                                    }`}>
                                                                                    {bet.status.toUpperCase()}
                                                                                </span>
                                                                            </td>
                                                                            <td className="p-2 text-right font-mono text-white">
                                                                                {bet.payout > 0 ? `₱${bet.payout.toLocaleString()}` : '-'}
                                                                            </td>
                                                                            <td className="p-2 text-right font-mono">
                                                                                <span className={bet.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
                                                                                    {bet.profit >= 0 ? '+' : ''}₱{bet.profit.toLocaleString()}
                                                                                </span>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>

                                                            {/* Nested Pagination */}
                                                            {referralBets.length > 5 && (
                                                                <div className="flex items-center justify-between p-2 mt-2 border-t border-white/5">
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); setBetsPage(p => Math.max(1, p - 1)); }}
                                                                        disabled={betsPage === 1}
                                                                        className="text-[10px] text-casino-slate-400 hover:text-white disabled:opacity-50"
                                                                    >
                                                                        Prev
                                                                    </button>
                                                                    <span className="text-[10px] text-casino-slate-500">
                                                                        Page {betsPage} of {Math.ceil(referralBets.length / 5)}
                                                                    </span>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); setBetsPage(p => Math.min(Math.ceil(referralBets.length / 5), p + 1)); }}
                                                                        disabled={betsPage === Math.ceil(referralBets.length / 5)}
                                                                        className="text-[10px] text-casino-slate-400 hover:text-white disabled:opacity-50"
                                                                    >
                                                                        Next
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            ))
                        )}
                    </tbody>
                </table>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="p-4 border-t border-white/5 flex items-center justify-between bg-black/20">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="text-xs text-casino-slate-400 hover:text-white disabled:opacity-50"
                        >
                            Previous
                        </button>
                        <span className="text-xs text-casino-slate-500">Page {currentPage} of {totalPages}</span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="text-xs text-casino-slate-400 hover:text-white disabled:opacity-50"
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
