/*
|--------------------------------------------------------------------------
| Mail Module Exports
|--------------------------------------------------------------------------
|
| Export all mail-related classes and utilities.
|
*/

// Types
export * from './types';

// Drivers
export { SmtpDriver, LogDriver, ArrayDriver, FailoverDriver } from './Drivers';

// Mailable
export { Mailable, TextMailable, HtmlMailable } from './Mailable';

// Mail Service & Manager (re-export from Services)
export {
    MailManager,
    Mailer,
    Mail,
    sendMail,
    queueMail,
    mail,
    MailService,
} from '../Services/MailService';

