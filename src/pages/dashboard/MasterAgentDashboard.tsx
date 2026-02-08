import { useState, useEffect } from 'react';
import { useAuthStore } from '../../lib/store';
import { supabase } from '../../lib/supabase';
import { UserPlus, Users, Wallet, ShieldCheck } from 'lucide-react';
import { IncomingRequestsTable } from '../../components/dashboard/IncomingRequestsTable';
import { CreateUserModal } from '../../components/modals/CreateUserModal';
import { LiveMatchBanner } from '../../components/dashboard/LiveMatchBanner';
import { useAgentStats } from '../../hooks/useAgentStats';
import { RegistrationQueueTable } from '../../components/dashboard/RegistrationQueueTable';
import { RecruitmentHub } from '../../components/dashboard/RecruitmentHub';
import { CommissionAnalyticsCard } from '../../components/dashboard/CommissionAnalyticsCard';
import { LeaderboardTable } from '../../components/dashboard/LeaderboardTable';
import { TransactionStatsCard } from '../../components/dashboard/TransactionStatsCard';
import { BettingStatsCard } from '../../components/dashboard/BettingStatsCard';
import { AgentPlayerTable } from '../../components/dashboard/AgentPlayerTable';

export const MasterAgentDashboard = () => {
    const { session, profile } = useAuthStore();
    const { stats, pendingApprovals, actionLoading, handleApproval, refreshStats } = useAgentStats();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [createType, setCreateType] = useState<'agent' | 'user'>('agent');
    const [copied, setCopied] = useState(false);
    const [downlineIds, setDownlineIds] = useState<string[]>([]);

    useEffect(() => {
        if (profile?.id) fetchFullDownline();
    }, [profile?.id]);

    const fetchFullDownline = async () => {
        try {
            const { data: directDownline } = await supabase
                .from('profiles').select('id, role').eq('created_by', profile?.id);
            if (!directDownline) return;

            const playerIds = directDownline.filter(u => u.role === 'user').map(u => u.id);
            const agentIds = directDownline.filter(u => u.role === 'agent').map(u => u.id);

            let indirectPlayerIds: string[] = [];
            if (agentIds.length > 0) {
                const { data: subPlayers } = await supabase.from('profiles').select('id').in('created_by', agentIds);
                if (subPlayers) indirectPlayerIds = subPlayers.map(u => u.id);
            }
            setDownlineIds([...playerIds, ...indirectPlayerIds]);
        } catch (error) {
            console.error("Error fetching full downline:", error);
        }
    };

    const handleCopyLink = () => {
        if (!profile?.referral_code) return;
        const link = `${window.location.origin}/register?ref=${profile.referral_code}`;
        navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const openCreateModal = (type: 'agent' | 'user') => {
        setCreateType(type);
        setIsCreateModalOpen(true);
    };

    return (
        <div className="space-y-3 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-casino-gold-500" />
                    <h1 className="text-lg font-bold text-white">Master Agent</h1>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => openCreateModal('agent')}
                        className="py-2 px-3 glass-panel rounded-lg flex items-center gap-1.5 text-xs font-semibold text-casino-slate-300 hover:text-white border-purple-500/20"
                    >
                        <UserPlus className="w-3.5 h-3.5 text-purple-400" />
                        Agent
                    </button>
                    <button
                        onClick={() => openCreateModal('user')}
                        className="btn-casino-primary py-2 px-3 rounded-lg flex items-center gap-1.5 text-xs font-bold"
                    >
                        <UserPlus className="w-3.5 h-3.5" />
                        Player
                    </button>
                </div>
            </div>

            {/* Live Match Banner */}
            <LiveMatchBanner />

            {/* Quick Stats - Compact */}
            <div className="grid grid-cols-3 gap-2">
                <div className="glass-panel p-3 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="p-1.5 bg-purple-500/10 rounded-md">
                            <Users className="w-3.5 h-3.5 text-purple-400" />
                        </div>
                        <span className="text-[10px] text-casino-slate-500 uppercase font-semibold">Agents</span>
                    </div>
                    <p className="text-xl font-bold text-white">{stats.agents}</p>
                </div>

                <div className="glass-panel p-3 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="p-1.5 bg-blue-500/10 rounded-md">
                            <Users className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                        <span className="text-[10px] text-casino-slate-500 uppercase font-semibold">Players</span>
                    </div>
                    <p className="text-xl font-bold text-white">{stats.users}</p>
                </div>

                <div className="glass-panel p-3 rounded-xl border-casino-gold-500/10">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="p-1.5 bg-casino-gold-500/10 rounded-md">
                            <Wallet className="w-3.5 h-3.5 text-casino-gold-500" />
                        </div>
                        <span className="text-[10px] text-casino-slate-500 uppercase font-semibold">Balance</span>
                    </div>
                    <p className="text-lg font-bold text-white">₱{profile?.balance?.toLocaleString() || '0'}</p>
                </div>
            </div>

            {/* Downline Analytics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <BettingStatsCard userIds={downlineIds} />
                <TransactionStatsCard type="cash_in" title="Cash In" userIds={downlineIds} />
                <TransactionStatsCard type="cash_out" title="Cash Out" userIds={downlineIds} />
            </div>

            {/* Analytics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                    <CommissionAnalyticsCard />
                </div>
                <div className="h-[320px]">
                    <LeaderboardTable />
                </div>
            </div>

            {/* My Downline */}
            <AgentPlayerTable />

            {/* Pending Approvals */}
            {pendingApprovals.length > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-white">Pending Approvals</h2>
                        <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                            {pendingApprovals.length}
                        </span>
                    </div>
                    <RegistrationQueueTable
                        pendingApprovals={pendingApprovals}
                        onApprove={(id) => handleApproval(id, 'active')}
                        onDeny={(id) => handleApproval(id, 'banned')}
                        actionLoading={actionLoading}
                    />
                </div>
            )}

            {/* Transaction Queue */}
            <IncomingRequestsTable refreshTrigger={Number(stats.users + stats.agents)} />

            {/* Recruitment Hub */}
            <RecruitmentHub
                title="Recruitment Hub"
                description="Use your unique referral link to build your network."
                buttonText="Get Invite Link"
                referralCode={profile?.referral_code || undefined}
                onCopy={handleCopyLink}
                copied={copied}
            />

            {session && (
                <CreateUserModal
                    isOpen={isCreateModalOpen}
                    onClose={() => setIsCreateModalOpen(false)}
                    onSuccess={() => { refreshStats(); setIsCreateModalOpen(false); }}
                    creatorId={session.user.id}
                    allowedRoles={createType === 'agent' ? ['agent'] : ['user']}
                    title={createType === 'agent' ? 'Recruit New Agent' : 'Register New Player'}
                />
            )}
        </div>
    );
};
