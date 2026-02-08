import { useState, useEffect } from 'react';
import { useAuthStore } from '../../lib/store';
import { supabase } from '../../lib/supabase';
import { User, Lock, Save, Shield, Facebook, Phone, Loader2, Volume2, Settings } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';

export const SettingsPage = () => {
    const { profile, refreshProfile } = useAuthStore();
    const { showToast } = useToast();
    const [facebookUrl, setFacebookUrl] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [isSavingInfo, setIsSavingInfo] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isChangingPassword, setIsChangingPassword] = useState(false);
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [isSettingPin, setIsSettingPin] = useState(false);
    const [audioEnabled, setAudioEnabled] = useState(false);
    const [isSavingSystem, setIsSavingSystem] = useState(false);

    useEffect(() => {
        if (profile) {
            setFacebookUrl(profile.facebook_url || '');
            setPhoneNumber(profile.phone_number || '');
        }
    }, [profile]);

    useEffect(() => {
        const fetchSystemSettings = async () => {
            if (profile?.role !== 'admin') return;
            const { data } = await supabase.from('system_settings').select('value').eq('key', 'audio_chat_enabled').single();
            if (data?.value === 'true') setAudioEnabled(true);
        };
        fetchSystemSettings();
    }, [profile]);

    const handleSaveInfo = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile) return;
        setIsSavingInfo(true);
        try {
            const { error } = await supabase.from('profiles').update({ facebook_url: facebookUrl, phone_number: phoneNumber }).eq('id', profile.id);
            if (error) throw error;
            await refreshProfile();
            showToast('Profile updated!', 'success');
        } catch (error: any) {
            showToast(error.message || 'Failed to update', 'error');
        } finally { setIsSavingInfo(false); }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) { showToast('Passwords do not match', 'error'); return; }
        if (newPassword.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
        setIsChangingPassword(true);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            showToast('Password changed!', 'success');
            setNewPassword(''); setConfirmPassword('');
        } catch (error: any) { showToast(error.message || 'Failed', 'error'); }
        finally { setIsChangingPassword(false); }
    };

    const handleSetPin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile) return;
        if (pin.length !== 4 || isNaN(Number(pin))) { showToast('PIN must be 4 digits', 'error'); return; }
        if (pin !== confirmPin) { showToast('PINs do not match', 'error'); return; }
        setIsSettingPin(true);
        try {
            const { error } = await supabase.from('profiles').update({ security_pin: pin }).eq('id', profile.id);
            if (error) throw error;
            await refreshProfile();
            showToast('PIN set!', 'success');
            setPin(''); setConfirmPin('');
        } catch (error: any) { showToast(error.message || 'Failed', 'error'); }
        finally { setIsSettingPin(false); }
    };

    const handleSaveSystemSettings = async () => {
        if (!profile || profile.role !== 'admin') return;
        setIsSavingSystem(true);
        try {
            const { error } = await supabase.from('system_settings').upsert({ key: 'audio_chat_enabled', value: String(!audioEnabled) });
            if (error) throw error;
            setAudioEnabled(!audioEnabled);
            showToast('Settings updated!', 'success');
        } catch (error: any) { showToast(error.message || 'Failed', 'error'); }
        finally { setIsSavingSystem(false); }
    };

    if (!profile) return null;

    return (
        <div className="space-y-3 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-2">
                <User className="w-5 h-5 text-casino-gold-500" />
                <h1 className="text-lg font-bold text-white">Settings</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* Personal Info */}
                <div className="glass-panel rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <User className="w-4 h-4 text-casino-gold-500" />
                        <h2 className="text-sm font-bold text-white">Personal Info</h2>
                    </div>
                    <form onSubmit={handleSaveInfo} className="space-y-3">
                        <div>
                            <label className="text-[10px] font-semibold text-casino-slate-500 uppercase ml-1">Username</label>
                            <div className="mt-1 px-3 py-2 bg-casino-dark-850 border border-white/10 rounded-lg text-casino-slate-400 text-sm">
                                {profile.username}
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-semibold text-casino-slate-500 uppercase ml-1">Facebook</label>
                            <div className="relative mt-1">
                                <Facebook className="absolute left-3 top-1/2 -translate-y-1/2 text-casino-slate-500" size={14} />
                                <input
                                    type="text"
                                    value={facebookUrl}
                                    onChange={(e) => setFacebookUrl(e.target.value)}
                                    placeholder="Profile URL"
                                    className="w-full bg-casino-dark-850 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-casino-gold-500/50 outline-none"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-semibold text-casino-slate-500 uppercase ml-1">Phone</label>
                            <div className="relative mt-1">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-casino-slate-500" size={14} />
                                <input
                                    type="text"
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                    placeholder="Phone number"
                                    className="w-full bg-casino-dark-850 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:border-casino-gold-500/50 outline-none"
                                />
                            </div>
                        </div>
                        <button type="submit" disabled={isSavingInfo} className="w-full btn-casino-primary py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-bold">
                            {isSavingInfo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save size={14} />}
                            Save
                        </button>
                    </form>
                </div>

                <div className="space-y-3">
                    {/* Password */}
                    <div className="glass-panel rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Lock className="w-4 h-4 text-red-400" />
                            <h2 className="text-sm font-bold text-white">Change Password</h2>
                        </div>
                        <form onSubmit={handleChangePassword} className="space-y-3">
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="New password"
                                className="w-full bg-casino-dark-850 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-red-500/50 outline-none"
                            />
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Confirm password"
                                className="w-full bg-casino-dark-850 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-red-500/50 outline-none"
                            />
                            <button type="submit" disabled={isChangingPassword || !newPassword} className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50">
                                {isChangingPassword ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Update Password'}
                            </button>
                        </form>
                    </div>

                    {/* Security PIN */}
                    <div className="glass-panel rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4 text-blue-400" />
                                <h2 className="text-sm font-bold text-white">Security PIN</h2>
                            </div>
                            {profile.security_pin && (
                                <span className="px-2 py-0.5 bg-green-500/10 text-green-500 text-[10px] rounded-full font-semibold">Active</span>
                            )}
                        </div>
                        <form onSubmit={handleSetPin} className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <input
                                    type="password"
                                    maxLength={4}
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                                    placeholder="Enter PIN"
                                    className="w-full bg-casino-dark-850 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white text-center font-mono focus:border-blue-500/50 outline-none"
                                />
                                <input
                                    type="password"
                                    maxLength={4}
                                    value={confirmPin}
                                    onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, ''))}
                                    placeholder="Confirm PIN"
                                    className="w-full bg-casino-dark-850 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white text-center font-mono focus:border-blue-500/50 outline-none"
                                />
                            </div>
                            <button type="submit" disabled={isSettingPin || pin.length !== 4} className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-50">
                                {isSettingPin ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (profile.security_pin ? 'Update PIN' : 'Set PIN')}
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            {/* System Settings (Admin Only) */}
            {profile.role === 'admin' && (
                <div className="glass-panel rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Settings className="w-4 h-4 text-purple-400" />
                        <h2 className="text-sm font-bold text-white">System Settings</h2>
                        <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] rounded-full font-semibold">Admin</span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-casino-dark-850 rounded-lg">
                        <div className="flex items-center gap-3">
                            <Volume2 size={18} className={audioEnabled ? 'text-green-500' : 'text-casino-slate-500'} />
                            <div>
                                <h3 className="text-sm font-semibold text-white">Audio Chat Reply</h3>
                                <p className="text-[10px] text-casino-slate-500">AI voice responses in support chat</p>
                            </div>
                        </div>
                        <button
                            onClick={handleSaveSystemSettings}
                            disabled={isSavingSystem}
                            className={`relative w-10 h-5 rounded-full transition-colors ${audioEnabled ? 'bg-green-500' : 'bg-casino-slate-700'}`}
                        >
                            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${audioEnabled ? 'left-5' : 'left-0.5'}`} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
