import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import Logo from '../assets/logo.png';
import { useAuthStore } from '../lib/store';
import { Users, Wallet, Settings, LogOut, History, Gamepad2, Menu, X, Bell, MessageCircle, LayoutDashboard, Trophy, Gift, Plus, Minus } from 'lucide-react';
import clsx from 'clsx';
import { CashInModal } from './modals/CashInModal';
import { CashOutModal } from './modals/CashOutModal';
import { useToast } from './ui/Toast';
import { supabase } from '../lib/supabase';

interface SidebarItem {
    name: string;
    icon?: typeof Users;
    path?: string;
    isHeader?: boolean;
    action?: () => Promise<void>;
    isNew?: boolean;
}

export const Layout = () => {
    const { profile, signOut, refreshProfile } = useAuthStore();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isCashInOpen, setIsCashInOpen] = useState(false);
    const [isCashOutOpen, setIsCashOutOpen] = useState(false);
    const [pendingCashOutRequest, setPendingCashOutRequest] = useState(false);
    const location = useLocation();
    const { showToast } = useToast();

    // Check for pending cash out request
    const checkPendingRequest = async () => {
        if (!profile?.id) return;
        const { data } = await supabase
            .from('transaction_requests')
            .select('id')
            .eq('user_id', profile.id)
            .eq('type', 'cash_out')
            .eq('status', 'pending')
            .maybeSingle();
        setPendingCashOutRequest(!!data);
    };

    const handleCashInSuccess = () => {
        showToast('Cash in request submitted successfully!', 'success');
        refreshProfile();
    };

    const handleCashOutSuccess = () => {
        showToast('Cash out request submitted successfully!', 'success');
        refreshProfile();
        setPendingCashOutRequest(true);
    };

    if (!profile) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-casino-dark-950">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-casino-gold-500"></div>
            </div>
        );
    }

    const navItems = [
        { name: 'Lobby', icon: Gamepad2, path: '/' },
        { name: 'KARERA', icon: Trophy, path: '/karera', isNew: true },
        { name: 'History', icon: History, path: '/history' },
        { name: 'Wallet', icon: Wallet, path: '/wallet' },
        { name: 'Profile', icon: Users, path: '/settings' },
    ];

    const showChatSupport = ['user', 'agent', 'master_agent', 'loader', 'admin'].includes(profile.role);
    const showAdminDashboard = ['admin', 'master_agent', 'agent', 'loader'].includes(profile.role);
    const isAdmin = profile.role === 'admin';

    const filteredNavItems = navItems.filter(item => {
        if (isAdmin && item.path === '/') return false;
        if (['admin', 'master_agent', 'agent'].includes(profile.role) && item.path === '/history') return false;
        return true;
    });

    const sidebarItems: SidebarItem[] = [
        { name: 'Navigation', isHeader: true },
        ...(showAdminDashboard ? [{ name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' }] : []),
        ...(isAdmin ? [{ name: 'Events', icon: Gamepad2, path: '/events' }, { name: 'Rewards', icon: Gift, path: '/rewards-manage' }] : []),
        ...filteredNavItems,
        ...(!isAdmin ? [{ name: 'Rewards', icon: Trophy, path: '/rewards' }] : []),
        ...(['admin', 'master_agent', 'agent'].includes(profile.role) ? [{ name: 'Matches', icon: History, path: '/match-history' }] : []),
        ...(showChatSupport ? [{ name: 'Support', icon: MessageCircle, path: '/support' }] : []),
        { name: 'Settings', icon: Settings, path: '/settings' },
        { name: 'Sign Out', icon: LogOut, action: signOut, path: '#' },
    ];

    return (
        <div className="min-h-screen flex flex-col bg-black text-casino-slate-200">
            {/* Header */}
            <header className="h-14 bg-casino-dark-900 border-b border-casino-gold-500/10 flex items-center px-3 justify-between sticky top-0 z-40">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="lg:hidden p-3 bg-casino-dark-800 hover:bg-casino-dark-700 text-casino-gold-500 hover:text-casino-gold-400 transition-all rounded-xl border border-casino-gold-500/20 shadow-lg"
                    >
                        <Menu size={24} strokeWidth={2.5} />
                    </button>

                    <Link to="/" className="flex items-center gap-2">
                        <img src={Logo} alt="SABONG192" className="w-8 h-8 object-contain" />
                        <h1 className="text-base font-bold tracking-tight hidden sm:block">
                            <span className="text-white">SABONG</span>
                            <span className="text-casino-gold-500">192</span>
                        </h1>
                    </Link>
                </div>

                {/* Balance Display */}
                <div className="flex items-center gap-3">
                    <div className="hidden md:flex flex-col items-end">
                        <span className="text-[10px] text-casino-slate-500 font-medium uppercase">Balance</span>
                        <div className="text-sm font-bold text-white">
                            ₱ {profile.balance?.toLocaleString() ?? '0.00'}
                        </div>
                    </div>
                    <div className="md:hidden text-right">
                        <div className="text-[10px] text-casino-slate-500 font-medium uppercase">Balance</div>
                        <div className="text-xs font-bold text-casino-gold-500">
                            ₱ {profile.balance?.toLocaleString() ?? '0.00'}
                        </div>
                    </div>
                    <button className="p-2 text-casino-slate-400 hover:text-casino-gold-500 transition-colors">
                        <Bell size={18} />
                    </button>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar - Desktop Only */}
                <aside className="hidden lg:flex flex-col w-64 bg-casino-dark-900 border-r border-casino-gold-500/10">
                    <div className="h-full flex flex-col p-4">
                        {/* User Info */}
                        <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-white/5 border border-white/5">
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-casino-dark-700 to-casino-dark-800 flex items-center justify-center">
                                <Users size={16} className="text-casino-gold-500" />
                            </div>
                            <div className="flex flex-col overflow-hidden">
                                <span className="text-[10px] text-casino-slate-500 uppercase">{profile.role.replace('_', ' ')}</span>
                                <span className="text-sm font-semibold text-white truncate">{profile.username}</span>
                            </div>
                        </div>

                        {/* Balance & Cash In/Out Section */}
                        <div className="mb-4 p-4 rounded-xl bg-casino-dark-800 border border-white/10">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-[10px] text-gray-400 uppercase tracking-wider">Balance</div>
                                <Wallet size={14} className="text-casino-gold-500" />
                            </div>
                            <div className="text-xl font-black text-white font-mono mb-4">
                                ₱{profile.balance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => {
                                        setIsCashInOpen(true);
                                    }}
                                    className="flex flex-col items-center justify-center gap-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-xs uppercase tracking-wide transition-all active:scale-95"
                                >
                                    <Plus size={20} strokeWidth={3} />
                                    <span>Cash In</span>
                                </button>
                                <button
                                    onClick={() => {
                                        checkPendingRequest();
                                        setIsCashOutOpen(true);
                                    }}
                                    className="flex flex-col items-center justify-center gap-1 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xs uppercase tracking-wide transition-all active:scale-95"
                                >
                                    <Minus size={20} strokeWidth={3} />
                                    <span>Cash Out</span>
                                </button>
                            </div>
                        </div>

                        <nav className="flex-1 space-y-0.5 overflow-y-auto">
                            {sidebarItems.map((item, index) => {
                                if (item.isHeader) {
                                    return (
                                        <div key={index} className="pt-3 pb-1 px-3">
                                            <span className="text-[10px] font-bold text-casino-slate-600 uppercase tracking-wider">{item.name}</span>
                                        </div>
                                    );
                                }

                                const Icon = item.icon!;
                                const isActive = location.pathname === item.path;

                                return (
                                    <Link
                                        key={index}
                                        to={item.path || '#'}
                                        onClick={(e) => {
                                            if (item.action) {
                                                e.preventDefault();
                                                item.action();
                                            }
                                        }}
                                        className={clsx(
                                            "flex items-center gap-3 px-3 py-2 rounded-lg transition-all text-sm",
                                            isActive
                                                ? "bg-casino-gold-500/10 text-casino-gold-500 font-semibold"
                                                : "text-casino-slate-400 hover:bg-white/5 hover:text-white"
                                        )}
                                    >
                                        <Icon size={16} className={clsx(
                                            isActive ? "text-casino-gold-500" : "text-casino-slate-500"
                                        )} />
                                        <span>{item.name}</span>
                                        {item.isNew && (
                                            <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold bg-red-600 text-white rounded animate-pulse">
                                                NEW
                                            </span>
                                        )}
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                    <div className="flex-1 overflow-y-auto p-3 md:p-4 pb-24 lg:pb-4 scroll-smooth">
                        <Outlet />
                    </div>

                    {/* Mobile Bottom Nav - Glassmorphism */}
                    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-t border-white/10 pb-safe px-6 py-2 flex justify-between items-center shadow-[0_-10px_40px_rgba(0,0,0,0.8)]">
                        {filteredNavItems.slice(0, 5).map((item, index) => {
                            const Icon = item.icon;
                            const isActive = location.pathname === item.path;
                            return (
                                <Link
                                    key={index}
                                    to={item.path}
                                    className="group relative flex flex-col items-center justify-center w-12 h-12"
                                >
                                    <div className={clsx(
                                        "absolute inset-0 rounded-xl transition-all duration-300",
                                        isActive ? "bg-casino-gold-500/20 scale-100" : "scale-0 group-hover:bg-white/5 group-hover:scale-75"
                                    )} />

                                    <Icon
                                        size={24}
                                        strokeWidth={isActive ? 2.5 : 2}
                                        className={clsx(
                                            "relative z-10 transition-all duration-300",
                                            isActive ? "text-casino-gold-400 -translate-y-1" : "text-casino-slate-500 group-hover:text-white"
                                        )}
                                    />

                                    <span className={clsx(
                                        "text-[10px] font-bold absolute bottom-0.5 transition-all duration-300",
                                        isActive ? "text-casino-gold-500 opacity-100 translate-y-0" : "text-casino-slate-500 opacity-0 translate-y-2"
                                    )}>
                                        {item.name}
                                    </span>

                                    {item.isNew && (
                                        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse border border-black z-20" />
                                    )}
                                </Link>
                            );
                        })}
                    </nav>
                </main>
            </div>

            {/* Mobile Sidebar Overlay & Drawer */}
            {isMobileMenuOpen && (
                <>
                    <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                        onClick={() => setIsMobileMenuOpen(false)}
                    />
                    <div className="fixed inset-y-0 left-0 w-64 bg-casino-dark-900 border-r border-casino-gold-500/10 z-50 lg:hidden flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
                        {/* Mobile Header */}
                        <div className="h-14 flex items-center justify-between px-4 border-b border-white/5">
                            <span className="font-bold text-white">Menu</span>
                            <button
                                onClick={() => setIsMobileMenuOpen(false)}
                                className="p-2 text-casino-slate-400 hover:text-white"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Mobile User Info */}
                        <div className="p-4 border-b border-white/5">
                            <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-white/5 border border-white/5">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-casino-dark-700 to-casino-dark-800 flex items-center justify-center">
                                    <Users size={16} className="text-casino-gold-500" />
                                </div>
                                <div className="flex flex-col overflow-hidden">
                                    <span className="text-[10px] text-casino-slate-500 uppercase">{profile.role.replace('_', ' ')}</span>
                                    <span className="text-sm font-semibold text-white truncate">{profile.username}</span>
                                </div>
                            </div>
                        </div>

                        {/* Mobile Navigation */}
                        <nav className="flex-1 overflow-y-auto p-4 space-y-0.5">
                            {sidebarItems.map((item, index) => {
                                if (item.isHeader) {
                                    return (
                                        <div key={index} className="pt-3 pb-1 px-3">
                                            <span className="text-[10px] font-bold text-casino-slate-600 uppercase tracking-wider">{item.name}</span>
                                        </div>
                                    );
                                }

                                const Icon = item.icon!;
                                const isActive = location.pathname === item.path;

                                return (
                                    <Link
                                        key={index}
                                        to={item.path || '#'}
                                        onClick={(e) => {
                                            if (item.action) {
                                                e.preventDefault();
                                                item.action();
                                            }
                                            setIsMobileMenuOpen(false);
                                        }}
                                        className={clsx(
                                            "flex items-center gap-3 px-3 py-3 rounded-lg transition-all text-sm",
                                            isActive
                                                ? "bg-casino-gold-500/10 text-casino-gold-500 font-semibold"
                                                : "text-casino-slate-400 hover:bg-white/5 hover:text-white"
                                        )}
                                    >
                                        <Icon size={18} className={clsx(
                                            isActive ? "text-casino-gold-500" : "text-casino-slate-500"
                                        )} />
                                        <span>{item.name}</span>
                                        {item.isNew && (
                                            <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold bg-red-600 text-white rounded animate-pulse">
                                                NEW
                                            </span>
                                        )}
                                    </Link>
                                );
                            })}
                        </nav>

                        {/* Mobile Footer */}
                        <div className="p-4 border-t border-white/5 text-center">
                            <div className="text-[10px] text-casino-slate-600">
                                SABONG192 Mobile v1.0
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Cash In Modal */}
            <CashInModal
                isOpen={isCashInOpen}
                onClose={() => setIsCashInOpen(false)}
                onSuccess={handleCashInSuccess}
            />

            {/* Cash Out Modal */}
            <CashOutModal
                isOpen={isCashOutOpen}
                onClose={() => setIsCashOutOpen(false)}
                onSuccess={handleCashOutSuccess}
                pendingRequest={pendingCashOutRequest}
            />
        </div >
    );
};
