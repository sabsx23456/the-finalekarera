import clsx from 'clsx';
import { CheckCircle, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

interface BetResultModalProps {
    type: 'success' | 'error' | null;
    message: string;
    onClose: () => void;
}

export const BetResultModal = ({ type, message, onClose }: BetResultModalProps) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (type) {
            setVisible(true);
            if (type === 'success') {
                const timer = setTimeout(() => {
                    handleClose();
                }, 2000); // Auto close success after 2s
                return () => clearTimeout(timer);
            }
        }
    }, [type]);

    const handleClose = () => {
        setVisible(false);
        setTimeout(onClose, 300);
    };

    if (!type) return null;

    return (
        <div className={clsx(
            "fixed inset-0 z-[100] flex items-center justify-center transition-all duration-300",
            visible ? "bg-black/80 backdrop-blur-sm opacity-100" : "opacity-0 pointer-events-none"
        )}>
            <div className={clsx(
                "bg-casino-dark-800 border-2 rounded-2xl p-8 max-w-sm w-full mx-4 transform transition-all duration-300 flex flex-col items-center text-center shadow-2xl",
                visible ? "scale-100 translate-y-0" : "scale-90 translate-y-10",
                type === 'success' ? "border-green-500 shadow-green-900/50" : "border-red-500 shadow-red-900/50"
            )}>
                <div className={clsx(
                    "w-16 h-16 rounded-full flex items-center justify-center mb-6 animate-bounce",
                    type === 'success' ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"
                )}>
                    {type === 'success' ? <CheckCircle size={40} strokeWidth={3} /> : <XCircle size={40} strokeWidth={3} />}
                </div>

                <h3 className={clsx(
                    "text-2xl font-black uppercase tracking-wider mb-2",
                    type === 'success' ? "text-green-500" : "text-red-500"
                )}>
                    {type === 'success' ? 'Bet Placed!' : 'Bet Failed'}
                </h3>

                <p className="text-casino-slate-300 font-medium mb-8">
                    {message}
                </p>

                <button
                    onClick={handleClose}
                    className="w-full py-3 rounded-xl font-bold bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                    Close
                </button>
            </div>
        </div>
    );
};
