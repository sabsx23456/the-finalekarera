import { useState, useRef, useEffect } from 'react';
import { X, Upload, Smartphone, Bitcoin, CreditCard, Wallet, AlertCircle, QrCode, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import clsx from 'clsx';
import { useAuthStore } from '../../lib/store';

interface CashInModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface PaymentMethod {
    id: string;
    type: string;
    name: string;
    account_number: string;
    account_name: string;
    qr_code_url: string | null;
}

export const CashInModal = ({ isOpen, onClose, onSuccess }: CashInModalProps) => {
    const { session } = useAuthStore();
    const [step, setStep] = useState<1 | 2>(1);
    const [amount, setAmount] = useState('');
    const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
    const [availableMethods, setAvailableMethods] = useState<PaymentMethod[]>([]);
    const [loadingMethods, setLoadingMethods] = useState(false);

    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isSubmitting = useRef(false);

    useEffect(() => {
        if (isOpen) {
            fetchMethods();
        } else {
            setStep(1);
            setAmount('');
            setSelectedMethod(null);
            setFile(null);
            setPreviewUrl(null);
        }
    }, [isOpen]);

    const fetchMethods = async () => {
        setLoadingMethods(true);
        const { data } = await supabase
            .from('payment_methods')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (data) setAvailableMethods(data);
        setLoadingMethods(false);
    };

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            setPreviewUrl(URL.createObjectURL(selectedFile));
        }
    };

    const handleSubmit = async () => {
        if (!amount || !selectedMethod || !file || !session) return;
        if (isSubmitting.current) return;

        isSubmitting.current = true;
        setLoading(true);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${session.user.id}/${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage
                .from('payment_proofs')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('payment_proofs')
                .getPublicUrl(fileName);

            const { data: userData } = await supabase
                .from('profiles')
                .select('created_by')
                .eq('id', session.user.id)
                .single();

            const uplineId = userData?.created_by;

            if (!uplineId) {
                throw new Error("No upline found to process this request.");
            }

            const { error: insertError } = await supabase
                .from('transaction_requests')
                .insert({
                    user_id: session.user.id,
                    upline_id: uplineId,
                    amount: Number(amount),
                    type: 'cash_in',
                    status: 'pending',
                    payment_method: selectedMethod.type,
                    proof_url: publicUrl
                });

            if (insertError) throw insertError;

            onSuccess();
            onClose();
        } catch (error: any) {
            console.error(error);
            alert(error.message || 'Failed to submit request');
            isSubmitting.current = false;
        } finally {
            setLoading(false);
            isSubmitting.current = false;
        }
    };

    const getIcon = (type: string) => {
        if (type === 'gcash' || type === 'maya') return <Smartphone size={16} />;
        if (type === 'crypto') return <Bitcoin size={16} />;
        if (type === 'bank') return <Wallet size={16} />;
        return <CreditCard size={16} />;
    };

    const getColor = (type: string, isSelected: boolean) => {
        if (type === 'gcash') return isSelected ? "bg-blue-500/20 border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]" : "hover:border-blue-500/50 border-white/10";
        if (type === 'maya') return isSelected ? "bg-green-500/20 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]" : "hover:border-green-500/50 border-white/10";
        if (type === 'crypto') return isSelected ? "bg-orange-500/20 border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.3)]" : "hover:border-orange-500/50 border-white/10";
        return isSelected ? "bg-purple-500/20 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]" : "hover:border-purple-500/50 border-white/10";
    };

    const getBgColor = (type: string) => {
        if (type === 'gcash') return 'bg-blue-500';
        if (type === 'maya') return 'bg-green-500';
        if (type === 'crypto') return 'bg-orange-500';
        return 'bg-purple-500';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
            <div className="bg-casino-dark-800 w-full max-w-md rounded-2xl border border-casino-gold-500/20 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-3 border-b border-casino-gold-500/10 bg-casino-dark-900 shrink-0">
                    <h2 className="text-white font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/20">
                            <Plus size={16} className="text-white" strokeWidth={3} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-casino-gold-500 text-xs">{step === 1 ? 'Cash In' : 'Payment Details'}</span>
                            <span className="text-[9px] text-casino-slate-500 normal-case">Step {step} of 2</span>
                        </div>
                    </h2>
                    <button 
                        onClick={onClose} 
                        className="text-casino-slate-400 hover:text-white transition-colors p-1.5 hover:bg-white/5 rounded-lg"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="p-4 space-y-3 overflow-y-auto">
                    {step === 1 ? (
                        <>
                            {/* Amount Input */}
                            <div className="glass-panel rounded-lg p-3">
                                <label className="text-[10px] font-bold text-casino-gold-500 uppercase tracking-wider mb-2 block">
                                    Amount to Deposit
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-500 font-bold text-xl">₱</span>
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="w-full bg-casino-dark-900 border border-casino-gold-500/20 rounded-lg p-3 pl-10 text-white focus:border-casino-gold-500 outline-none transition-all font-mono text-xl placeholder:text-casino-slate-600"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>

                            {/* Payment Methods */}
                            <div>
                                <label className="text-[10px] font-bold text-casino-gold-500 uppercase tracking-wider mb-2 block">
                                    Select Payment Method
                                </label>
                                <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto pr-1">
                                    {loadingMethods ? (
                                        <div className="text-center py-4 text-casino-slate-500 text-xs animate-pulse">
                                            Loading methods...
                                        </div>
                                    ) : availableMethods.length === 0 ? (
                                        <div className="text-center py-4 text-casino-slate-500 text-xs flex flex-col items-center gap-2 glass-panel rounded-lg">
                                            <AlertCircle className="text-casino-gold-500" size={20} />
                                            <span>No payment methods available</span>
                                        </div>
                                    ) : (
                                        availableMethods.map((method) => (
                                            <button
                                                key={method.id}
                                                onClick={() => setSelectedMethod(method)}
                                                className={clsx(
                                                    "flex items-center gap-3 p-2.5 rounded-lg border transition-all text-left bg-casino-dark-900",
                                                    getColor(method.type, selectedMethod?.id === method.id),
                                                    selectedMethod?.id !== method.id && selectedMethod && "opacity-40"
                                                )}
                                            >
                                                <div className={clsx("w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0 shadow-lg", getBgColor(method.type))}>
                                                    {getIcon(method.type)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-white font-semibold text-xs truncate">{method.name}</div>
                                                    <div className="text-[9px] text-casino-slate-500 uppercase tracking-wide">{method.type}</div>
                                                </div>
                                                {selectedMethod?.id === method.id && (
                                                    <div className="w-2.5 h-2.5 rounded-full bg-casino-gold-500 shadow-[0_0_10px_rgba(255,204,0,0.5)] shrink-0" />
                                                )}
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>

                            <button
                                disabled={!amount || !selectedMethod}
                                onClick={() => setStep(2)}
                                className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 disabled:from-casino-dark-700 disabled:to-casino-dark-700 text-white font-bold py-3 rounded-lg text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-lg shadow-green-500/20 disabled:shadow-none"
                            >
                                Continue
                            </button>
                        </>
                    ) : (
                        <>
                            {/* Amount Display */}
                            <div className="glass-panel rounded-lg p-3 text-center">
                                <div className="text-[10px] text-casino-slate-500 uppercase tracking-wider mb-1">Amount to Send</div>
                                <div className="text-2xl font-black text-white font-mono text-gradient-gold">
                                    ₱ {Number(amount).toLocaleString()}
                                </div>
                            </div>

                            {selectedMethod && (
                                <div className="glass-panel rounded-lg overflow-hidden">
                                    {/* Method Header */}
                                    <div className="flex items-center gap-2 p-2.5 border-b border-casino-gold-500/10 bg-casino-dark-900/50">
                                        <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-lg", getBgColor(selectedMethod.type))}>
                                            {getIcon(selectedMethod.type)}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-xs font-semibold text-white truncate">{selectedMethod.name}</div>
                                            <div className="text-[9px] text-casino-gold-500 uppercase tracking-wide">Payment Details</div>
                                        </div>
                                    </div>

                                    <div className="p-3 space-y-3">
                                        {/* Account Info */}
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="bg-casino-dark-900/50 rounded-lg p-2">
                                                <div className="text-[9px] text-casino-slate-500 uppercase mb-0.5 tracking-wide">Account Name</div>
                                                <div className="text-white font-semibold text-xs truncate">{selectedMethod.account_name}</div>
                                            </div>
                                            <div className="bg-casino-dark-900/50 rounded-lg p-2">
                                                <div className="text-[9px] text-casino-slate-500 uppercase mb-0.5 tracking-wide">Account Number</div>
                                                <div className="text-casino-gold-500 font-mono font-bold text-xs truncate">{selectedMethod.account_number}</div>
                                            </div>
                                        </div>

                                        {/* QR Code */}
                                        {selectedMethod.qr_code_url && (
                                            <div>
                                                <div className="text-[10px] text-casino-slate-500 uppercase mb-2 text-center flex items-center justify-center gap-1">
                                                    <QrCode size={12} className="text-casino-gold-500" />
                                                    Scan QR Code to Pay
                                                </div>
                                                <div className="flex justify-center">
                                                    <div className="bg-white p-2 rounded-lg shadow-[0_0_20px_rgba(255,204,0,0.15)]">
                                                        <img 
                                                            src={selectedMethod.qr_code_url} 
                                                            alt="Payment QR Code" 
                                                            className="w-36 h-36 object-contain" 
                                                        />
                                                    </div>
                                                </div>
                                                <p className="text-[9px] text-casino-slate-500 text-center mt-1.5">
                                                    Open your {selectedMethod.type} app and scan
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Upload Proof */}
                            <div
                                className="border-2 border-dashed border-casino-gold-500/30 rounded-lg p-3 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-casino-gold-500/60 hover:bg-casino-gold-500/5 transition-all bg-casino-dark-900/30"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                                {previewUrl ? (
                                    <div className="relative w-full max-w-[150px] aspect-video rounded-lg overflow-hidden border border-casino-gold-500/20">
                                        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/70 opacity-0 hover:opacity-100 transition-opacity">
                                            <span className="text-white font-semibold text-[10px]">Change Image</span>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="w-10 h-10 rounded-full bg-casino-gold-500/10 flex items-center justify-center">
                                            <Upload className="text-casino-gold-500" size={18} />
                                        </div>
                                        <div className="text-center">
                                            <div className="text-white font-semibold text-xs">Upload Proof</div>
                                            <div className="text-casino-slate-500 text-[10px]">Screenshot of payment</div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setStep(1)}
                                    className="flex-1 py-3 bg-casino-dark-700 hover:bg-casino-dark-600 text-white rounded-lg font-semibold text-xs transition-all border border-white/5"
                                >
                                    Back
                                </button>
                                <button
                                    disabled={!file || loading}
                                    onClick={handleSubmit}
                                    className="flex-1 py-3 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 disabled:from-casino-dark-700 disabled:to-casino-dark-700 text-white rounded-lg font-bold text-xs uppercase tracking-wider disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-500/20 disabled:shadow-none"
                                >
                                    {loading ? 'Submitting...' : 'Submit'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
