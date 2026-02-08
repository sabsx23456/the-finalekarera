import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../ui/Toast';
import { Percent, DollarSign, Save, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

interface FinancialSetting {
    key: string;
    value: string;
    description: string;
}

export const FinancialSettings = () => {
    const [settings, setSettings] = useState<FinancialSetting[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { showToast } = useToast();

    const fetchSettings = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('app_settings')
            .select('*')
            .in('key', [
                'plasada_rate',
                'commission_agent_direct',
                'commission_master_override',
                'commission_admin_share'
            ]);

        if (error) {
            console.error('Error fetching settings:', error);
            showToast('Failed to load settings', 'error');
        } else {
            setSettings(data || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const handleChange = (key: string, newValue: string) => {
        setSettings(prev => prev.map(s => s.key === key ? { ...s, value: newValue } : s));
    };

    const handleSave = async (key: string) => {
        setSaving(true);
        const setting = settings.find(s => s.key === key);
        if (!setting) return;

        // Validation: Verify it is a valid number
        const val = parseFloat(setting.value);
        if (isNaN(val) || val < 0 || val > 1) {
            showToast('Invalid value. Must be a decimal (e.g. 0.04 for 4%)', 'error');
            setSaving(false);
            return;
        }

        // --- VALIDATION: Total Commissions <= Plasada Rate ---
        const getVal = (k: string) => {
            // Use current pending value if it's the one being edited, otherwise use stored state
            const s = settings.find(i => i.key === k);
            return s ? parseFloat(s.value) : 0;
        };

        const plasadaRate = key === 'plasada_rate' ? val : getVal('plasada_rate');
        const agentComm = key === 'commission_agent_direct' ? val : getVal('commission_agent_direct');
        const masterComm = key === 'commission_master_override' ? val : getVal('commission_master_override');
        const adminComm = key === 'commission_admin_share' ? val : getVal('commission_admin_share');

        const totalCommissions = agentComm + masterComm + adminComm;

        // Floating point precision fix
        if (parseFloat(totalCommissions.toFixed(4)) > parseFloat(plasadaRate.toFixed(4))) {
            showToast(`Rejected: Total Commissions (${(totalCommissions * 100).toFixed(2)}%) cannot exceed Plasada Rate (${(plasadaRate * 100).toFixed(2)}%)`, 'error');
            setSaving(false);
            return;
        }

        // --- DYNAMIC DESCRIPTION UPDATE ---
        let newDescription = setting.description;
        const percent = (val * 100).toFixed(val < 0.01 ? 2 : 0).replace(/\.00$/, ''); // e.g. "4" or "0.5"

        if (key === 'plasada_rate') {
            newDescription = `House fee percentage (${val} = ${percent}%) taken from gross pot`;
        } else if (key === 'commission_agent_direct') {
            newDescription = `Commission rate for direct agent referrals (${percent}%)`;
        } else if (key === 'commission_master_override') {
            newDescription = `Commission override for master agents (${percent}%)`;
        } else if (key === 'commission_admin_share') {
            newDescription = `Remaining share kept by admin/house (${percent}%)`;
        }

        const { error } = await supabase
            .from('app_settings')
            .update({
                value: setting.value,
                description: newDescription
            })
            .eq('key', key);

        if (error) {
            showToast('Failed to save: ' + error.message, 'error');
        } else {
            showToast('Setting updated successfully.', 'success');
            // Update local state description
            setSettings(prev => prev.map(s => s.key === key ? { ...s, description: newDescription } : s));
        }
        setSaving(false);
    };

    return (
        <div className="glass-panel rounded-2xl p-6 md:p-10 border-casino-gold-400/10 h-fit">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                <div>
                    <h2 className="text-white font-display font-black text-xl uppercase tracking-wider flex items-center gap-3">
                        <DollarSign className="text-casino-gold-400" />
                        Platform Fees & Commissions
                    </h2>
                    <p className="text-casino-slate-500 text-sm mt-1">Configure global rates (Decimal Format: 0.04 = 4%)</p>
                </div>
                <button
                    onClick={fetchSettings}
                    className="p-2 hover:bg-white/5 rounded-lg text-casino-slate-500 transition-colors"
                >
                    <RefreshCw size={18} className={clsx(loading && "animate-spin")} />
                </button>
            </div>

            <div className="space-y-6">
                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}
                    </div>
                ) : (
                    settings.map((setting) => (
                        <div key={setting.key} className="bg-casino-dark-800/50 p-4 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                            <div className="flex flex-col md:flex-row gap-4 items-end md:items-center justify-between">
                                <div className="flex-1">
                                    <h4 className="text-white font-bold text-sm uppercase tracking-wider mb-1">
                                        {setting.key.replace(/_/g, ' ')}
                                    </h4>
                                    <p className="text-casino-slate-500 text-xs">
                                        {setting.description}
                                    </p>
                                </div>

                                <div className="flex items-center gap-3 w-full md:w-auto">
                                    {setting.key === 'plasada_rate' ? (
                                        <div className="relative flex-1 md:w-48">
                                            <select
                                                value={setting.value}
                                                onChange={(e) => handleChange(setting.key, e.target.value)}
                                                className="w-full bg-black/40 text-white font-mono pl-3 pr-8 py-2 rounded-lg border border-white/10 focus:border-casino-gold-400 outline-none appearance-none cursor-pointer"
                                            >
                                                <option value="0.04">192 Plasada (4%)</option>
                                                <option value="0.05">190 Plasada (5%)</option>
                                                <option value="0.06">188 Plasada (6%)</option>
                                                <option value="0.07">186 Plasada (7%)</option>
                                                <option value="0.08">184 Plasada (8%)</option>
                                                <option value="0.09">182 Plasada (9%)</option>
                                                <option value="0.10">180 Plasada (10%)</option>
                                            </select>
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-casino-slate-500 pointer-events-none">
                                                <Percent size={12} />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="relative flex-1 md:w-32">
                                            <input
                                                type="text"
                                                value={setting.value}
                                                onChange={(e) => handleChange(setting.key, e.target.value)}
                                                className="w-full bg-black/40 text-white font-mono pl-3 pr-8 py-2 rounded-lg border border-white/10 focus:border-casino-gold-400 outline-none text-right"
                                            />
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-casino-slate-500 pointer-events-none">
                                                <Percent size={12} />
                                            </div>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => handleSave(setting.key)}
                                        disabled={saving}
                                        className="p-2 bg-casino-gold-400/10 text-casino-gold-400 hover:bg-casino-gold-400 hover:text-black rounded-lg transition-all"
                                    >
                                        <Save size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}

                {settings.length === 0 && !loading && (
                    <div className="text-center py-8 text-casino-slate-500">
                        No settings found. Run the update script.
                    </div>
                )}
            </div>
        </div>
    );
};
