import type { ReactNode } from 'react';
import clsx from 'clsx';

interface StatCardProps {
    title: string;
    value: string | number;
    icon?: ReactNode;
    trend?: string;
    trendUp?: boolean;
    className?: string;
}

export const StatCard = ({ title, value, icon, trend, trendUp, className }: StatCardProps) => {
    return (
        <div className={clsx("glass-panel p-5 rounded-2xl relative overflow-hidden group hover:border-white/10 transition-all", className)}>
            <div className="flex justify-between items-start mb-3">
                <h3 className="text-casino-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">{title}</h3>
                {icon && <div className="text-casino-gold-400 opacity-60 group-hover:opacity-100 transition-opacity">{icon}</div>}
            </div>

            <div className="flex items-baseline gap-2 relative z-10">
                <p className="text-2xl font-display font-black text-white tracking-tight">{value}</p>
                {trend && (
                    <span className={clsx("text-xs font-bold px-1.5 py-0.5 rounded-md", trendUp ? "text-green-400 bg-green-400/10" : "text-red-400 bg-red-400/10")}>
                        {trend}
                    </span>
                )}
            </div>

            {/* Decorative background subtle glow */}
            <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-casino-gold-400/5 blur-3xl rounded-full pointer-events-none group-hover:bg-casino-gold-400/10 transition-all"></div>
        </div>
    );
};
