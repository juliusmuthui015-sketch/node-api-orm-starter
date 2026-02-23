/*
|--------------------------------------------------------------------------
| Broadcast Service Provider
|--------------------------------------------------------------------------
|
| This service provider bootstraps the broadcasting system.
| Register your channel authorizations here.
|
*/

import { ServiceProvider } from '@/eloquent/Providers/ServiceProvider';
import { Broadcast, getBroadcastManager } from '@/eloquent/Core/Broadcasting';
import jwt from "jsonwebtoken";
import User from "../Models/User/User";

export class BroadcastServiceProvider extends ServiceProvider {
    /**
     * Register any application services.
     */
    register(): void {
        // Broadcasting is registered lazily
    }

    /**
     * Bootstrap any application services.
     */
    async boot(): Promise<void> {
        const driver = await Broadcast.manager().driver()
        driver.setAuthenticator(async (token: string):Promise<any> => {
            const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change';
            try {
                const decoded = jwt.verify(token, JWT_SECRET) as any;
                const uid = decoded.sub;

                // Load full user model (including roles and permissions)
                const userModel = await User.with(['profile', 'roles', 'roles.permissions']).find(uid);
                if (!userModel) return null;

                await userModel.update({
                    last_seen_at: new Date(),
                });

                await userModel.refresh();

                return userModel.toJSON();
            } catch (e) {
                return null
            }
        })
        Broadcast.manager().setDriver(driver);
        // Register channel authorizations
        this.channels();
    }

    /**
     * Register the channel authorizations.
     * Override this method to define your channels.
     *
     * @example
     * channels(): void {
     *     // Private channel for user-specific notifications
     *     Broadcast.private('notifications.{userId}', (user, userId) => {
     *         return user.id === parseInt(userId);
     *     });
     *
     *     // Presence channel for chat rooms
     *     Broadcast.presence('chat.{roomId}', (user, roomId) => {
     *         // Check if user has access to the room
     *         if (!user.rooms.includes(roomId)) return false;
     *         // Return user info for presence
     *         return {
     *             id: user.id,
     *             name: user.name,
     *             avatar: user.avatar,
     *         };
     *     });
     *
     *     // Private channel for order updates
     *     Broadcast.private('orders.{orderId}', async (user, orderId) => {
     *         const order = await Order.find(orderId);
     *         return order && order.user_id === user.id;
     *     });
     * }
     */
    protected channels(): void {
        // Example channels - override in your app's BroadcastServiceProvider

        // User notifications (private)
        Broadcast.private('notifications.{userId}', (user, userId) => {
            return user && user.id === parseInt(userId);
        });

        // User-specific channel
        Broadcast.private('user.{userId}', (user, userId) => {
            return user && user.id === parseInt(userId);
        });

        // Admin channel (private)
        Broadcast.private('admin', (user) => {
            return user && user.role === 'admin';
        });

        // Public announcements channel
        Broadcast.public('announcements');

        // Example presence channel for online users
        Broadcast.presence('online', (user) => {
            if (!user) return false;
            return {
                id: user.id,
                name: user.name,
            };
        });
    }
}

