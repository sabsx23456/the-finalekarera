import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import type { AdminLog } from '../../types';
import { Search, Filter, Shield, User, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

interface AdminLogsPageProps {
    compact?: boolean;
}

export const AdminLogsPage = ({ compact = false }: AdminLogsPageProps) => {
    const [logs, setLogs] = useState<AdminLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [actionFilter, setActionFilter] = useState<string>('all');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const ITEMS_PER_PAGE = 20;

    const [selectedLog, setSelectedLog] = useState<AdminLog | null>(null);

    useEffect(() => {
        fetchLogs();
    }, [page, filter, actionFilter]);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            let query = supabase
                .from('admin_logs')
                .select(`
id,
    admin_id,
    action_type,
    target_id,
    target_name,
    details,
    created_at,
    ip_address,
    admin: admin_id(username)
        `, { count: 'exact' });

            if (filter) {
                query = query.textSearch('target_name', filter, { type: 'websearch', config: 'english' }); // Or ilike for simplicity 
                // textSearch might need FTS setup, falling back to ilike for simple column search if not indexed
                // query = query.ilike('target_name', `% ${ filter }% `); 
                // Actually target_name search is safer with ilike

            }

            if (filter) {
                query = query.or(`target_name.ilike.% ${filter}%, action_type.ilike.% ${filter}% `);
            }

            if (actionFilter !== 'all') {
                query = query.eq('action_type', actionFilter);
            }

            const from = (page - 1) * ITEMS_PER_PAGE;
            const to = from + ITEMS_PER_PAGE - 1;

            const { data, error, count } = await query
                .order('created_at', { ascending: false })
                .range(from, to);

            if (error) throw error;

            if (data) {
                // Determine the correct type for admin (it comes joined as an object or array)
                const formattedData: AdminLog[] = data.map((log: any) => ({
                    ...log,
                    admin: Array.isArray(log.admin) ? log.admin[0] : log.admin
                }));
                setLogs(formattedData);
            }

            if (count) {
                setTotalPages(Math.ceil(count / ITEMS_PER_PAGE));
            }
        } catch (error) {
            console.error("Error fetching admin logs:", error);
        } finally {
            setLoading(false);
        }
    };

    const formatActionType = (type: string) => {
        return type.replace(/_/g, ' ');
    };

    const getActionColor = (type: string) => {
        if (type.includes('APPROVE')) return 'text-green-400 bg-green-500/10';
        if (type.includes('REJECT')) return 'text-red-400 bg-red-500/10';
        if (type.includes('BALANCE')) return 'text-green-400 bg-green-500/10';
        if (type.includes('UPDATE')) return 'text-blue-400 bg-blue-500/10';
        if (type.includes('BAN')) return 'text-red-400 bg-red-500/10';
        if (type.includes('CREATE')) return 'text-yellow-400 bg-yellow-500/10';
        return 'text-slate-400 bg-slate-500/10';
    };

    return (
        <div className={clsx("space-y-6", !compact && "max-w-7xl mx-auto")}>
            {/* Header */}
            {!compact && (
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-display font-black text-white tracking-tight flex items-center gap-3">
                            <Shield className="text-casino-gold-400" />
                            Admin Activity Logs
                        </h1>
                        <p className="text-casino-slate-500 mt-2 font-medium">
                            Monitor and audit all administrative actions within the system.
                        </p>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-500 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Search by target name or action..."
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="w-full bg-neutral-900 border border-neutral-700 text-white pl-10 pr-4 py-3 rounded-xl focus:border-casino-gold-400 outline-none transition-all"
                    />
                </div>
                <div className="flex flex-wrap gap-2 bg-neutral-900 p-1 rounded-xl border border-neutral-700">
                    {[
                        'all',
                        'UPDATE_USER',
                        'ADD_BALANCE',
                        'TRANSFER_BALANCE',
                        'APPROVE_CASH_IN',
                        'REJECT_CASH_IN',
                        'APPROVE_CASH_OUT',
                        'REJECT_CASH_OUT'
                    ].map((action) => (
                        <button
                            key={action}
                            onClick={() => setActionFilter(action)}
                            className={clsx(
                                "px-4 py-2 rounded-lg text-sm font-bold transition-all capitalize",
                                actionFilter === action
                                    ? "bg-casino-gold-400 text-black shadow-lg"
                                    : "text-neutral-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            {action === 'all' ? 'All Actions' : action.replace(/_/g, ' ')}
                        </button>
                    ))}
                </div>
            </div>

            {/* Logs Table */}
            <div className="bg-neutral-800 rounded-2xl border border-neutral-700 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-neutral-900/50 text-neutral-400 text-xs font-black uppercase tracking-wider">
                            <tr>
                                <th className="p-5">Date & Time</th>
                                <th className="p-5">Admin</th>
                                <th className="p-5">Action</th>
                                <th className="p-5">Target</th>
                                <th className="p-5">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-700">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-neutral-500">
                                        Loading logs...
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-neutral-500">
                                        No logs found matching your criteria.
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-neutral-700/50 transition-colors group">
                                        <td className="p-5">
                                            <div className="flex flex-col">
                                                <span className="text-white font-mono text-sm">
                                                    {new Date(log.created_at).toLocaleDateString()}
                                                </span>
                                                <span className="text-neutral-500 text-xs mt-0.5">
                                                    {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-casino-gold-400/10 flex items-center justify-center">
                                                    <User size={12} className="text-casino-gold-400" />
                                                </div>
                                                <span className="text-white font-medium text-sm">
                                                    {log.admin?.username || 'Unknown'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-5">
                                            <span className={clsx(
                                                "px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider",
                                                getActionColor(log.action_type)
                                            )}>
                                                {formatActionType(log.action_type)}
                                            </span>
                                        </td>
                                        <td className="p-5">
                                            <span className="text-neutral-300 font-mono text-sm">
                                                {log.target_name || log.target_id || '-'}
                                            </span>
                                        </td>
                                        <td className="p-5">
                                            <button
                                                onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                                                className="text-neutral-400 hover:text-white transition-colors flex items-center gap-1 text-xs font-bold uppercase tracking-wider"
                                            >
                                                <Eye size={14} />
                                                {selectedLog?.id === log.id ? 'Close' : 'View'}
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Log Details Viewer (Inline for simplicity) */}
                {selectedLog && (
                    <div className="bg-neutral-900 border-t border-neutral-700 p-6 animate-in slide-in-from-top-4 fade-in duration-200">
                        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                            <Filter size={16} className="text-casino-gold-400" />
                            Change Details
                        </h3>
                        <div className="bg-black/50 rounded-xl p-4 font-mono text-xs text-neutral-300 overflow-x-auto border border-white/5">
                            <pre>{JSON.stringify(selectedLog.details, null, 2)}</pre>
                        </div>
                    </div>
                )}

                {/* Pagination */}
                <div className="p-4 border-t border-neutral-700 flex items-center justify-between bg-neutral-900/30">
                    <span className="text-sm text-neutral-500">
                        Page {page} of {totalPages}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
