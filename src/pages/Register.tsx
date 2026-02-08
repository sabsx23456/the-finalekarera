import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { supabase } from '../lib/supabase';
import Logo from '../assets/logo.png';
import { ShieldAlert, User, Lock, Phone, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export const Register = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const refCode = searchParams.get('ref');

    // States
    const [isCheckingRef, setIsCheckingRef] = useState(true);
    const [isValidRef, setIsValidRef] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [registrationError, setRegistrationError] = useState<string | null>(null);

    const { register, handleSubmit, formState: { errors } } = useForm({
        defaultValues: {
            username: '',
            contact: '',
            password: ''
        }
    });

    // Validate Referral Code on Mount
    useEffect(() => {
        const validateReferral = async () => {
            if (!refCode) {
                setIsCheckingRef(false);
                setIsValidRef(false);
                return;
            }

            try {
                // Use RPC to check referral code (bypasses RLS)
                const { data, error } = await supabase
                    .rpc('validate_referral_code', { code: refCode });

                if (error || !data) {
                    setIsValidRef(false);
                } else {
                    setIsValidRef(true);
                }
            } catch (err) {
                console.error("Referral Check Error:", err);
                setIsValidRef(false);
            } finally {
                setIsCheckingRef(false);
            }
        };

        validateReferral();
    }, [refCode]);

    const normalizePhoneNumber = (input: string): string | null => {
        let clean = input.replace(/[^\d+]/g, '');
        // Handle PH formats
        if (clean.startsWith('09') && clean.length === 11) return '+63' + clean.substring(1);
        if (clean.startsWith('9') && clean.length === 10) return '+63' + clean;
        if (clean.startsWith('639') && clean.length === 12) return '+' + clean;
        if (clean.startsWith('+639') && clean.length === 13) return clean;
        return null; // Return null if not a recognized phone format, might be email
    };

    const onSubmit = async (data: any) => {
        setIsSubmitting(true);
        setRegistrationError(null);

        try {
            const { username, contact, password } = data;

            // Determine Identity (Email vs Phone)
            let emailToRegister = contact.trim();
            let phoneNumberToSave: string | null = null;

            const normalizedPhone = normalizePhoneNumber(contact);

            if (normalizedPhone) {
                // It's a phone number, convert to dummy email
                phoneNumberToSave = normalizedPhone;
                emailToRegister = `${normalizedPhone.replace('+', '')}@sabong-app.com`;
            } else if (!contact.includes('@')) {
                throw new Error("Please enter a valid email or mobile number.");
            }

            // 1. Sign Up with Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: emailToRegister,
                password: password,
                options: {
                    data: {
                        username: username,
                        role: 'user' // Default role
                    }
                }
            });

            if (authError) throw authError;

            if (authData.user) {
                // 2. Create Profile Entry
                // Note: The trigger 'handle_new_user' might run automatically. 
                // We should try to UPDATE the profile first, if it exists (from trigger), or INSERT if not.
                // However, triggers usually handle the creation. Let's assume trigger creates basics, we update details.
                // Or safely upsert.

                // Let's check if profile exists first to be safe, or just update using upsert
                const { error: profileError } = await supabase
                    .from('profiles')
                    .upsert({
                        id: authData.user.id,
                        username: username,
                        phone_number: phoneNumberToSave,
                        role: 'user',
                        status: 'pending',
                        referral_code: null, // User's own referral code is generated later or null for now
                        // We need to track WHO referred them. 
                        // The current schema doesn't seem to have 'referred_by' column in profiles based on types/index.ts?
                        // Let's check schemas again, but for now we register them.
                        // Assuming 'referral_code' in profile is THEIR code, not who referred them.
                        // Wait, looking at 'profiles' columns earlier: 'created_by' might be the referrer? 
                        // Or is there a relationship? 
                        // 'created_by' is UUID. Let's find the referrer's UUID.
                    });

                // Find Referrer UUID
                if (refCode) {
                    const { data: referrer } = await supabase
                        .from('profiles')
                        .select('id')
                        .eq('referral_code', refCode)
                        .single();

                    if (referrer) {
                        // Update created_by to referrer's ID if that's how we track referrals
                        await supabase
                            .from('profiles')
                            .update({ created_by: referrer.id })
                            .eq('id', authData.user.id);
                    }
                }

                if (profileError) {
                    console.error("Profile Creation/Update Error:", profileError);
                    // Continue anyway, auth is created
                }

                toast.success("Account created successfully!");
                navigate('/login');
            }

        } catch (err: any) {
            console.error("Registration Error:", err);
            setRegistrationError(err.message || "Failed to register. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- RENDER STATES ---

    if (isCheckingRef) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-casino-dark-950 text-white">
                <Loader2 className="w-8 h-8 animate-spin text-casino-gold-500 mb-4" />
                <p className="text-casino-slate-400 text-sm">Validating invitation...</p>
            </div>
        );
    }

    if (!isValidRef) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-casino-dark-950">
                <div className="w-full max-w-sm text-center">
                    <div className="flex justify-center mb-6">
                        <div className="p-4 bg-red-500/10 rounded-full border border-red-500/20">
                            <ShieldAlert className="w-10 h-10 text-red-500" />
                        </div>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Invitation Required</h2>
                    <p className="text-casino-slate-400 text-sm mb-6 max-w-[280px] mx-auto">
                        Registration is strictly by invitation only. You need a valid referral link from an agent to create an account.
                    </p>
                    <Link to="/login" className="btn-casino-ghost w-full py-3 rounded-xl block text-sm font-bold">
                        Back to Login
                    </Link>
                </div>
            </div>
        );
    }

    // --- REGISTRATION FORM ---

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-black p-4">
            <div className="w-full max-w-sm">
                {/* Logo */}
                <div className="text-center mb-6">
                    <img src={Logo} alt="SABONG192" className="w-36 h-auto mx-auto mb-4" />
                </div>

                <div className="glass-panel rounded-2xl p-5 border border-white/5">
                    <h2 className="text-lg font-bold text-white text-center mb-1">Create Account</h2>
                    <p className="text-casino-slate-500 text-sm text-center mb-6">Join the premier cockfighting arena</p>

                    {registrationError && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-2 rounded-lg mb-4 text-xs text-center">
                            {registrationError}
                        </div>
                    )}

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

                        {/* Referral Code (Read Only) */}
                        <div className="bg-casino-dark-800/50 p-3 rounded-lg border border-white/5 mb-2">
                            <label className="text-[10px] text-casino-slate-500 uppercase tracking-wider block mb-1">
                                Referral Code
                            </label>
                            <div className="text-casino-gold-500 font-mono font-bold text-sm flex items-center gap-2">
                                {refCode}
                                <span className="text-[10px] px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded border border-green-500/20 font-sans">
                                    VERIFIED
                                </span>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-casino-slate-400 uppercase tracking-wide ml-1">
                                Username
                            </label>
                            <div className="relative mt-1">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-casino-slate-500">
                                    <User size={16} />
                                </div>
                                <input
                                    {...register("username", { required: true, minLength: 3 })}
                                    className="w-full bg-casino-dark-850 border border-white/10 rounded-lg pl-10 pr-3 py-2.5 text-white text-sm placeholder-casino-slate-600 focus:border-casino-gold-500/50 focus:outline-none transition-colors"
                                    placeholder="Choose a username"
                                />
                                {errors.username && <span className="text-xs text-red-400 mt-1 ml-1">Username is required (min 3 chars)</span>}
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-casino-slate-400 uppercase tracking-wide ml-1">
                                Mobile Number / Email
                            </label>
                            <div className="relative mt-1">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-casino-slate-500">
                                    <Phone size={16} />
                                </div>
                                <input
                                    {...register("contact", { required: true })}
                                    className="w-full bg-casino-dark-850 border border-white/10 rounded-lg pl-10 pr-3 py-2.5 text-white text-sm placeholder-casino-slate-600 focus:border-casino-gold-500/50 focus:outline-none transition-colors"
                                    placeholder="0917..."
                                />
                                {errors.contact && <span className="text-xs text-red-400 mt-1 ml-1">Contact is required</span>}
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
                                    {...register("password", { required: true, minLength: 6 })}
                                    className="w-full bg-casino-dark-850 border border-white/10 rounded-lg pl-10 pr-10 py-2.5 text-white text-sm placeholder-casino-slate-600 focus:border-casino-gold-500/50 focus:outline-none transition-colors"
                                    placeholder="Create password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-casino-slate-500 hover:text-white transition-colors text-xs uppercase"
                                >
                                    {showPassword ? "Hide" : "Show"}
                                </button>
                                {errors.password && <span className="text-xs text-red-400 mt-1 ml-1">Password must be at least 6 characters</span>}
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full btn-casino-primary py-3 rounded-lg flex items-center justify-center gap-2 mt-2 text-sm font-bold"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Creating Account...</span>
                                </>
                            ) : (
                                <>
                                    <span>Register Account</span>
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-4 text-center">
                        <Link to="/login" className="text-xs text-casino-slate-500 hover:text-white transition-colors">
                            Already have an account? Sign In
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};
