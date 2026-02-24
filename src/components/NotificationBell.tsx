import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Bell, Check, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { notificationService, Notification } from '@/integrations/supabase/services/notificationService';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

const NotificationBell = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const navigate = useNavigate();

    const fetchNotifications = async () => {
        try {
            const data = await notificationService.getNotifications();
            setNotifications(data);
            setUnreadCount(data.filter(n => !n.is_read).length);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
        }
    };

    useEffect(() => {
        fetchNotifications();

        let userId: string | null = null;

        const setupSubscription = async () => {
            const { data } = await supabase.auth.getUser();
            userId = data.user?.id || null;

            const subscription = notificationService.subscribeToNotifications((newNotif) => {
                // Only add if it belongs to this user (extra check, RLS should handle this)
                if (userId && newNotif.user_id === userId) {
                    setNotifications(prev => [newNotif, ...prev]);
                    setUnreadCount(prev => prev + 1);
                }
            });

            return subscription;
        };

        const subPromise = setupSubscription();

        return () => {
            subPromise.then(sub => sub?.unsubscribe());
        };
    }, []);

    const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await notificationService.markAsRead(id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (error) {
            console.error('Failed to mark as read:', error);
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await notificationService.markAllAsRead();
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    };

    const handleNotificationClick = (notif: Notification) => {
        if (!notif.is_read) {
            notificationService.markAsRead(notif.id);
            setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        }

        if (notif.resource_type && notif.resource_id) {
            let path = '';
            switch (notif.resource_type) {
                case 'quote_request':
                    path = `/quote-requests/${notif.resource_id}`;
                    break;
                case 'purchase_order':
                    path = `/purchase-orders/${notif.resource_id}`;
                    break;
                case 'service_order':
                    path = `/service-orders/${notif.resource_id}`;
                    break;
                case 'material':
                    path = `/material-management`;
                    break;
            }
            if (path) navigate(path);
        }
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'crud': return <div className="w-2 h-2 rounded-full bg-blue-500 mt-1" />;
            case 'price_alert': return <div className="w-2 h-2 rounded-full bg-amber-500 mt-1" />;
            case 'reminder': return <div className="w-2 h-2 rounded-full bg-red-500 mt-1" />;
            default: return <div className="w-2 h-2 rounded-full bg-gray-500 mt-1" />;
        }
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button className="relative p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-muted-foreground transition-colors mr-2 focus:outline-none focus:ring-2 focus:ring-procarni-primary">
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 && (
                        <span className="absolute top-2 right-2 flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-procarni-primary opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-procarni-primary border-2 border-white dark:border-slate-900"></span>
                        </span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0 mr-4" align="end">
                <div className="flex items-center justify-between p-4 border-b">
                    <h4 className="font-semibold text-sm">Notificaciones</h4>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 px-2 text-procarni-primary hover:text-procarni-primary hover:bg-procarni-primary/10"
                            onClick={handleMarkAllAsRead}
                        >
                            Marcar todas como leídas
                        </Button>
                    )}
                </div>
                <div className="h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground p-4 text-center">
                            <Bell className="h-8 w-8 mb-2 opacity-20" />
                            <p className="text-sm">No tienes notificaciones aún.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {notifications.map((notif) => (
                                <div
                                    key={notif.id}
                                    onClick={() => handleNotificationClick(notif)}
                                    className={cn(
                                        "flex gap-3 p-4 border-b last:border-0 cursor-pointer transition-colors hover:bg-muted/50",
                                        !notif.is_read && "bg-procarni-primary/5"
                                    )}
                                >
                                    {getTypeIcon(notif.type)}
                                    <div className="flex-1 space-y-1">
                                        <p className={cn("text-xs font-medium leading-none", !notif.is_read ? "text-foreground" : "text-muted-foreground")}>
                                            {notif.title}
                                        </p>
                                        <p className="text-sm text-foreground/80 line-clamp-2">
                                            {notif.message}
                                        </p>
                                        <div className="flex items-center justify-between mt-1">
                                            <p className="text-[10px] text-muted-foreground italic">
                                                {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: es })}
                                            </p>
                                            {!notif.is_read && (
                                                <Check
                                                    className="h-3 w-3 text-procarni-primary cursor-pointer hover:scale-125 transition-transform"
                                                    onClick={(e) => handleMarkAsRead(notif.id, e)}
                                                />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <Separator />
                <div className="p-2">
                    <Button variant="ghost" className="w-full text-xs h-8 text-muted-foreground hover:text-foreground" onClick={() => navigate('/notifications')}>
                        Ver todas las notificaciones
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
};

export default NotificationBell;
