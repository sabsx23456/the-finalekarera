import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import Logo from '../assets/logo.png';
import { Eye, EyeOff, Lock, User, Loader2 } from 'lucide-react';

export const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    const normalizePhoneNumber = (input: string): string | null => {
        let clean = input.replace(/[^\d+]/g, '');
        if (clean.startsWith('09') && clean.length === 11) return '+63' + clean.substring(1);
        if (clean.startsWith('9') && clean.length === 10) return '+63' + clean;
        if (clean.startsWith('639') && clean.length === 12) return '+' + clean;
        if (clean.startsWith('+639') && clean.length === 13) return clean;
        return null;
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            let lookupIdentity = email.trim();
            const normalizedPhone = normalizePhoneNumber(lookupIdentity);
            if (normalizedPhone) lookupIdentity = normalizedPhone;

            const { data: resolvedEmail } = await supabase
                .rpc('get_email_for_login', { identity_input: lookupIdentity });

            let loginIdentifier = resolvedEmail;
            if (!loginIdentifier && normalizedPhone) {
                loginIdentifier = `${normalizedPhone.replace('+', '')}@sabong-app.com`;
            } else if (!loginIdentifier) {
                loginIdentifier = email.trim();
            }

            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: loginIdentifier,
                password,
            });

            if (authError) {
                if (authError.message === 'Invalid login credentials') {
                    throw new Error("Invalid username/phone or password");
                }
                throw authError;
            }

            if (authData.user) {
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('status, banned')
                    .eq('id', authData.user.id)
                    .single();

                if (profile) {
                    if (profile.banned) {
                        await supabase.auth.signOut();
                        throw new Error("This account has been banned due to violation of our terms.");
                    }
                }
                await window.location.reload();
            }
        } catch (err: any) {
            console.error("Login Error:", err);
            setError(err.message || "An unexpected error occurred");
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-black p-4">
            <div className="w-full max-w-sm">
                {/* Logo */}
                <div className="text-center mb-6">
                    <img
                        src={Logo}
                        alt="SABONG192"
                        className="w-36 h-auto mx-auto drop-shadow-[0_0_25px_rgba(255,204,0,0.3)]"
                    />
                </div>

                {/* Login Card */}
                <div className="glass-panel rounded-2xl p-5 border border-white/5">
                    <h2 className="text-lg font-bold text-white text-center mb-1">Welcome Back</h2>
                    <p className="text-casino-slate-500 text-sm text-center mb-4">Sign in to your account</p>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-lg mb-4 text-sm text-center">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-3">
                        <div>
                            <label className="text-xs font-semibold text-casino-slate-400 uppercase tracking-wide ml-1">
                                Username / Phone
                            </label>
                            <div className="relative mt-1">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-casino-slate-500">
                                    <User size={16} />
                                </div>
                                <input
                                    type="text"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-casino-dark-850 border border-white/10 rounded-lg pl-10 pr-3 py-2.5 text-white text-sm placeholder-casino-slate-600 focus:border-casino-gold-500/50 focus:outline-none transition-colors"
                                    placeholder="Enter username or phone"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-casino-slate-400 uppercase tracking-wide ml-1">
                                Password
                            </label>
                            <div className="relative mt-1">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-casino-slate-500">
                                    <Lock size={16} />
                                </div>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-casino-dark-850 border border-white/10 rounded-lg pl-10 pr-10 py-2.5 text-white text-sm placeholder-casino-slate-600 focus:border-casino-gold-500/50 focus:outline-none transition-colors"
                                    placeholder="Enter password"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-casino-slate-500 hover:text-white transition-colors"
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full btn-casino-primary py-3 rounded-lg flex items-center justify-center gap-2 mt-4 text-sm font-bold"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Signing in...</span>
                                </>
                            ) : (
                                <span>Sign In</span>
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <div className="mt-6 text-center">
                    <p className="text-[10px] text-casino-slate-600 uppercase tracking-wider font-medium mb-2">
                        Contact your agent to create an account
                    </p>
                    <div className="flex items-center justify-center gap-4 opacity-40">
                        <span className="text-xs font-bold text-[#00e676]">GCash</span>
                        <span className="text-xs font-bold text-[#0055ff]">Maya</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
