import { supabase } from './supabase';

interface LogAdminActionParams {
    actionType: string;
    targetId?: string;
    targetName?: string;
    details: any;
}

export const logAdminAction = async ({ actionType, targetId, targetName, details }: LogAdminActionParams) => {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { error } = await supabase
            .from('admin_logs')
            .insert({
                admin_id: session.user.id,
                action_type: actionType,
                target_id: targetId,
                target_name: targetName,
                details: details,
                // ip_address: ... // capturing IP might require an edge function or reliance on Supabase logs, skipping for client-side simplicity for now or can add a placeholder
            });

        if (error) {
            console.error('Failed to log admin action:', error);
        }
    } catch (err) {
        console.error('Error logging admin action:', err);
    }
};
