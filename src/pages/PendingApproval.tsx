// Link removed as it was unused
import { useAuthStore } from '../lib/store';
import { Clock, LogOut, Phone, Facebook } from 'lucide-react';

export const PendingApproval = () => {
    const { profile, signOut } = useAuthStore();

    return (
        <div className="min-h-screen bg-[#0d0d0d] flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-neutral-800 border border-neutral-700 rounded-2xl p-8 shadow-2xl text-center space-y-6">
                <div className="flex justify-center">
                    <div className="bg-yellow-500/10 p-4 rounded-full animate-pulse">
                        <Clock className="w-12 h-12 text-yellow-500" />
                    </div>
                </div>

                <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-white">Account Pending Approval</h2>
                    <p className="text-neutral-400 text-sm">
                        Hello <span className="text-yellow-500 font-bold">{profile?.username}</span>!
                        Your account is currently waiting for approval from your referring agent.
                    </p>
                </div>

                <div className="bg-neutral-900/50 rounded-xl p-4 text-left space-y-3">
                    <p className="text-xs font-bold text-neutral-500 uppercase tracking-widest border-b border-neutral-800 pb-2">Your Provided Info</p>
                    <div className="flex items-center gap-3 text-sm">
                        <Phone className="w-4 h-4 text-neutral-400" />
                        <span className="text-white">{profile?.phone_number || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <Facebook className="w-4 h-4 text-neutral-400" />
                        <span className="text-white truncate">{profile?.facebook_url || 'N/A'}</span>
                    </div>
                </div>

                <p className="text-xs text-neutral-500">
                    Please contact your agent or master agent to expedite your approval process.
                </p>

                <div className="pt-4">
                    <button
                        onClick={() => signOut()}
                        className="flex items-center justify-center gap-2 w-full py-3 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg font-bold transition-all"
                    >
                        <LogOut className="w-4 h-4" />
                        Logout
                    </button>
                </div>
            </div>
        </div>
    );
};
