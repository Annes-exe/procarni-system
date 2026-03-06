import React, { useState, useEffect } from 'react';
import { Bell, Check, Trash2, Calendar, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { notificationService, Notification } from '@/integrations/supabase/services/notificationService';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

import { supabase } from '@/integrations/supabase/client';

const Notifications = () => {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'unread'>('all');
    const navigate = useNavigate();
    const { toast } = useToast();

    const fetchNotifications = async () => {
        setLoading(true);
        try {
            const data = await notificationService.getNotifications();
            setNotifications(data);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
            toast({
                title: "Error",
                description: "No se pudieron cargar las notificaciones.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();

        let userId: string | null = null;

        const setupSubscription = async () => {
            const { data } = await supabase.auth.getUser();
            userId = data.user?.id || null;

            const subscription = notificationService.subscribeToNotifications((newNotif) => {
                if (userId && newNotif.user_id === userId) {
                    setNotifications(prev => [newNotif, ...prev]);
                }
            });

            return subscription;
        };

        const subPromise = setupSubscription();

        return () => {
            subPromise.then(sub => sub?.unsubscribe());
        };
    }, []);

    const handleMarkAsRead = async (id: string) => {
        try {
            await notificationService.markAsRead(id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        } catch (error) {
            console.error('Failed to mark as read:', error);
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await notificationService.markAllAsRead();
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            toast({
                title: "Éxito",
                description: "Todas las notificaciones han sido marcadas como leídas.",
            });
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    };

    const handleDeleteAllRead = async () => {
        try {
            await notificationService.deleteAllRead();
            setNotifications(prev => prev.filter(n => !n.is_read));
            toast({
                title: "Éxito",
                description: "Todas las notificaciones leídas han sido eliminadas.",
            });
        } catch (error) {
            console.error('Failed to delete read notifications:', error);
            toast({
                title: "Error",
                description: "No se pudieron eliminar las notificaciones leídas.",
                variant: "destructive"
            });
        }
    };

    const handleNotificationClick = (notif: Notification) => {
        if (!notif.is_read) {
            handleMarkAsRead(notif.id);
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

    const filteredNotifications = notifications.filter(n => {
        if (filter === 'unread') return !n.is_read;
        return true;
    });

    const getTypeColor = (type: string) => {
        switch (type) {
            case 'crud': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
            case 'price_alert': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
            case 'reminder': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
            default: return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
        }
    };

    return (
        <div className="container mx-auto py-8 px-4 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Centro de Notificaciones</h1>
                    <p className="text-muted-foreground">Gestiona y revisa todas tus alertas del sistema.</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={handleMarkAllAsRead}
                        disabled={!notifications.some(n => !n.is_read)}
                    >
                        <Check className="h-4 w-4 mr-2" />
                        Marcar todas como leídas
                    </Button>
                    <Button
                        variant="outline"
                        className="text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
                        onClick={handleDeleteAllRead}
                        disabled={!notifications.some(n => n.is_read)}
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar leídas
                    </Button>
                    <Button variant="outline" onClick={fetchNotifications}>
                        Actualizar
                    </Button>
                </div>
            </div>

            <Card className="border-none shadow-sm bg-background/60 backdrop-blur-sm">
                <CardHeader className="pb-3 border-b">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Button
                                variant={filter === 'all' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setFilter('all')}
                            >
                                Todas
                            </Button>
                            <Button
                                variant={filter === 'unread' ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() => setFilter('unread')}
                                className="relative"
                            >
                                Pendientes
                                {notifications.some(n => !n.is_read) && (
                                    <span className="ml-2 bg-procarni-primary text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                        {notifications.filter(n => !n.is_read).length}
                                    </span>
                                )}
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-procarni-primary"></div>
                        </div>
                    ) : filteredNotifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                            <Bell className="h-12 w-12 mb-4 opacity-10" />
                            <p className="text-lg font-medium">No se encontraron notificaciones</p>
                            <p className="text-sm">Todo está al día por aquí.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
                            {filteredNotifications.map((notif) => (
                                <div
                                    key={notif.id}
                                    onClick={() => handleNotificationClick(notif)}
                                    className={cn(
                                        "group flex gap-4 p-6 transition-all hover:bg-muted/50 cursor-pointer relative",
                                        !notif.is_read && "bg-procarni-primary/5"
                                    )}
                                >
                                    <div className={cn("mt-1 p-2 rounded-full h-fit", getTypeColor(notif.type))}>
                                        <Bell className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <h3 className={cn("font-semibold text-lg", !notif.is_read ? "text-foreground" : "text-muted-foreground")}>
                                                    {notif.title}
                                                </h3>
                                                <Badge variant="outline" className="capitalize text-[10px]">
                                                    {notif.type}
                                                </Badge>
                                            </div>
                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                <Calendar className="h-3 w-3" />
                                                {format(new Date(notif.created_at), "d 'de' MMMM, yyyy - HH:mm", { locale: es })}
                                            </span>
                                        </div>
                                        <p className="text-foreground/80 leading-relaxed">
                                            {notif.message}
                                        </p>
                                        <div className="flex items-center gap-4 mt-2">
                                            {!notif.is_read && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 px-2 text-procarni-primary hover:text-procarni-primary hover:bg-procarni-primary/10"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleMarkAsRead(notif.id);
                                                    }}
                                                >
                                                    <Check className="h-3.5 w-3.5 mr-1" />
                                                    Marcar como leída
                                                </Button>
                                            )}
                                            {notif.resource_id && (
                                                <span className="text-xs text-procarni-primary font-medium group-hover:underline">
                                                    Ver detalles →
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {!notif.is_read && (
                                        <span className="absolute left-0 top-0 bottom-0 w-1 bg-procarni-primary"></span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default Notifications;
