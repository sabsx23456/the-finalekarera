
import { useState } from 'react';
import { ChevronDown, ChevronUp, Search, User } from 'lucide-react';
import type { AgentCommissionStats } from '../../hooks/useAnalytics';

interface AgentCommissionTableProps {
    data: AgentCommissionStats[];
}

export const AgentCommissionTable = ({ data }: AgentCommissionTableProps) => {
    const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredData = data.filter(agent =>
        agent.agentName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const toggleExpand = (agentId: string) => {
        setExpandedAgent(expandedAgent === agentId ? null : agentId);
    };

    return (
        <div className="glass-panel rounded-2xl overflow-hidden border-casino-gold-400/10">
            <div className="p-6 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h3 className="text-white font-display font-black text-lg uppercase tracking-wider">Agent Commissions</h3>
                    <p className="text-casino-slate-500 text-xs mt-1">Breakdown of commissions by agent and source</p>
                </div>
                <div className="relative w-full md:w-64">
                    <input
                        type="text"
                        placeholder="Search agent..."
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
                            <th className="px-6 py-4 text-left text-[10px] font-black text-casino-gold-400 uppercase tracking-[0.2em]">Agent</th>
                            <th className="px-6 py-4 text-right text-[10px] font-black text-casino-gold-400 uppercase tracking-[0.2em]">Total Commission</th>
                            <th className="px-6 py-4 text-right text-[10px] font-black text-casino-gold-400 uppercase tracking-[0.2em]">Sources</th>
                            <th className="px-6 py-4 text-center text-[10px] font-black text-casino-gold-400 uppercase tracking-[0.2em]">Details</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {filteredData.length > 0 ? (
                            filteredData.map((agent) => (
                                <>
                                    <tr
                                        key={agent.agentId}
                                        className="hover:bg-white/5 transition-colors cursor-pointer"
                                        onClick={() => toggleExpand(agent.agentId)}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center">
                                                    <User className="w-4 h-4 text-indigo-400" />
                                                </div>
                                                <span className="text-sm font-bold text-white">{agent.agentName}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-sm font-bold text-green-400">
                                                ₱{agent.totalCommission.toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-xs font-medium text-casino-slate-400">
                                                {agent.sourceUsers.length} Users
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            {expandedAgent === agent.agentId ? (
                                                <ChevronUp className="w-4 h-4 text-casino-gold-400 mx-auto" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4 text-casino-slate-500 mx-auto" />
                                            )}
                                        </td>
                                    </tr>
                                    {expandedAgent === agent.agentId && (
                                        <tr className="bg-black/20">
                                            <td colSpan={4} className="px-6 py-4">
                                                <div className="bg-casino-dark-800 rounded-lg p-4 border border-white/5">
                                                    <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                                                        <User className="w-4 h-4 text-casino-gold-400" />
                                                        Referred Users & Performance
                                                    </h4>
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-left">
                                                            <thead className="bg-white/5 text-[10px] uppercase text-casino-slate-400 font-bold tracking-wider">
                                                                <tr>
                                                                    <th className="p-3 rounded-l-lg">User</th>
                                                                    <th className="p-3 text-right text-green-400">Cash In</th>
                                                                    <th className="p-3 text-right text-red-400">Cash Out</th>
                                                                    <th className="p-3 text-right text-yellow-500">Wagered</th>
                                                                    <th className="p-3 text-right">Win Rate</th>
                                                                    <th className="p-3 text-right">P/L</th>
                                                                    <th className="p-3 text-right text-casino-gold-400 rounded-r-lg">Commission</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-white/5 text-xs">
                                                                {agent.referredUsers && agent.referredUsers.length > 0 ? (
                                                                    agent.referredUsers.map((user, idx) => {
                                                                        // Find specific commission contribution from this user
                                                                        const commSource = agent.sourceUsers.find(s => s.username === user.username);
                                                                        const commissionContrib = commSource ? commSource.amount : 0;

                                                                        return (
                                                                            <tr key={idx} className="hover:bg-white/5 transition-colors">
                                                                                <td className="p-3 font-medium text-white">{user.username}</td>
                                                                                <td className="p-3 text-right font-mono text-green-400">
                                                                                    {user.totalCashIn > 0 ? `+₱${user.totalCashIn.toLocaleString()}` : '-'}
                                                                                </td>
                                                                                <td className="p-3 text-right font-mono text-red-400">
                                                                                    {user.totalCashOut > 0 ? `-₱${user.totalCashOut.toLocaleString()}` : '-'}
                                                                                </td>
                                                                                <td className="p-3 text-right font-mono text-yellow-500">
                                                                                    ₱{user.totalWagered.toLocaleString()}
                                                                                    <span className="block text-[9px] text-casino-slate-500">{user.totalBets} bets</span>
                                                                                </td>
                                                                                <td className="p-3 text-right">
                                                                                    <span className={user.winRate > 50 ? 'text-green-400' : 'text-casino-slate-400'}>
                                                                                        {user.winRate.toFixed(1)}%
                                                                                    </span>
                                                                                </td>
                                                                                <td className="p-3 text-right font-mono">
                                                                                    <span className={user.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}>
                                                                                        {user.netProfit >= 0 ? '+' : ''}₱{user.netProfit.toLocaleString()}
                                                                                    </span>
                                                                                </td>
                                                                                <td className="p-3 text-right font-mono text-casino-gold-400">
                                                                                    {commissionContrib > 0 ? `₱${commissionContrib.toLocaleString()}` : '-'}
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })
                                                                ) : (
                                                                    <tr>
                                                                        <td colSpan={7} className="p-4 text-center text-casino-slate-500 italic">
                                                                            No active referred users found.
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-casino-slate-500 text-sm">
                                    No commissions found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
