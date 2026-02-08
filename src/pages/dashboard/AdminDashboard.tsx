import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Activity, Settings, Trophy, MessageCircle, BarChart3, TrendingUp, DollarSign } from 'lucide-react';
import { useStreamSettings } from '../../hooks/useStreamSettings';
import { useAiPromptKnowledge } from '../../hooks/useAiPromptKnowledge';
import { useAnalytics } from '../../hooks/useAnalytics';
import { StatCard } from '../../components/dashboard/StatCard';
import { IncomingRequestsTable } from '../../components/dashboard/IncomingRequestsTable';
import { AdminLogsPage } from './AdminLogsPage';
import { CommissionAnalyticsCard } from '../../components/dashboard/CommissionAnalyticsCard';
import { ProfitAnalytics } from '../../components/dashboard/ProfitAnalytics';
import { AgentCommissionTable } from '../../components/dashboard/AgentCommissionTable';
import { UserAnalyticsTable } from '../../components/dashboard/UserAnalyticsTable';
import { AdminUserManagement } from './AdminUserManagement';
import { useToast } from '../../components/ui/Toast';
import { PaymentMethodsSettings } from '../../components/dashboard/PaymentMethodsSettings';
import { FinancialSettings } from '../../components/dashboard/FinancialSettings';

export const AdminDashboard = () => {
    const { loading: analyticsLoading, globalStats, agentStats, userStats, refresh: refreshAnalytics } = useAnalytics();
    const { streamUrl, streamTitle, updateStreamUrl, updateStreamTitle } = useStreamSettings();
    const { knowledge, updateKnowledge, loading: knowledgeLoading } = useAiPromptKnowledge();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'analytics' | 'agents' | 'users' | 'requests' | 'settings'>('analytics');
    const { showToast } = useToast();
    const [knowledgeDraft, setKnowledgeDraft] = useState('');
    const [savingKnowledge, setSavingKnowledge] = useState(false);

    useEffect(() => { setKnowledgeDraft(knowledge); }, [knowledge]);

    const handleSaveKnowledge = async () => {
        setSavingKnowledge(true);
        const { error } = await updateKnowledge(knowledgeDraft);
        if (error) showToast(error.message || 'Failed to update AI knowledge.', 'error');
        else showToast('AI support knowledge updated.', 'success');
        setSavingKnowledge(false);
    };

    const NavTab = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${activeTab === id
                ? 'bg-casino-gold-500 text-casino-dark-950'
                : 'text-casino-slate-400 hover:bg-white/5 hover:text-white'
                }`}
        >
            <Icon size={14} />
            <span>{label}</span>
        </button>
    );

    return (
        <div className="space-y-3 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-casino-gold-500" />
                    <h1 className="text-lg font-bold text-white">Admin Dashboard</h1>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => navigate('/events')}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-all"
                    >
                        Events
                    </button>
                    <button
                        onClick={() => refreshAnalytics()}
                        className="px-3 py-1.5 bg-casino-dark-800 hover:bg-casino-dark-700 text-white rounded-lg text-xs font-semibold transition-all border border-white/10"
                    >
                        Refresh
                    </button>
                </div>
            </div>

            {/* Financial Overview */}
            <div className="glass-panel p-3 rounded-xl">
                <h2 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                    <DollarSign className="text-green-400" size={16} />
                    Financial Overview
                </h2>
                {analyticsLoading ? (
                    <div className="h-24 rounded-lg bg-white/5 animate-pulse" />
                ) : (
                    <ProfitAnalytics data={globalStats} />
                )}
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap gap-1 bg-casino-dark-850 p-1 rounded-lg">
                <NavTab id="analytics" label="Overview" icon={TrendingUp} />
                <NavTab id="agents" label="Agents" icon={Users} />
                <NavTab id="users" label="Players" icon={Trophy} />
                <NavTab id="requests" label="Requests" icon={DollarSign} />
                <NavTab id="settings" label="Settings" icon={Settings} />
            </div>

            {/* Content Area */}
            <div className="min-h-[400px]">
                {activeTab === 'analytics' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                        <div className="lg:col-span-2 space-y-3">
                            <CommissionAnalyticsCard />
                            <div className="glass-panel p-4 rounded-xl">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-bold text-white">Recent System Logs</h3>
                                    <button onClick={() => navigate('/admin-logs')} className="text-xs text-casino-gold-500 hover:underline">View All</button>
                                </div>
                                <AdminLogsPage compact />
                            </div>
                        </div>
                        <div className="space-y-3">
                            <StatCard
                                title="Total Bets"
                                value={userStats.reduce((acc, u) => acc + u.totalBets, 0).toLocaleString()}
                                icon={<Activity size={16} />}
                            />
                            <StatCard
                                title="Active Players"
                                value={userStats.length.toLocaleString()}
                                icon={<Users size={16} />}
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'agents' && (
                    <div className="space-y-3">
                        <AgentCommissionTable data={agentStats} />
                    </div>
                )}

                {activeTab === 'users' && (
                    <div className="space-y-3">
                        <AdminUserManagement />
                        <UserAnalyticsTable data={userStats} />
                    </div>
                )}

                {activeTab === 'requests' && (
                    <div className="space-y-3">
                        <IncomingRequestsTable refreshTrigger={0} />
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="space-y-3">
                        <FinancialSettings />
                        <PaymentMethodsSettings />

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {/* Stream Settings */}
                            <div className="glass-panel rounded-xl p-4 border-white/5">
                                <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                                    <Activity className="text-casino-gold-500" size={16} />
                                    Broadcasting
                                </h2>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-[10px] font-semibold text-casino-slate-500 uppercase ml-1">Stream URL</label>
                                        <input
                                            type="text"
                                            placeholder="https://..."
                                            className="w-full bg-casino-dark-850 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-casino-gold-500/50 outline-none mt-1"
                                            defaultValue={streamUrl}
                                            onChange={(e) => updateStreamUrl(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-semibold text-casino-slate-500 uppercase ml-1">Stream Title</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. GRAND FINALS"
                                            className="w-full bg-casino-dark-850 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-casino-gold-500/50 outline-none mt-1"
                                            defaultValue={streamTitle}
                                            onChange={(e) => updateStreamTitle(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* AI Settings */}
                            <div className="glass-panel rounded-xl p-4 border-white/5">
                                <div className="flex items-center justify-between mb-3">
                                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                        <MessageCircle className="text-casino-gold-500" size={16} />
                                        AI Knowledge
                                    </h2>
                                    <button
                                        onClick={handleSaveKnowledge}
                                        disabled={savingKnowledge || knowledgeLoading}
                                        className="btn-casino-primary py-1.5 px-3 rounded-lg text-[10px] font-bold disabled:opacity-60"
                                    >
                                        {savingKnowledge ? 'Saving...' : 'Save'}
                                    </button>
                                </div>
                                <textarea
                                    rows={5}
                                    value={knowledgeDraft}
                                    onChange={(e) => setKnowledgeDraft(e.target.value)}
                                    placeholder="Add policy, FAQs, or guidance..."
                                    className="w-full bg-casino-dark-850 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-casino-gold-500/50 outline-none resize-none"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
