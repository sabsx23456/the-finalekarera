import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Trash, CheckCircle, XCircle, Upload, Smartphone, Image as ImageIcon } from 'lucide-react';
import { useToast } from '../ui/Toast';
import clsx from 'clsx';

interface PaymentMethod {
    id: string;
    type: string;
    name: string;
    account_number: string;
    account_name: string;
    qr_code_url: string | null;
    is_active: boolean;
    created_at: string;
}

export const PaymentMethodsSettings = () => {
    const [methods, setMethods] = useState<PaymentMethod[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const { showToast } = useToast();

    // Form State
    const [formData, setFormData] = useState({
        type: 'gcash',
        name: '',
        account_number: '',
        account_name: '',
        qr_code_url: ''
    });
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchMethods();
    }, []);

    const fetchMethods = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('payment_methods')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching payment methods:', error);
            showToast('Failed to load payment methods', 'error');
        } else {
            setMethods(data || []);
        }
        setLoading(false);
    };

    const handleToggleActive = async (id: string, currentStatus: boolean) => {
        const { error } = await supabase
            .from('payment_methods')
            .update({ is_active: !currentStatus })
            .eq('id', id);

        if (error) {
            showToast('Failed to update status', 'error');
        } else {
            fetchMethods();
            showToast('Status updated', 'success');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this payment method?')) return;

        const { error } = await supabase
            .from('payment_methods')
            .delete()
            .eq('id', id);

        if (error) {
            showToast('Failed to delete', 'error');
        } else {
            fetchMethods();
            showToast('Payment method deleted', 'success');
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0]) return;

        const file = e.target.files[0];
        setUploading(true);

        try {
            const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
            const { error: uploadError } = await supabase.storage
                .from('payment_methods')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('payment_methods')
                .getPublicUrl(fileName);

            setFormData(prev => ({ ...prev, qr_code_url: publicUrl }));
            showToast('QR Code uploaded successfully', 'success');
        } catch (error: any) {
            console.error('Upload error:', error);
            showToast('Failed to upload QR code: ' + error.message, 'error');
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const { error } = await supabase
            .from('payment_methods')
            .insert([formData]);

        if (error) {
            showToast('Failed to add payment method', 'error');
        } else {
            showToast('Payment method added', 'success');
            setIsAdding(false);
            setFormData({
                type: 'gcash',
                name: '',
                account_number: '',
                account_name: '',
                qr_code_url: ''
            });
            fetchMethods();
        }
    };

    return (
        <div className="glass-panel p-6 rounded-2xl border-casino-gold-400/10">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-white font-display font-black text-xl uppercase tracking-wider flex items-center gap-3">
                        <Smartphone className="text-casino-gold-400" />
                        Cash In Methods
                    </h2>
                    <p className="text-casino-slate-500 text-sm mt-1">Manage payment options for players.</p>
                </div>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="btn-casino-primary py-2 px-4 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2"
                >
                    <Plus size={16} />
                    {isAdding ? 'Cancel' : 'Add New'}
                </button>
            </div>

            {isAdding && (
                <form onSubmit={handleSubmit} className="mb-8 bg-white/5 p-6 rounded-xl border border-white/10 animate-in fade-in slide-in-from-top-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-casino-gold-400 uppercase tracking-[0.2em]">Platform / Type</label>
                            <select
                                value={formData.type}
                                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                className="w-full bg-casino-input text-white px-4 py-3 rounded-xl focus:border-casino-gold-400 outline-none border border-white/5"
                            >
                                <option value="gcash">GCash</option>
                                <option value="maya">Maya</option>
                                <option value="bank">Bank Transfer</option>
                                <option value="crypto">Crypto (USDT)</option>
                                <option value="other">Other</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-casino-gold-400 uppercase tracking-[0.2em]">Display Name</label>
                            <input
                                type="text"
                                placeholder="e.g. GCash - Main"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full bg-casino-input text-white px-4 py-3 rounded-xl focus:border-casino-gold-400 outline-none border border-white/5"
                                required
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-casino-gold-400 uppercase tracking-[0.2em]">Account Number / Address</label>
                            <input
                                type="text"
                                placeholder="e.g. 09171234567"
                                value={formData.account_number}
                                onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                                className="w-full bg-casino-input text-white px-4 py-3 rounded-xl focus:border-casino-gold-400 outline-none border border-white/5"
                                required
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-casino-gold-400 uppercase tracking-[0.2em]">Account Name</label>
                            <input
                                type="text"
                                placeholder="e.g. John Doe"
                                value={formData.account_name}
                                onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                                className="w-full bg-casino-input text-white px-4 py-3 rounded-xl focus:border-casino-gold-400 outline-none border border-white/5"
                                required
                            />
                        </div>
                        <div className="space-y-1 md:col-span-2">
                            <label className="text-[10px] font-black text-casino-gold-400 uppercase tracking-[0.2em]">QR Code (Optional)</label>
                            <div className="flex items-center gap-4">
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="cursor-pointer bg-black/20 hover:bg-black/40 border-2 border-dashed border-white/10 rounded-xl p-4 flex flex-col items-center justify-center w-full h-32 transition-all"
                                >
                                    {formData.qr_code_url ? (
                                        <img src={formData.qr_code_url} alt="QR Preview" className="h-full object-contain" />
                                    ) : (
                                        <div className="text-center text-white/40">
                                            {uploading ? <span className="animate-pulse">Uploading...</span> : (
                                                <>
                                                    <Upload className="mx-auto mb-2" />
                                                    <span className="text-xs">Click to upload image</span>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end mt-6">
                        <button
                            type="submit"
                            className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-8 rounded-xl uppercase tracking-widest transition-all shadow-lg shadow-green-900/20"
                        >
                            Save Method
                        </button>
                    </div>
                </form>
            )}

            <div className="space-y-3">
                {loading ? (
                    <div className="text-center py-8 text-white/20 animate-pulse">Loading methods...</div>
                ) : methods.length === 0 ? (
                    <div className="text-center py-8 text-white/20">No payment methods configured.</div>
                ) : (
                    methods.map((method) => (
                        <div key={method.id} className="bg-white/5 p-4 rounded-xl flex items-center justify-between border border-white/5 hover:border-white/10 transition-colors">
                            <div className="flex items-center gap-4">
                                <div className={clsx(
                                    "w-10 h-10 rounded-full flex items-center justify-center text-white font-bold uppercase text-xs",
                                    method.type === 'gcash' ? 'bg-blue-600' :
                                        method.type === 'maya' ? 'bg-green-600' :
                                            method.type === 'crypto' ? 'bg-orange-500' : 'bg-purple-600'
                                )}>
                                    {method.type.substring(0, 2)}
                                </div>
                                <div>
                                    <h4 className="text-white font-bold">{method.name}</h4>
                                    <p className="text-xs text-casino-slate-400">{method.account_name} • <span className="font-mono">{method.account_number}</span></p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                {method.qr_code_url && (
                                    <div className="text-white/40" title="Has QR Code">
                                        <ImageIcon size={16} />
                                    </div>
                                )}
                                <button
                                    onClick={() => handleToggleActive(method.id, method.is_active)}
                                    className={clsx(
                                        "p-2 rounded-lg transition-colors",
                                        method.is_active ? "text-green-400 hover:bg-green-400/10" : "text-white/20 hover:text-white"
                                    )}
                                    title={method.is_active ? "Active" : "Inactive"}
                                >
                                    {method.is_active ? <CheckCircle size={18} /> : <XCircle size={18} />}
                                </button>
                                <button
                                    onClick={() => handleDelete(method.id)}
                                    className="p-2 text-red-400/60 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                    title="Delete"
                                >
                                    <Trash size={18} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
