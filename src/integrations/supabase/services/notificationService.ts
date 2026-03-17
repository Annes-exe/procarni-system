import { supabase } from "../client";

export interface Notification {
    id: string;
    user_id: string;
    title: string;
    message: string;
    type: 'crud' | 'price_alert' | 'reminder';
    resource_type: 'quote_request' | 'purchase_order' | 'service_order' | 'material' | null;
    resource_id: string | null;
    is_read: boolean;
    created_at: string;
}

export const notificationService = {
    async getNotifications(): Promise<Notification[]> {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching notifications:', error);
            throw error;
        }

        return data || [];
    },

    async markAsRead(id: string): Promise<void> {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id);

        if (error) {
            console.error('Error marking notification as read:', error);
            throw error;
        }
    },

    async markAllAsRead(): Promise<void> {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', userData.user.id)
            .eq('is_read', false);

        if (error) {
            console.error('Error marking all notifications as read:', error);
            throw error;
        }
    },

    async deleteAllRead(): Promise<void> {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;

        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('user_id', userData.user.id)
            .eq('is_read', true);

        if (error) {
            console.error('Error deleting read notifications:', error);
            throw error;
        }
    },

    subscribeToNotifications(onNotification: (notification: Notification) => void) {
        return supabase
            .channel('notifications-changes')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                },
                (payload) => {
                    onNotification(payload.new as Notification);
                }
            )
            .subscribe();
    },

    async createNotification(notification: Partial<Notification>): Promise<Notification> {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) throw new Error("No user logged in");

        const { data, error } = await supabase
            .from('notifications')
            .insert([{
                ...notification,
                user_id: notification.user_id || userData.user.id,
                created_at: new Date().toISOString(),
                is_read: false
            }])
            .select()
            .single();

        if (error) {
            console.error('Error creating notification:', error);
            throw error;
        }

        return data;
    }
};
