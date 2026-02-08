import { Search, Copy, Check } from 'lucide-react';
import clsx from 'clsx';

interface RecruitmentHubProps {
    referralCode?: string;
    onCopy: () => void;
    copied: boolean;
    title?: string;
    description?: string;
    buttonText?: string;
}

export const RecruitmentHub = ({
    referralCode,
    onCopy,
    copied,
    title = "Growth Center",
    description = "Recruit new players. Players who register using your link are automatically assigned to you for lifetime commissions.",
    buttonText = "Copy Invite Link"
}: RecruitmentHubProps) => {
    return (
        <div className="glass-panel p-8 md:p-10 rounded-3xl border-casino-gold-400/10 relative overflow-hidden">
            <div className="relative z-10 flex flex-col lg:flex-row justify-between lg:items-center gap-10">
                <div className="max-w-md">
                    <h3 className="text-white font-display font-black text-2xl uppercase tracking-wider mb-2">{title}</h3>
                    <p className="text-casino-slate-500 text-sm font-medium">{description}</p>
                </div>

                <div className="flex-1 w-full flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            readOnly
                            value={referralCode ? `${window.location.origin}/register?ref=${referralCode}` : 'Generating...'}
                            className="w-full bg-casino-input text-casino-slate-400 px-5 py-4 rounded-xl border border-white/5 text-xs outline-none focus:border-casino-gold-400 transition-all font-medium pr-12"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-30">
                            <Search size={16} className="text-casino-gold-400" />
                        </div>
                    </div>
                    <button
                        onClick={onCopy}
                        className={clsx(
                            "py-4 px-8 rounded-xl transition-all flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-[0.2em] shadow-lg",
                            copied ? "bg-green-500 text-white" : "btn-casino-primary"
                        )}
                    >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copied ? 'Copied' : buttonText}
                    </button>
                </div>
            </div>
            <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-casino-gold-400/5 blur-3xl rounded-full"></div>
        </div>
    );
};
