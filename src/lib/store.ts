import { create } from 'zustand';
import { supabase } from './supabase';
import type { Profile } from '../types';
import type { Session } from '@supabase/supabase-js';

import type { RealtimeChannel } from '@supabase/supabase-js';

interface AuthState {
    session: Session | null;
    profile: Profile | null;
    loading: boolean;
    initialized: boolean;
    channel: RealtimeChannel | null;
    profileChannelUserId: string | null;
    ensureProfileChannel: (userId: string) => void;
    initialize: () => Promise<void>;
    signOut: () => Promise<void>;
    refreshProfile: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    session: null,
    profile: null,
    loading: true,
    initialized: false,
    channel: null,
    profileChannelUserId: null,

    // Keep a single realtime subscription to the current user's profile row,
    // so balance/role/status updates propagate without manual polling.
    // This also allows us to receive the initial INSERT if the profile is created after auth.
    ensureProfileChannel: (userId: string) => {
        const currentChannel = get().channel;
        const currentUserId = get().profileChannelUserId;

        if (currentChannel && currentUserId === userId) return;

        if (currentChannel) {
            supabase.removeChannel(currentChannel);
            set({ channel: null, profileChannelUserId: null });
        }

        const channel = supabase
            .channel(`profile:${userId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'profiles',
                    filter: `id=eq.${userId}`,
                },
                (payload) => {
                    if ((payload as any)?.new) {
                        set({ profile: (payload as any).new as Profile });
                    }
                },
            )
            .subscribe();

        set({ channel, profileChannelUserId: userId });
    },

    initialize: async () => {
        if (get().initialized) return;
        set({ initialized: true });

        try {
            // 1. Get initial session
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (sessionError) throw sessionError;

            if (!session) {
                set({ session: null, profile: null, loading: false });
            } else {
                // Initial profile fetch
                const { data: profile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .maybeSingle();

                set({ session, profile: profile as Profile, loading: false });

                // Always ensure the profile realtime subscription exists (even if profile is currently null).
                get().ensureProfileChannel(session.user.id);
            }

            // 2. Listen for auth changes
            supabase.auth.onAuthStateChange(async (event, session) => {
                console.log("Auth state changed:", event);

                if (event === 'SIGNED_OUT' || !session) {
                    set({ session: null, profile: null, loading: false });
                    // Clean up existing subscription if any
                    const currentChannel = get().channel;
                    if (currentChannel) {
                        supabase.removeChannel(currentChannel);
                        set({ channel: null, profileChannelUserId: null });
                    }
                    return;
                }

                if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
                    // Ensure the profile realtime subscription exists for the active user.
                    get().ensureProfileChannel(session.user.id);

                    // Update session reference
                    const currentProfile = get().profile;

                    // If we don't have a profile yet, or user changed, fetch it
                    if (!currentProfile || currentProfile.id !== session.user.id) {
                        // If user changed, drop the previous profile immediately to avoid showing the wrong user.
                        if (currentProfile && currentProfile.id !== session.user.id) {
                            set({ profile: null });
                        }

                        const { data: profile } = await supabase
                            .from('profiles')
                            .select('*')
                            .eq('id', session.user.id)
                            .maybeSingle();

                        set({ session, profile: profile as Profile, loading: false });

                    } else {
                        // Just update session if profile is already loaded
                        set({ session, loading: false });
                    }
                }
            });

        } catch (error) {
            console.error("Auth initialization error:", error);
            set({ session: null, profile: null, loading: false });
        }
    },

    signOut: async () => {
        try {
            await supabase.auth.signOut();
            const currentChannel = get().channel;
            if (currentChannel) {
                supabase.removeChannel(currentChannel);
            }
        } finally {
            set({ session: null, profile: null, channel: null, profileChannelUserId: null });
        }
    },

    refreshProfile: async () => {
        const session = get().session;
        if (!session) return;

        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .maybeSingle();

            if (profile) {
                set({ profile: profile as Profile });
            }
        } catch (error) {
            console.error("Profile refresh error:", error);
        }
    }
}));
