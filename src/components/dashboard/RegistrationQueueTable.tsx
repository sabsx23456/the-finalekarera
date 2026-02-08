import { ExternalLink, Phone } from 'lucide-react';
import type { Profile } from '../../types';

interface RegistrationQueueTableProps {
    pendingApprovals: Profile[];
    onApprove: (userId: string) => void;
    onDeny: (userId: string) => void;
    actionLoading: string | null;
}

export const RegistrationQueueTable = ({
    pendingApprovals,
    onApprove,
    onDeny,
    actionLoading
}: RegistrationQueueTableProps) => {
    return (
        <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-black/20 text-casino-slate-500 text-[10px] uppercase font-black tracking-[0.15em]">
                        <tr>
                            <th className="p-6">Player</th>
                            <th className="p-6">Contact</th>
                            <th className="p-6">Social</th>
                            <th className="p-6">Date</th>
                            <th className="p-6 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {pendingApprovals.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="p-12 text-center text-casino-slate-600 font-medium italic">No pending players to approve.</td>
                            </tr>
                        ) : (
                            pendingApprovals.map((user) => (
                                <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                                    <td className="p-6">
                                        <div className="font-bold text-white group-hover:text-casino-gold-400 transition-colors">{user.username}</div>
                                        <div className="text-[10px] text-casino-slate-500 uppercase font-black tracking-widest mt-1">{user.role ? user.role.replace('_', ' ') : 'N/A'}</div>
                                    </td>
                                    <td className="p-6">
                                        <div className="text-casino-slate-300 text-sm font-bold flex items-center gap-2">
                                            <span className="opacity-40"><Phone size={14} /></span>
                                            {user.phone_number || 'No Contact'}
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        {user.facebook_url ? (
                                            <a
                                                href={user.facebook_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-2 text-blue-400 hover:text-white text-[10px] font-black uppercase bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-500/20 transition-all hover:bg-blue-500"
                                            >
                                                Profile <ExternalLink size={10} />
                                            </a>
                                        ) : (
                                            <span className="text-casino-slate-600 text-xs italic">N/A</span>
                                        )}
                                    </td>
                                    <td className="p-6 text-xs text-casino-slate-500 font-medium">{new Date(user.created_at).toLocaleDateString()}</td>
                                    <td className="p-6 text-right">
                                        <div className="flex items-center justify-end gap-3">
                                            <button
                                                onClick={() => onApprove(user.id)}
                                                disabled={!!actionLoading}
                                                className="bg-casino-gold-400 text-casino-dark-950 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
                                            >
                                                {actionLoading === user.id ? '...' : 'Verify'}
                                            </button>
                                            <button
                                                onClick={() => onDeny(user.id)}
                                                disabled={!!actionLoading}
                                                className="bg-white/5 text-casino-slate-400 hover:text-red-400 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all active:scale-95"
                                            >
                                                Deny
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
