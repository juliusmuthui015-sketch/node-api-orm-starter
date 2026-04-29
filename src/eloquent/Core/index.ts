/*
|--------------------------------------------------------------------------
| Core Module Exports
|--------------------------------------------------------------------------
|
| Export all core modules from this directory.
|
*/

// Events
export * from "./Events";

// Mail
export * from "./Mail";

// Services
export {
  MailManager,
  Mailer,
  Mail,
  sendMail,
  queueMail,
  mail,
  MailService,
} from "./Services/MailService";
