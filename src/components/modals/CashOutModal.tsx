import { useState, useEffect, useRef } from 'react';
import { X, Shield, ArrowDownCircle, Wallet, Smartphone, Bitcoin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/store';
import { useToast } from '../ui/Toast';
import clsx from 'clsx';

interface CashOutModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    pendingRequest: boolean;
}

type PaymentMethod = 'gcash' | 'maya' | 'crypto';
type CryptoChain = 'BNB' | 'SOL';

const EXCHANGE_RATE_USDT = 58.50;

export const CashOutModal = ({ isOpen, onClose, onSuccess, pendingRequest }: CashOutModalProps) => {
    const { session, profile } = useAuthStore();
    const { showToast } = useToast();

    const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
    const [amount, setAmount] = useState('');
    const [method, setMethod] = useState<PaymentMethod | null>(null);

    const [accountName, setAccountName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [walletAddress, setWalletAddress] = useState('');
    const [chain, setChain] = useState<CryptoChain>('BNB');

    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(false);
    const isSubmitting = useRef(false);

    useEffect(() => {
        if (!isOpen) {
            setStep(1);
            setAmount('');
            setMethod(null);
            setAccountName('');
            setAccountNumber('');
            setWalletAddress('');
            setChain('BNB');
            setPin('');
            isSubmitting.current = false;
            setLoading(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleAmountNext = () => {
        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            showToast('Please enter a valid amount', 'error');
            return;
        }
        if ((profile?.balance || 0) < Number(amount)) {
            showToast('Insufficient balance', 'error');
            return;
        }
        if (pendingRequest) {
            showToast('You already have a pending request.', 'error');
            return;
        }
        setStep(2);
    };

    const handleMethodNext = () => {
        if (!method) {
            showToast('Please select a payment method', 'error');
            return;
        }
        setStep(3);
    };

    const handleDetailsNext = () => {
        if (method === 'crypto') {
            if (!walletAddress || walletAddress.length < 10) {
                showToast('Please enter a valid wallet address', 'error');
                return;
            }
        } else {
            if (!accountName || !accountNumber) {
                showToast('Please fill in all account details', 'error');
                return;
            }
        }
        setStep(4);
    };

    const handleSubmit = async () => {
        if (!session?.user.id) return;
        if (isSubmitting.current) return;

        if (profile?.security_pin) {
            if (pin !== profile.security_pin) {
                showToast('Invalid Security PIN', 'error');
                return;
            }
        }

        isSubmitting.current = true;
        setLoading(true);

        try {
            const { data: userData } = await supabase
                .from('profiles')
                .select('created_by')
                .eq('id', session.user.id)
                .single();

            if (!userData?.created_by) {
                throw new Error('No upline found.');
            }

            const cryptoAmount = method === 'crypto' ? Number(amount) / EXCHANGE_RATE_USDT : null;

            const { error } = await supabase
                .from('transaction_requests')
                .insert({
                    user_id: session.user.id,
                    upline_id: userData.created_by,
                    amount: Number(amount),
                    type: 'cash_out',
                    status: 'pending',
                    payment_method: method,
                    account_name: method !== 'crypto' ? accountName : null,
                    account_number: method !== 'crypto' ? accountNumber : null,
                    wallet_address: method === 'crypto' ? walletAddress : null,
                    chain: method === 'crypto' ? chain : null,
                    converted_amount: cryptoAmount,
                    exchange_rate: method === 'crypto' ? EXCHANGE_RATE_USDT : null
                });

            if (error) throw error;

            showToast('Cash out requested successfully!', 'success');
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Error:', error);
            showToast(error.message || 'Failed to submit', 'error');
            isSubmitting.current = false;
        } finally {
            setLoading(false);
        }
    };

    const getMethodIcon = (m: PaymentMethod) => {
        switch (m) {
            case 'gcash': return <Smartphone size={16} />;
            case 'maya': return <Wallet size={16} />;
            case 'crypto': return <Bitcoin size={16} />;
        }
    };

    const getMethodBg = (m: PaymentMethod) => {
        switch (m) {
            case 'gcash': return 'bg-blue-500';
            case 'maya': return 'bg-green-500';
            case 'crypto': return 'bg-orange-500';
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
            <div className="bg-casino-dark-800 w-full max-w-sm rounded-2xl border border-casino-gold-500/20 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-3 border-b border-casino-gold-500/10 bg-casino-dark-900 shrink-0">
                    <h2 className="text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/20">
                            <ArrowDownCircle size={16} className="text-white" strokeWidth={2.5} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-casino-gold-500">Cash Out</span>
                            <span className="text-[9px] text-casino-slate-500 normal-case">Step {step} of 4</span>
                        </div>
                    </h2>
                    <button 
                        onClick={onClose} 
                        className="text-casino-slate-400 hover:text-white transition-colors p-1.5 hover:bg-white/5 rounded-lg"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto">
                    {/* Progress Indicator */}
                    <div className="flex justify-between mb-4">
                        {[1, 2, 3, 4].map((s) => (
                            <div key={s} className="flex items-center">
                                <div className={clsx(
                                    "w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold transition-all",
                                    step >= s 
                                        ? "bg-red-500 text-white shadow-lg shadow-red-500/20" 
                                        : "bg-casino-dark-700 text-casino-slate-500 border border-white/5"
                                )}>
                                    {s}
                                </div>
                                {s < 4 && (
                                    <div className={clsx(
                                        "w-6 h-0.5 mx-0.5 transition-all",
                                        step > s ? "bg-red-500/50" : "bg-casino-dark-700"
                                    )} />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Step 1: Amount */}
                    {step === 1 && (
                        <div className="space-y-3">
                            <div className="glass-panel rounded-lg p-3">
                                <label className="text-[10px] font-bold text-casino-gold-500 uppercase tracking-wider mb-2 block">
                                    Amount to Withdraw
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500 font-bold text-xl">₱</span>
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="w-full bg-casino-dark-900 border border-casino-gold-500/20 rounded-lg p-3 pl-10 text-white focus:border-casino-gold-500 outline-none transition-all font-mono text-xl placeholder:text-casino-slate-600"
                                        placeholder="0.00"
                                        autoFocus
                                    />
                                </div>
                                <div className="flex justify-between mt-2">
                                    <span className="text-[10px] text-casino-slate-500">Available</span>
                                    <span className="text-[10px] font-bold text-casino-gold-500">
                                        ₱ {(profile?.balance || 0).toLocaleString()}
                                    </span>
                                </div>
                            </div>
                            <button 
                                onClick={handleAmountNext} 
                                className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold py-3 rounded-lg uppercase tracking-wider text-xs transition-all shadow-lg shadow-red-500/20"
                            >
                                Continue
                            </button>
                        </div>
                    )}

                    {/* Step 2: Method */}
                    {step === 2 && (
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-casino-gold-500 uppercase tracking-wider block mb-2">
                                Select Payment Method
                            </label>

                            {(['gcash', 'maya', 'crypto'] as PaymentMethod[]).map((m) => (
                                <button
                                    key={m}
                                    onClick={() => setMethod(m)}
                                    className={clsx(
                                        "w-full p-2.5 rounded-lg border-2 transition-all flex items-center justify-between group bg-casino-dark-900",
                                        method === m 
                                            ? "border-opacity-100" 
                                            : "border-white/5 hover:border-white/20"
                                    )}
                                    style={method === m ? {
                                        backgroundColor: m === 'gcash' ? 'rgba(59, 130, 246, 0.1)' : 
                                                        m === 'maya' ? 'rgba(34, 197, 94, 0.1)' : 
                                                        'rgba(249, 115, 22, 0.1)',
                                        borderColor: m === 'gcash' ? '#3b82f6' : m === 'maya' ? '#22c55e' : '#f97316'
                                    } : {}}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <div className={clsx("w-9 h-9 rounded-lg flex items-center justify-center text-white shadow-lg", getMethodBg(m))}>
                                            {getMethodIcon(m)}
                                        </div>
                                        <div className="text-left">
                                            <div className="text-white font-semibold text-xs">
                                                {m === 'gcash' ? 'GCash' : m === 'maya' ? 'Maya' : 'Crypto (USDT)'}
                                            </div>
                                            <div className="text-[9px] text-casino-slate-500">
                                                {m === 'crypto' ? `@ ₱${EXCHANGE_RATE_USDT}` : 'Instant'}
                                            </div>
                                        </div>
                                    </div>
                                    {method === m && (
                                        <div className={clsx("w-2.5 h-2.5 rounded-full", getMethodBg(m))} />
                                    )}
                                </button>
                            ))}

                            <div className="flex gap-2 mt-3">
                                <button 
                                    onClick={() => setStep(1)} 
                                    className="flex-1 bg-casino-dark-700 hover:bg-casino-dark-600 text-white font-bold py-3 rounded-lg transition-all text-xs border border-white/5"
                                >
                                    Back
                                </button>
                                <button 
                                    onClick={handleMethodNext} 
                                    className="flex-1 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold py-3 rounded-lg transition-all text-xs shadow-lg shadow-red-500/20"
                                >
                                    Continue
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Details */}
                    {step === 3 && (
                        <div className="space-y-3">
                            {method === 'crypto' ? (
                                <>
                                    <div className="glass-panel rounded-lg p-3 text-center border-orange-500/20">
                                        <div className="text-[10px] text-orange-400 uppercase font-bold mb-1 tracking-wide">You Receive</div>
                                        <div className="text-xl font-black text-white font-mono">
                                            {(Number(amount) / EXCHANGE_RATE_USDT).toFixed(2)} USDT
                                        </div>
                                        <div className="text-[9px] text-casino-slate-500 mt-0.5">1 USDT = ₱{EXCHANGE_RATE_USDT}</div>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold text-casino-gold-500 uppercase tracking-wider mb-1.5 block">
                                            Network Chain
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                onClick={() => setChain('BNB')}
                                                className={clsx(
                                                    "py-2.5 rounded-lg border font-bold text-xs transition-all",
                                                    chain === 'BNB' 
                                                        ? "bg-yellow-500 text-black border-yellow-500 shadow-lg shadow-yellow-500/20" 
                                                        : "bg-casino-dark-900 border-white/10 text-white hover:border-yellow-500/50"
                                                )}
                                            >
                                                BNB Chain
                                            </button>
                                            <button
                                                onClick={() => setChain('SOL')}
                                                className={clsx(
                                                    "py-2.5 rounded-lg border font-bold text-xs transition-all",
                                                    chain === 'SOL' 
                                                        ? "bg-purple-500 text-white border-purple-500 shadow-lg shadow-purple-500/20" 
                                                        : "bg-casino-dark-900 border-white/10 text-white hover:border-purple-500/50"
                                                )}
                                            >
                                                Solana
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold text-casino-gold-500 uppercase tracking-wider mb-1.5 block">
                                            Wallet Address
                                        </label>
                                        <input
                                            value={walletAddress}
                                            onChange={(e) => setWalletAddress(e.target.value)}
                                            className="w-full bg-casino-dark-900 border border-casino-gold-500/20 rounded-lg p-3 text-white focus:border-casino-gold-500 outline-none font-mono text-xs placeholder:text-casino-slate-600"
                                            placeholder="Enter address"
                                        />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className={clsx(
                                        "glass-panel rounded-lg p-3 text-center",
                                        method === 'gcash' ? "border-blue-500/20" : "border-green-500/20"
                                    )}>
                                        <div className={clsx(
                                            "text-[10px] uppercase font-bold mb-1 tracking-wide",
                                            method === 'gcash' ? "text-blue-400" : "text-green-400"
                                        )}>
                                            Amount to Receive
                                        </div>
                                        <div className="text-xl font-black text-white font-mono text-gradient-gold">
                                            ₱ {Number(amount).toLocaleString()}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold text-casino-gold-500 uppercase tracking-wider mb-1.5 block">
                                            Account Name
                                        </label>
                                        <input
                                            value={accountName}
                                            onChange={(e) => setAccountName(e.target.value)}
                                            className="w-full bg-casino-dark-900 border border-casino-gold-500/20 rounded-lg p-3 text-white focus:border-casino-gold-500 outline-none text-xs placeholder:text-casino-slate-600"
                                            placeholder="Full Name"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-bold text-casino-gold-500 uppercase tracking-wider mb-1.5 block">
                                            Phone Number
                                        </label>
                                        <input
                                            value={accountNumber}
                                            onChange={(e) => setAccountNumber(e.target.value)}
                                            className="w-full bg-casino-dark-900 border border-casino-gold-500/20 rounded-lg p-3 text-white focus:border-casino-gold-500 outline-none font-mono text-xs placeholder:text-casino-slate-600"
                                            placeholder="09123456789"
                                        />
                                    </div>
                                </>
                            )}

                            <div className="flex gap-2 mt-3">
                                <button 
                                    onClick={() => setStep(2)} 
                                    className="flex-1 bg-casino-dark-700 hover:bg-casino-dark-600 text-white font-bold py-3 rounded-lg transition-all text-xs border border-white/5"
                                >
                                    Back
                                </button>
                                <button 
                                    onClick={handleDetailsNext} 
                                    className="flex-1 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold py-3 rounded-lg transition-all text-xs shadow-lg shadow-red-500/20"
                                >
                                    Continue
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 4: Confirm / PIN */}
                    {step === 4 && (
                        <div className="space-y-3">
                            <div className="glass-panel rounded-lg p-3 text-center space-y-1.5">
                                <div className="text-[10px] font-bold text-casino-gold-500 uppercase tracking-wider">
                                    Confirm Withdrawal
                                </div>
                                <div className="text-2xl font-black text-white font-mono text-gradient-gold">
                                    ₱ {Number(amount).toLocaleString()}
                                </div>
                                <div className={clsx(
                                    "text-[10px] font-bold uppercase inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full",
                                    method === 'crypto' ? "bg-orange-500/20 text-orange-400" :
                                    method === 'gcash' ? "bg-blue-500/20 text-blue-400" :
                                    "bg-green-500/20 text-green-400"
                                )}>
                                    {method === 'crypto' ? `${chain}` : method}
                                </div>

                                {method === 'crypto' && (
                                    <div className="text-[9px] text-casino-slate-500 break-all px-2 font-mono">{walletAddress}</div>
                                )}
                                {method !== 'crypto' && (
                                    <div className="text-[9px] text-casino-slate-500">{accountName} • {accountNumber}</div>
                                )}
                            </div>

                            {profile?.security_pin && (
                                <div className="glass-panel border-blue-500/20 rounded-lg p-3">
                                    <label className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2 block flex items-center gap-1.5">
                                        <Shield size={12} />
                                        Security PIN
                                    </label>
                                    <input
                                        type="password"
                                        maxLength={4}
                                        value={pin}
                                        onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                                        className="w-full bg-casino-dark-900 border border-casino-gold-500/20 rounded-lg p-3 text-white text-center font-mono text-xl focus:border-casino-gold-500 outline-none tracking-[0.5em] placeholder:text-casino-slate-600"
                                        placeholder="••••"
                                        autoFocus
                                    />
                                </div>
                            )}

                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setStep(3)} 
                                    className="flex-1 bg-casino-dark-700 hover:bg-casino-dark-600 text-white font-bold py-3 rounded-lg transition-all text-xs border border-white/5"
                                >
                                    Back
                                </button>
                                <button
                                    disabled={loading || (profile?.security_pin ? pin.length !== 4 : false)}
                                    onClick={handleSubmit}
                                    className="flex-1 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 disabled:from-casino-dark-700 disabled:to-casino-dark-700 text-white font-bold py-3 rounded-lg uppercase tracking-wider text-xs disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 disabled:shadow-none"
                                >
                                    {loading ? 'Processing...' : 'Confirm'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
