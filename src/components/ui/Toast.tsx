
import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, TrendingUp, TrendingDown } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'cash-in' | 'cash-out';

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType) => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);

        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 5000);
    }, []);

    const removeToast = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`
                            min-w-[340px] max-w-[400px] pointer-events-auto backdrop-blur-xl shadow-2xl rounded-2xl flex flex-col p-1 transition-all animate-in slide-in-from-right duration-500
                            ${toast.type === 'success' ? 'bg-neutral-900/90 border border-green-500/20 text-white shadow-green-900/10' :
                                toast.type === 'error' ? 'bg-neutral-900/90 border border-red-500/20 text-white shadow-red-900/10' :
                                    toast.type === 'cash-in' ? 'bg-gradient-to-br from-green-900/90 to-neutral-900/90 border border-green-400/30 text-white shadow-[0_0_50px_-12px_rgba(74,222,128,0.3)]' :
                                        toast.type === 'cash-out' ? 'bg-gradient-to-br from-red-900/90 to-neutral-900/90 border border-red-400/30 text-white shadow-[0_0_50px_-12px_rgba(248,113,113,0.3)]' :
                                            'bg-neutral-900/90 border border-blue-500/20 text-white'
                            }`}
                    >
                        {/* Content Container */}
                        <div className="flex items-start gap-4 p-4 rounded-xl bg-white/5">
                            {/* Icon Container */}
                            <div className={`p-3 rounded-full shrink-0 ${toast.type === 'success' ? 'bg-green-500/20 text-green-400' :
                                    toast.type === 'error' ? 'bg-red-500/20 text-red-400' :
                                        toast.type === 'cash-in' ? 'bg-green-500 text-black shadow-lg shadow-green-500/40' :
                                            toast.type === 'cash-out' ? 'bg-red-500 text-white shadow-lg shadow-red-500/40' :
                                                'bg-blue-500/20 text-blue-400'
                                }`}>
                                {toast.type === 'success' && <CheckCircle className="w-5 h-5" />}
                                {toast.type === 'error' && <AlertCircle className="w-5 h-5" />}
                                {toast.type === 'info' && <Info className="w-5 h-5" />}
                                {toast.type === 'cash-in' && <TrendingUp className="w-6 h-6" />}
                                {toast.type === 'cash-out' && <TrendingDown className="w-6 h-6" />}
                            </div>

                            <div className="flex-1 pt-1 min-w-0">
                                {/* Title */}
                                <h4 className={`text-xs font-black uppercase tracking-widest mb-1 ${toast.type === 'cash-in' ? 'text-green-400' :
                                        toast.type === 'cash-out' ? 'text-red-400' :
                                            'text-neutral-400'
                                    }`}>
                                    {toast.type === 'cash-in' ? 'Payment Received' :
                                        toast.type === 'cash-out' ? 'Withdrawal Processed' :
                                            toast.type.toUpperCase()}
                                </h4>
                                {/* Message */}
                                <p className="font-bold text-sm leading-snug text-white/90 break-words font-mono">
                                    {toast.message}
                                </p>
                            </div>

                            <button
                                onClick={() => removeToast(toast.id)}
                                className="text-white/30 hover:text-white transition-colors self-start -mt-1 -mr-1 p-1 hover:bg-white/10 rounded-lg"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Progress Bar/Decoration */}
                        {(toast.type === 'cash-in' || toast.type === 'cash-out') && (
                            <div className={`h-1 w-full rounded-b-full mt-0.5 overflow-hidden bg-black/50`}>
                                <div className={`h-full w-full animate-[shrink_5s_linear_forwards] ${toast.type === 'cash-in' ? 'bg-green-500' : 'bg-red-500'
                                    }`} />
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
