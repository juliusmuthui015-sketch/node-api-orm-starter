import { Mail } from '@/eloquent/Core/Mail';
import { WelcomeEmail } from '@/app/Mail';
import {ListensTo, ShouldQueue} from "@/eloquent/Core/Events/EventDecorators";
import {Listener} from "@/eloquent/Core";

/*
|--------------------------------------------------------------------------
| Send Welcome Email Listener
|--------------------------------------------------------------------------
|
| This listener sends a welcome email when a user registers.
| Uses @ListensTo decorator for automatic registration.
|
*/

interface UserRegisteredPayload {
    userId: string | number;
    email: string;
    name: string;
}

@ListensTo('user.registered')
export class SendWelcomeEmail extends Listener<UserRegisteredPayload> {
    async handle(payload: UserRegisteredPayload): Promise<void> {
        console.log(`[SendWelcomeEmail] Sending welcome email to ${payload.email}`);

        const mailable = new WelcomeEmail(
            payload.name,
            payload.email
        );

        // Queue the email to be sent in the background
        await Mail().queue(mailable, 'emails');

        console.log(`[SendWelcomeEmail] Welcome email queued for ${payload.email}`);
    }
}

/*
|--------------------------------------------------------------------------
| Log User Login Listener
|--------------------------------------------------------------------------
*/

interface UserLoggedInPayload {
    userId: string | number;
    email: string;
    ipAddress?: string;
}

@ListensTo('user.logged_in')
export class LogUserLogin extends Listener<UserLoggedInPayload> {
    async handle(payload: UserLoggedInPayload): Promise<void> {
        console.log(
            `[LogUserLogin] User ${payload.userId} (${payload.email}) logged in` +
            (payload.ipAddress ? ` from ${payload.ipAddress}` : '')
        );

        // In a real app, you might save this to a login_logs table
        // await LoginLog.create({
        //     user_id: payload.userId,
        //     ip_address: payload.ipAddress,
        //     logged_in_at: new Date(),
        // });
    }
}

/*
|--------------------------------------------------------------------------
| Notify Admin On Registration Listener
|--------------------------------------------------------------------------
|
| This listener is queued to run in the background.
|
*/

@ListensTo('user.registered')
@ShouldQueue({ queue: 'notifications' })
export class NotifyAdminOnRegistration extends Listener<UserRegisteredPayload> {
    async handle(payload: UserRegisteredPayload): Promise<void> {
        const adminEmail = process.env.ADMIN_EMAIL;

        if (!adminEmail) {
            console.log('[NotifyAdminOnRegistration] No admin email configured, skipping');
            return;
        }

        console.log(`[NotifyAdminOnRegistration] Notifying admin of new user: ${payload.email}`);

        // Send a simple notification email to admin
        const { mail } = await require('@/eloquent/Core/Services/MailService');

        await mail(
            adminEmail,
            `New User Registration: ${payload.name}`,
            `A new user has registered:\n\nName: ${payload.name}\nEmail: ${payload.email}\nUser ID: ${payload.userId}`,
            { html: false }
        );
    }

    /**
     * Determine if this listener should handle the event.
     */
    shouldHandle(payload: UserRegisteredPayload): boolean {
        // Only notify admin for non-test emails
        return !payload.email.includes('@test.com');
    }
}

