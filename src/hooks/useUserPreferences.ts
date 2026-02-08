import { useEffect, useState } from 'react';

export type OddsFormat = 'decimal' | 'hong-kong' | 'malay';

export type PreferenceState = {
    oddsFormat: OddsFormat;
    quickBet: boolean;
    confirmBets: boolean;
    soundEffects: boolean;
    matchAlerts: boolean;
    payoutAlerts: boolean;
    walletAlerts: boolean;
};

export const defaultPreferences: PreferenceState = {
    oddsFormat: 'decimal',
    quickBet: true,
    confirmBets: true,
    soundEffects: true,
    matchAlerts: true,
    payoutAlerts: true,
    walletAlerts: true,
};

type PreferencesEventDetail = {
    userId: string;
    preferences: PreferenceState;
};

const preferencesEventName = 'user-preferences-updated';

const getPreferencesKey = (userId: string) => `user-preferences:${userId}`;

export const loadUserPreferences = (userId: string) => {
    try {
        const stored = localStorage.getItem(getPreferencesKey(userId));
        if (!stored) return defaultPreferences;
        const parsed = JSON.parse(stored) as Partial<PreferenceState>;
        return { ...defaultPreferences, ...parsed };
    } catch (error) {
        console.error("Error loading preferences:", error);
        return defaultPreferences;
    }
};

export const saveUserPreferences = (userId: string, preferences: PreferenceState) => {
    localStorage.setItem(getPreferencesKey(userId), JSON.stringify(preferences));
    window.dispatchEvent(
        new CustomEvent<PreferencesEventDetail>(preferencesEventName, {
            detail: { userId, preferences }
        })
    );
};

export const useUserPreferences = (userId?: string | null) => {
    const [preferences, setPreferences] = useState<PreferenceState>(defaultPreferences);

    useEffect(() => {
        if (!userId) return;
        setPreferences(loadUserPreferences(userId));
    }, [userId]);

    useEffect(() => {
        if (!userId) return;

        const storageKey = getPreferencesKey(userId);

        const handleStorage = (event: StorageEvent) => {
            if (event.key !== storageKey) return;
            if (!event.newValue) {
                setPreferences(defaultPreferences);
                return;
            }
            try {
                const parsed = JSON.parse(event.newValue) as Partial<PreferenceState>;
                setPreferences({ ...defaultPreferences, ...parsed });
            } catch (error) {
                console.error("Error parsing preferences:", error);
            }
        };

        const handlePreferencesUpdate = (event: Event) => {
            const detail = (event as CustomEvent<PreferencesEventDetail>).detail;
            if (!detail || detail.userId !== userId) return;
            setPreferences({ ...defaultPreferences, ...detail.preferences });
        };

        window.addEventListener('storage', handleStorage);
        window.addEventListener(preferencesEventName, handlePreferencesUpdate as EventListener);

        return () => {
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener(preferencesEventName, handlePreferencesUpdate as EventListener);
        };
    }, [userId]);

    return preferences;
};
