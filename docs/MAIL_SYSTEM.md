# Mail System Documentation

This document describes the Laravel-like Mail system implementation for the Rentivo backend.

## Configuration

Mail configuration is located in `src/config/mail.config.ts`. Configure your mail settings using environment variables:

```env
# Mail Driver (smtp, log, array, failover)
MAIL_MAILER=smtp

# SMTP Settings
MAIL_HOST=smtp.mailgun.org
MAIL_PORT=587
MAIL_USERNAME=your-username
MAIL_PASSWORD=your-password
MAIL_ENCRYPTION=tls

# Default From Address
MAIL_FROM_ADDRESS=hello@example.com
MAIL_FROM_NAME="Your App Name"
```

## Supported Drivers

| Driver | Description |
|--------|-------------|
| `smtp` | Send emails via SMTP using nodemailer |
| `log` | Log emails to console (for development) |
| `array` | Store emails in memory (for testing) |
| `failover` | Try multiple drivers in sequence |

## Basic Usage

### Using the `mail()` Helper

The simplest way to send an email:

```typescript
import { mail } from '@/eloquent/Core/Services/MailService';

// Send a plain text email
await mail('user@example.com', 'Welcome!', 'Thank you for joining us.');

// Send an HTML email
await mail('user@example.com', 'Welcome!', '<h1>Welcome!</h1>', { html: true });

// With additional options
await mail('user@example.com', 'Welcome!', 'Thank you!', {
    from: 'support@myapp.com',
    cc: ['admin@myapp.com'],
    bcc: ['logs@myapp.com'],
});
```

### Using the `Mail()` Facade

```typescript
import { Mail } from '@/eloquent/Core/Services/MailService';

// Send via specific mailer
await Mail().mailer('smtp').to('user@example.com').send(mailable);

// Queue an email
await Mail().queue(mailable, 'emails');

// Queue with delay (in seconds)
await Mail().later(mailable, 300, 'emails'); // Send in 5 minutes
```

## Creating Mailables

Mailables are reusable email templates. Create them in `src/app/Mail/`:

```typescript
import { Mailable } from '@/eloquent/Core/Mail';

export class WelcomeEmail extends Mailable {
    constructor(
        private userName: string,
        private userEmail: string
    ) {
        super();
    }

    build(): this {
        return this
            .to(this.userEmail)
            .subject(`Welcome, ${this.userName}!`)
            .html(this.getHtmlContent())
            .text(this.getTextContent())
            .tag(['welcome', 'onboarding']);
    }

    private getHtmlContent(): string {
        return `
            <h1>Welcome, ${this.userName}!</h1>
            <p>Thank you for joining us.</p>
        `;
    }

    private getTextContent(): string {
        return `Welcome, ${this.userName}! Thank you for joining us.`;
    }
}
```

### Sending a Mailable

```typescript
import { sendMail, queueMail } from '@/eloquent/Core/Services/MailService';
import { WelcomeEmail } from '@/app/Mail';

// Send immediately
const welcomeEmail = new WelcomeEmail('John', 'john@example.com');
await sendMail(welcomeEmail);

// Queue for background sending
await queueMail(welcomeEmail, 'emails');
```

## Mailable API

The `Mailable` class provides a fluent API:

```typescript
class MyEmail extends Mailable {
    build(): this {
        return this
            .to('user@example.com')           // Set recipient
            .cc(['cc1@example.com'])          // Set CC
            .bcc(['bcc1@example.com'])        // Set BCC
            .from('sender@example.com')       // Set sender
            .replyTo('reply@example.com')     // Set reply-to
            .subject('My Subject')            // Set subject
            .text('Plain text content')       // Set plain text body
            .html('<p>HTML content</p>')      // Set HTML body
            .attach('/path/to/file.pdf')      // Attach a file
            .attachData(buffer, 'file.pdf')   // Attach raw data
            .priority('high')                 // Set priority (high/normal/low)
            .tag(['tag1', 'tag2'])           // Add tags for tracking
            .metadata({ key: 'value' })       // Add metadata
            .mailer('smtp');                  // Use specific mailer
    }
}
```

## Attachments

```typescript
class InvoiceEmail extends Mailable {
    build(): this {
        return this
            .subject('Your Invoice')
            .html('<p>Please find your invoice attached.</p>')
            // Attach from file path
            .attach('/path/to/invoice.pdf', { filename: 'Invoice.pdf' })
            // Attach raw data
            .attachData(pdfBuffer, 'Invoice.pdf', {
                contentType: 'application/pdf'
            });
    }
}
```

## Mail Events

The mail system fires events that you can listen to:

| Event | Description |
|-------|-------------|
| `mail.sending` | Before an email is sent |
| `mail.sent` | After an email is sent successfully |
| `mail.failed` | When an email fails to send |
| `mail.queued` | When an email is queued |

### Listening to Mail Events

```typescript
import { on } from '@/eloquent/Core/Events';

on('mail.sent', (payload) => {
    console.log('Email sent:', payload.message.subject);
    console.log('Message ID:', payload.result?.messageId);
});

on('mail.failed', (payload) => {
    console.error('Email failed:', payload.error?.message);
});
```

## Testing

### Using the Array Driver

For testing, use the `array` driver to capture emails without sending:

```typescript
import { ArrayDriver } from '@/eloquent/Core/Mail';

// Check sent emails
const emails = ArrayDriver.all();
console.log('Sent emails:', emails.length);

// Get the last email
const lastEmail = ArrayDriver.last();
console.log('Last email subject:', lastEmail?.subject);

// Assert an email was sent to an address
const wasSent = ArrayDriver.assertSentTo('user@example.com');

// Clear all stored emails
ArrayDriver.flush();
```

### Using the Log Driver

For development, use the `log` driver to see emails in the console:

```env
MAIL_MAILER=log
```

## Global Autoload

The following mail functions are available globally without imports:

- `Mail()` - Get the mail manager
- `sendMail(mailable)` - Send a mailable
- `queueMail(mailable, queue?)` - Queue a mailable
- `mail(to, subject, content, options?)` - Send a simple email
- `Mailable` - Base mailable class

## Example Mailables

The following example mailables are included:

- `WelcomeEmail` - Sent to new users
- `PasswordResetEmail` - Password reset requests

See `src/app/Mail/` for implementations.

