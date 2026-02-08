import { Wallet } from 'lucide-react';
import clsx from 'clsx';

interface RoleAnalyticsCardProps {
    roleName: string;
    count: number;
    totalBalance: number;
    colorClass?: string;
    onClick?: () => void;
}

export const RoleAnalyticsCard = ({ roleName, count, totalBalance, colorClass = "bg-blue-500", onClick }: RoleAnalyticsCardProps) => {
    return (
        <div
            onClick={onClick}
            className={clsx(
                "glass-panel p-6 rounded-3xl border-white/5 relative overflow-hidden group transition-all duration-500",
                onClick ? "cursor-pointer hover:border-white/20 hover:-translate-y-1" : ""
            )}
        >
            <div className={clsx("absolute top-0 right-0 w-32 h-32 blur-3xl opacity-10 -mr-16 -mt-16 rounded-full transition-transform duration-700 group-hover:scale-150", colorClass)}></div>

            <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                    <div className={clsx("px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white shadow-lg", colorClass)}>
                        {roleName}
                    </div>
                    <div className="text-2xl font-display font-black text-white/90">{count.toLocaleString()}</div>
                </div>

                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-casino-slate-400">
                        <Wallet size={12} className="opacity-50" />
                        <span className="text-[9px] uppercase font-black tracking-wider">Balance</span>
                    </div>
                    <span className="text-xl font-display font-bold text-white truncate leading-none block" title={totalBalance.toLocaleString()}>
                        ₱{totalBalance.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 })}
                    </span>
                </div>
            </div>
        </div>
    );
};
