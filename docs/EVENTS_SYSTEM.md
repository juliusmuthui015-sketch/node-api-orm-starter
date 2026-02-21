# Events System Documentation

This document describes the Laravel-like Events system implementation for the Rentivo backend.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Dispatching Events](#dispatching-events)
- [Listening for Events](#listening-for-events)
- [Creating Event Classes](#creating-event-classes)
- [Creating Listener Classes](#creating-listener-classes)
- [Event Service Provider](#event-service-provider)
- [Event Subscribers](#event-subscribers)
- [Wildcard Listeners](#wildcard-listeners)
- [Catch-All Listeners](#catch-all-listeners)
- [Queueable Events & Listeners](#queueable-events--listeners)
- [Automatic Event Discovery](#automatic-event-discovery)
- [Event Decorators](#event-decorators)
- [Event Facade](#event-facade)
- [Testing Events](#testing-events)
- [Sync vs Async Dispatch](#sync-vs-async-dispatch)
- [Built-in Events](#built-in-events)
- [Global Autoload](#global-autoload)
- [Best Practices](#best-practices)

---

## Overview

The event system allows you to decouple components of your application by using events and listeners. When something happens (an event), you can trigger multiple listeners to respond independently.

**Key Features:**
- Simple event dispatching with `event()` helper
- Class-based events and listeners
- Wildcard event listening
- Catch-all listeners
- Event subscribers for complex listener registration
- Synchronous and asynchronous dispatch
- Integration with the queue system
- **Automatic event/listener discovery** with decorators
- **Event.fake()** for testing with assertions
- **Queueable listeners** with `@ShouldQueue` decorator

---

## Quick Start

### 1. Dispatch an Event

```typescript
import { event } from '@/eloquent/Core/Events';

// Dispatch a simple event
await event('user.registered', {
    userId: 123,
    email: 'user@example.com',
    name: 'John Doe'
});
```

### 2. Listen for an Event

```typescript
import { on } from '@/eloquent/Core/Events';

on('user.registered', (payload) => {
    console.log('New user registered:', payload.email);
    // Send welcome email, update analytics, etc.
});
```

That's it! The listener will be called every time `user.registered` is dispatched.

---

## Configuration

Events are configured through the `EventServiceProvider` located at:

```
src/app/Providers/EventServiceProvider.ts
```

This provider registers all event-listener mappings when the application boots.

---

## Dispatching Events

### Using the `event()` Helper

The simplest way to dispatch events:

```typescript
import { event } from '@/eloquent/Core/Events';

// Basic dispatch
await event('order.created', { orderId: 456, total: 99.99 });

// Dispatch with complex payload
await event('payment.received', {
    paymentId: 789,
    amount: 150.00,
    currency: 'USD',
    customer: {
        id: 123,
        email: 'customer@example.com'
    }
});
```

### Using the Event Dispatcher Directly

For more control:

```typescript
import { getEventDispatcher } from '@/eloquent/Core/Events';

const dispatcher = getEventDispatcher();

// Async dispatch (waits for all listeners)
await dispatcher.dispatch('user.updated', { userId: 123 });

// Sync dispatch (doesn't wait for async listeners)
dispatcher.dispatchSync('user.updated', { userId: 123 });

// Fire and forget (dispatches in background)
dispatcher.dispatchNow('analytics.track', { event: 'page_view' });
```

### Using Event Classes

For type-safe events:

```typescript
import { UserRegistered } from '@/app/Events';

const event = new UserRegistered(123, 'user@example.com', 'John Doe');
await event.dispatch();
```

---

## Listening for Events

### Using the `on()` Helper

```typescript
import { on } from '@/eloquent/Core/Events';

// Listen for a single event
on('user.registered', (payload) => {
    console.log('User registered:', payload);
});

// Listen for multiple events
on(['user.created', 'user.updated'], (payload) => {
    console.log('User changed:', payload);
});
```

### Using the `once()` Helper

Listen for an event only once:

```typescript
import { once } from '@/eloquent/Core/Events';

once('app.initialized', () => {
    console.log('App initialized! This will only run once.');
});
```

### Removing Listeners with `off()`

```typescript
import { on, off } from '@/eloquent/Core/Events';

// Define a named listener
const myListener = (payload) => {
    console.log('Event received:', payload);
};

// Register the listener
on('my.event', myListener);

// Remove the specific listener
off('my.event', myListener);

// Remove ALL listeners for an event
off('my.event');
```

---

## Creating Event Classes

Events can be defined as classes for better organization and type safety.

### Basic Event Class

Create events in `src/app/Events/`:

```typescript
// src/app/Events/OrderEvents.ts
import { Event } from '@/eloquent/Core/Events';

export class OrderCreated extends Event {
    constructor(
        public orderId: number,
        public customerId: number,
        public total: number,
        public items: Array<{ productId: number; quantity: number }>
    ) {
        super();
    }

    eventName(): string {
        return 'order.created';
    }
}

export class OrderShipped extends Event {
    constructor(
        public orderId: number,
        public trackingNumber: string,
        public carrier: string
    ) {
        super();
    }

    eventName(): string {
        return 'order.shipped';
    }
}
```

### Dispatching Event Classes

```typescript
import { OrderCreated, OrderShipped } from '@/app/Events/OrderEvents';

// Create and dispatch
const orderCreated = new OrderCreated(
    456,
    123,
    99.99,
    [{ productId: 1, quantity: 2 }]
);
await orderCreated.dispatch();

// Or chain it
await new OrderShipped(456, 'TRACK123', 'FedEx').dispatch();
```

### Export Events in Index

```typescript
// src/app/Events/index.ts
export { OrderCreated, OrderShipped } from './OrderEvents';
export { UserRegistered, UserLoggedIn, UserLoggedOut } from './UserEvents';
export { PaymentReceived, PaymentFailed } from './PaymentEvents';

// Re-export base class
export { Event } from '@/eloquent/Core/Events';
```

---

## Creating Listener Classes

Listeners handle events when they are dispatched.

### Basic Listener Class

Create listeners in `src/app/Listeners/`:

```typescript
// src/app/Listeners/OrderListeners.ts
import { Listener } from '@/eloquent/Core/Events';
import { Mail } from '@/eloquent/Core/Services/MailService';

interface OrderCreatedPayload {
    orderId: number;
    customerId: number;
    total: number;
    items: Array<{ productId: number; quantity: number }>;
}

export class SendOrderConfirmation extends Listener<OrderCreatedPayload> {
    async handle(payload: OrderCreatedPayload): Promise<void> {
        console.log(`[SendOrderConfirmation] Order ${payload.orderId} created`);
        
        // Get customer email (you'd fetch this from your database)
        const customerEmail = 'customer@example.com';
        
        // Send confirmation email
        const { mail } = await import('@/eloquent/Core/Services/MailService');
        await mail(
            customerEmail,
            `Order #${payload.orderId} Confirmed`,
            `Thank you for your order! Total: $${payload.total}`,
            { html: false }
        );
    }
}

export class UpdateInventory extends Listener<OrderCreatedPayload> {
    async handle(payload: OrderCreatedPayload): Promise<void> {
        console.log(`[UpdateInventory] Updating inventory for order ${payload.orderId}`);
        
        for (const item of payload.items) {
            // Update inventory logic
            console.log(`  - Product ${item.productId}: -${item.quantity}`);
        }
    }
}

export class NotifyWarehouse extends Listener<OrderCreatedPayload> {
    async handle(payload: OrderCreatedPayload): Promise<void> {
        console.log(`[NotifyWarehouse] Notifying warehouse of order ${payload.orderId}`);
        // Send notification to warehouse system
    }
}
```

### Listener with Queue Support

```typescript
export class GenerateInvoicePdf extends Listener<OrderCreatedPayload> {
    async handle(payload: OrderCreatedPayload): Promise<void> {
        // Generate PDF (potentially slow operation)
        console.log(`[GenerateInvoicePdf] Generating invoice for order ${payload.orderId}`);
    }

    // Return true to queue this listener
    shouldQueue(): boolean {
        return true;
    }

    // Specify queue connection
    queueConnection(): string | null {
        return 'redis';
    }

    // Specify queue name
    queueName(): string | null {
        return 'invoices';
    }
}
```

### Export Listeners in Index

```typescript
// src/app/Listeners/index.ts
export { SendOrderConfirmation, UpdateInventory, NotifyWarehouse } from './OrderListeners';
export { SendWelcomeEmail, LogUserLogin } from './UserListeners';

// Re-export base class
export { Listener } from '@/eloquent/Core/Events';
```

---

## Event Service Provider

The `EventServiceProvider` is where you register all event-listener mappings.

### Location

```
src/app/Providers/EventServiceProvider.ts
```

### Structure

```typescript
import { getEventDispatcher, EventSubscriber } from '@/eloquent/Core/Events';
import { ServiceProvider } from '@/eloquent/Providers/ServiceProvider';

// Import your listeners
import { 
    SendWelcomeEmail, 
    LogUserLogin,
    NotifyAdminOnRegistration 
} from '@/app/Listeners';

import {
    SendOrderConfirmation,
    UpdateInventory,
    NotifyWarehouse
} from '@/app/Listeners/OrderListeners';

export class EventServiceProvider extends ServiceProvider {
    /**
     * The event to listener mappings for the application.
     * 
     * Key: Event name (string)
     * Value: Array of listener classes
     */
    protected listen: Record<string, Array<new () => any>> = {
        // User events
        'user.registered': [
            SendWelcomeEmail,
            NotifyAdminOnRegistration,
        ],
        'user.logged_in': [
            LogUserLogin,
        ],
        
        // Order events
        'order.created': [
            SendOrderConfirmation,
            UpdateInventory,
            NotifyWarehouse,
        ],
        'order.shipped': [
            // SendShippingNotification,
        ],
        
        // Payment events
        'payment.received': [
            // UpdateAccountBalance,
            // SendPaymentReceipt,
        ],
        'payment.failed': [
            // NotifyCustomer,
            // AlertAdmin,
        ],
    };

    /**
     * The subscribers to register.
     */
    protected subscribe: Array<new () => EventSubscriber> = [
        // UserEventSubscriber,
        // OrderEventSubscriber,
    ];

    /**
     * Register event service.
     */
    register(): void {
        // Nothing to register
    }

    /**
     * Bootstrap event listeners.
     */
    boot(): void {
        const dispatcher = getEventDispatcher();

        // Register event-listener mappings
        for (const [eventName, listeners] of Object.entries(this.listen)) {
            for (const ListenerClass of listeners) {
                const listener = new ListenerClass();
                if (typeof listener.handle === 'function') {
                    dispatcher.listen(eventName, (payload) => listener.handle(payload));
                }
            }
        }

        // Register subscribers
        for (const SubscriberClass of this.subscribe) {
            dispatcher.subscribe(SubscriberClass);
        }

        console.log('[EventServiceProvider] Event listeners registered');
    }
}
```

### Adding New Event-Listener Mappings

1. Create your event class (optional but recommended)
2. Create your listener class(es)
3. Add the mapping to the `listen` property:

```typescript
protected listen: Record<string, Array<new () => any>> = {
    // ...existing mappings...
    
    // Add your new mapping
    'invoice.generated': [
        SendInvoiceEmail,
        UpdateAccountingSystem,
    ],
};
```

---

## Event Subscribers

For complex listener registration, use subscribers. Subscribers are classes that can register multiple event listeners in one place.

### Creating a Subscriber

```typescript
// src/app/Subscribers/UserEventSubscriber.ts
import { EventSubscriber, EventDispatcher } from '@/eloquent/Core/Events';

export class UserEventSubscriber implements EventSubscriber {
    /**
     * Register all listeners for this subscriber.
     */
    subscribe(dispatcher: EventDispatcher): void {
        dispatcher.listen('user.registered', this.onUserRegistered.bind(this));
        dispatcher.listen('user.logged_in', this.onUserLoggedIn.bind(this));
        dispatcher.listen('user.logged_out', this.onUserLoggedOut.bind(this));
        dispatcher.listen('user.password_changed', this.onPasswordChanged.bind(this));
        dispatcher.listen('user.profile_updated', this.onProfileUpdated.bind(this));
    }

    private async onUserRegistered(payload: any): Promise<void> {
        console.log(`[UserSubscriber] User registered: ${payload.email}`);
        // Handle registration
    }

    private async onUserLoggedIn(payload: any): Promise<void> {
        console.log(`[UserSubscriber] User logged in: ${payload.userId}`);
        // Update last login timestamp
        // Log the login event
    }

    private async onUserLoggedOut(payload: any): Promise<void> {
        console.log(`[UserSubscriber] User logged out: ${payload.userId}`);
        // Clear sessions, update analytics
    }

    private async onPasswordChanged(payload: any): Promise<void> {
        console.log(`[UserSubscriber] Password changed for user: ${payload.userId}`);
        // Send security notification email
        // Invalidate existing sessions
    }

    private async onProfileUpdated(payload: any): Promise<void> {
        console.log(`[UserSubscriber] Profile updated: ${payload.userId}`);
        // Update search index
        // Sync with external services
    }
}
```

### Registering Subscribers

Add subscribers to the `subscribe` array in `EventServiceProvider`:

```typescript
import { UserEventSubscriber } from '@/app/Subscribers/UserEventSubscriber';
import { OrderEventSubscriber } from '@/app/Subscribers/OrderEventSubscriber';

export class EventServiceProvider extends ServiceProvider {
    // ...
    
    protected subscribe: Array<new () => EventSubscriber> = [
        UserEventSubscriber,
        OrderEventSubscriber,
    ];
    
    // ...
}
```

---

## Wildcard Listeners

Listen to multiple events using wildcard patterns:

```typescript
import { on } from '@/eloquent/Core/Events';

// Listen to all user-related events
on('user.*', (payload) => {
    console.log('User event occurred:', payload);
});

// Listen to all order events
on('order.*', (payload) => {
    console.log('Order event:', payload);
});

// Listen to ALL events (useful for logging/debugging)
on('*', (payload) => {
    console.log('Event dispatched:', payload);
});

// More specific wildcards
on('billing.invoice.*', (payload) => {
    console.log('Invoice event:', payload);
});
```

### Use Cases for Wildcards

1. **Audit Logging**: Log all events to an audit trail
2. **Analytics**: Track all user actions
3. **Debugging**: See all events in development
4. **Metrics**: Count event occurrences

```typescript
// Audit logging example
on('*', async (payload) => {
    await AuditLog.create({
        event: payload.eventName,
        data: JSON.stringify(payload),
        timestamp: new Date(),
    });
});
```

---

## Catch-All Listeners

Register a listener that receives ALL events dispatched in the application:

```typescript
import { getEventDispatcher } from '@/eloquent/Core/Events';

const dispatcher = getEventDispatcher();

// Register a catch-all listener
dispatcher.catch((data) => {
    console.log(`Event dispatched: ${data.event}`, data.payload);
    // Log to analytics, audit trail, etc.
});
```

---

## Queueable Events & Listeners

### Queueable Listeners with Decorator

Use the `@ShouldQueue` decorator to process listeners asynchronously:

```typescript
import { Listener, ListensTo, ShouldQueue } from '@/eloquent/Core/Events';

@ListensTo('order.created')
@ShouldQueue({ queue: 'notifications', delay: 60 })
export class NotifyWarehouse extends Listener<OrderPayload> {
    async handle(payload: OrderPayload): Promise<void> {
        // This runs on the queue worker, not in the request
        await this.sendWarehouseNotification(payload);
    }
}
```

### Queue Configuration Options

```typescript
@ShouldQueue({
    connection: 'redis',      // Queue connection
    queue: 'high-priority',   // Queue name
    delay: 30,                // Delay in seconds
    tries: 3,                 // Retry attempts
    timeout: 120,             // Timeout in seconds
})
```

### Queueable Events

Events can also be queued by using fluent methods:

```typescript
import { UserRegistered } from '@/app/Events';

// Queue the event itself
await new UserRegistered(userId, email, name)
    .onQueue('events')
    .delay(60)
    .dispatch();
```

---

## Automatic Event Discovery

Listeners and subscribers are automatically discovered when they use decorators. No manual registration needed!

### How It Works

1. Place listeners in `src/app/Listeners/`
2. Use `@ListensTo` decorator on listener classes
3. Export from `src/app/Listeners/index.ts`
4. EventServiceProvider auto-discovers on boot

```typescript
// src/app/Listeners/OrderListeners.ts
import { Listener, ListensTo } from '@/eloquent/Core/Events';

@ListensTo('order.created')
export class ProcessNewOrder extends Listener<OrderPayload> {
    async handle(payload: OrderPayload): Promise<void> {
        // Automatically registered - no EventServiceProvider config needed!
    }
}

// Export in index.ts
export { ProcessNewOrder } from './OrderListeners';
```

---

## Event Decorators

### @ListensTo

Automatically registers a listener for specified events:

```typescript
import { Listener, ListensTo } from '@/eloquent/Core/Events';

// Single event
@ListensTo('user.registered')
export class SendWelcomeEmail extends Listener { ... }

// Multiple events
@ListensTo(['user.created', 'user.updated'])
export class SyncUserData extends Listener { ... }
```

### @ShouldQueue

Marks a listener to run on the queue:

```typescript
import { Listener, ListensTo, ShouldQueue } from '@/eloquent/Core/Events';

@ListensTo('payment.received')
@ShouldQueue({ queue: 'payments' })
export class ProcessPayment extends Listener { ... }
```

### @Subscriber

Marks a class as an event subscriber for auto-discovery:

```typescript
import { EventDispatcher, EventSubscriber, Subscriber } from '@/eloquent/Core/Events';

@Subscriber()
export class UserEventSubscriber implements EventSubscriber {
    subscribe(dispatcher: EventDispatcher): void {
        dispatcher.listen('user.registered', this.onUserRegistered);
        dispatcher.listen('user.deleted', this.onUserDeleted);
    }
    
    onUserRegistered(payload: any) { ... }
    onUserDeleted(payload: any) { ... }
}
```

### @AfterCommit

Ensures queued listener only dispatches after database transaction commits:

```typescript
import { Listener, ListensTo, ShouldQueue, AfterCommit } from '@/eloquent/Core/Events';

@ListensTo('order.created')
@ShouldQueue()
@AfterCommit()
export class NotifyCustomer extends Listener { ... }
```

---

## Event Facade

The `Event` facade provides a static interface to the event system:

```typescript
import { EventFacade as Event } from '@/eloquent/Core/Events';

// Dispatch
await Event.dispatch('user.registered', payload);

// Listen
Event.listen('user.registered', handler);

// Listen once
Event.once('user.registered', handler);

// Subscribe
Event.subscribe(MySubscriber);

// Check listeners
Event.hasListeners('user.registered'); // true/false
Event.getListeners('user.registered'); // EventListener[]
```

---

## Testing Events

### Event.fake()

Replace the event dispatcher with a fake for testing:

```typescript
import { EventFacade as Event } from '@/eloquent/Core/Events';

describe('UserService', () => {
    beforeEach(() => {
        Event.fake(); // Capture all events
    });

    afterEach(() => {
        Event.restore(); // Restore real dispatcher
    });

    it('dispatches user.registered event', async () => {
        await userService.register({ email: 'test@example.com' });
        
        Event.assertDispatched('user.registered');
    });
});
```

### Fake Specific Events

Only fake certain events, let others dispatch normally:

```typescript
Event.fake(['user.registered', 'user.deleted']);

// Only user.registered and user.deleted are captured
// Other events dispatch normally
```

### Event.assertDispatched()

Assert an event was dispatched:

```typescript
// Basic assertion
Event.assertDispatched('user.registered');

// With count
Event.assertDispatched('user.registered', 2); // Dispatched exactly 2 times

// With callback for payload inspection
Event.assertDispatched('user.registered', (payload) => {
    return payload.email === 'test@example.com';
});
```

### Event.assertNotDispatched()

Assert an event was NOT dispatched:

```typescript
Event.assertNotDispatched('user.deleted');

// With callback
Event.assertNotDispatched('user.registered', (payload) => {
    return payload.email === 'admin@example.com';
});
```

### Event.assertNothingDispatched()

Assert no events were dispatched:

```typescript
Event.assertNothingDispatched();
```

### Application.withEvents()

Convenience method for scoped event faking:

```typescript
const app = getApplication();

const { result, events } = await app.withEvents(async () => {
    return await userService.register(userData);
});

// Check captured events
expect(events.some(e => e.eventName === 'user.registered')).toBe(true);
```

### Get Dispatched Events

Retrieve all captured events for inspection:

```typescript
Event.fake();
await userService.register(data);

const allEvents = Event.dispatched();
const userEvents = Event.dispatched('user.registered');

console.log(userEvents[0].payload); // { userId: 1, email: '...' }
```

---

## Best Practices

### 1. Use Descriptive Event Names

```typescript
// ✅ Good - Clear and namespaced
'user.registered'
'order.payment.completed'
'invoice.sent'

// ❌ Bad - Vague or inconsistent
'registered'
'orderPayment'
'email'
```

### 2. Keep Listeners Focused

Each listener should do one thing:

```typescript
// ✅ Good - Single responsibility
class SendWelcomeEmail extends Listener { /* ... */ }
class CreateUserProfile extends Listener { /* ... */ }
class NotifyAdmin extends Listener { /* ... */ }

// ❌ Bad - Does too much
class HandleUserRegistration extends Listener {
    async handle(payload) {
        // Sends email
        // Creates profile
        // Notifies admin
        // Updates analytics
        // ... too much!
    }
}
```

### 3. Use Event Classes for Complex Events

```typescript
// ✅ Good - Type-safe and self-documenting
class OrderCreated extends Event {
    constructor(
        public orderId: number,
        public customerId: number,
        public total: number
    ) {
        super();
    }
}

// ❌ Bad - Untyped payload
await event('order.created', { /* what fields are expected? */ });
```

### 4. Handle Errors in Listeners

```typescript
class SendWelcomeEmail extends Listener<UserPayload> {
    async handle(payload: UserPayload): Promise<void> {
        try {
            await this.sendEmail(payload);
        } catch (error) {
            // Log error but don't crash
            console.error('[SendWelcomeEmail] Failed:', error);
            
            // Optionally re-throw to stop other listeners
            // throw error;
        }
    }
}
```

### 5. Document Your Events

```typescript
/**
 * Dispatched when a new user completes registration.
 * 
 * Listeners:
 * - SendWelcomeEmail: Sends welcome email to user
 * - NotifyAdmin: Notifies admin of new registration
 * - CreateUserProfile: Creates default user profile
 * 
 * @event user.registered
 */
export class UserRegistered extends Event {
    // ...
}
```

---

## Complete Example

Here's a complete example of setting up events for an invoice system:

### 1. Create Events

```typescript
// src/app/Events/InvoiceEvents.ts
import { Event } from '@/eloquent/Core/Events';

export class InvoiceGenerated extends Event {
    constructor(
        public invoiceId: number,
        public customerId: number,
        public amount: number,
        public dueDate: Date
    ) {
        super();
    }

    eventName(): string {
        return 'invoice.generated';
    }
}

export class InvoicePaid extends Event {
    constructor(
        public invoiceId: number,
        public paidAmount: number,
        public paidAt: Date
    ) {
        super();
    }

    eventName(): string {
        return 'invoice.paid';
    }
}
```

### 2. Create Listeners

```typescript
// src/app/Listeners/InvoiceListeners.ts
import { Listener } from '@/eloquent/Core/Events';
import { mail } from '@/eloquent/Core/Services/MailService';

interface InvoiceGeneratedPayload {
    invoiceId: number;
    customerId: number;
    amount: number;
    dueDate: Date;
}

export class SendInvoiceEmail extends Listener<InvoiceGeneratedPayload> {
    async handle(payload: InvoiceGeneratedPayload): Promise<void> {
        // Get customer email from database
        const customerEmail = 'customer@example.com';
        
        await mail(
            customerEmail,
            `Invoice #${payload.invoiceId}`,
            `Your invoice for $${payload.amount} is ready. Due: ${payload.dueDate}`,
            { html: false }
        );
        
        console.log(`[SendInvoiceEmail] Invoice email sent for #${payload.invoiceId}`);
    }
}

export class UpdateAccountingSystem extends Listener<InvoiceGeneratedPayload> {
    async handle(payload: InvoiceGeneratedPayload): Promise<void> {
        console.log(`[UpdateAccountingSystem] Recording invoice #${payload.invoiceId}`);
        // Integration with accounting software
    }
}
```

### 3. Register in EventServiceProvider

```typescript
// src/app/Providers/EventServiceProvider.ts
import { SendInvoiceEmail, UpdateAccountingSystem } from '@/app/Listeners/InvoiceListeners';

protected listen = {
    // ...existing events...
    
    'invoice.generated': [
        SendInvoiceEmail,
        UpdateAccountingSystem,
    ],
    'invoice.paid': [
        // SendPaymentReceiptEmail,
        // UpdateAccountingSystem,
    ],
};
```

### 4. Dispatch the Event

```typescript
// In your invoice service or controller
import { InvoiceGenerated } from '@/app/Events/InvoiceEvents';

async function generateInvoice(customerId: number, amount: number) {
    // Create invoice in database
    const invoice = await Invoice.create({
        customer_id: customerId,
        amount,
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    // Dispatch event
    await new InvoiceGenerated(
        invoice.id,
        customerId,
        amount,
        invoice.due_date
    ).dispatch();

    return invoice;
}
```

---

## Troubleshooting

### Event Not Firing

1. Check the event name matches exactly (case-sensitive)
2. Ensure listeners are registered in EventServiceProvider
3. Verify the application has booted (EventServiceProvider.boot() called)

### Listener Not Receiving Payload

1. Check payload structure matches listener expectations
2. Verify listener's `handle()` method is async if needed
3. Check for errors in listener that might be silently failing

### Too Many Events

Use more specific event names to avoid wildcard overload:

```typescript
// Instead of listening to '*'
on('user.*', handler);  // Listen only to user events
```

---

## Related Documentation

- [Mail System](./MAIL_SYSTEM.md) - For sending emails in event listeners
- [Queue System](./QUEUE_SYSTEM.md) - For queueing listener execution
- [Laravel Structure](./LARAVEL_STRUCTURE.md) - Overall architecture
