# Model Observers

Observers allow you to listen for model lifecycle events and execute code when those events occur.

## Overview

Observers are classes that group event listeners for a model. They're useful for:

- Logging model changes
- Sending notifications
- Invalidating caches
- Triggering side effects

## Creating an Observer

Create observers in `src/app/Observers/`:

```typescript
// src/app/Observers/UserObserver.ts
import { Observer } from '@/eloquent/Observers/Observer';
import { Model } from '@/eloquent/Model';
import User from '@/app/Models/User/User';

export class UserObserver extends Observer<User> {
    /**
     * Handle the "creating" event (before save)
     */
    async creating(user: User) {
        console.log('User is being created:', user.email);
    }

    /**
     * Handle the "created" event (after save)
     */
    async created(user: User) {
        console.log('User was created:', user.id);
        // Send welcome email, create default profile, etc.
    }

    /**
     * Handle the "updating" event (before update)
     */
    async updating(user: User) {
        console.log('User is being updated:', user.id);
    }

    /**
     * Handle the "updated" event (after update)
     */
    async updated(user: User) {
        console.log('User was updated:', user.id);
        // Clear cache, send notification, etc.
    }

    /**
     * Handle the "deleting" event (before delete)
     */
    async deleting(user: User) {
        console.log('User is being deleted:', user.id);
    }

    /**
     * Handle the "deleted" event (after delete)
     */
    async deleted(user: User) {
        console.log('User was deleted:', user.id);
        // Cleanup related records, etc.
    }

    /**
     * Handle the "restoring" event (before restore from soft delete)
     */
    async restoring(user: User) {
        console.log('User is being restored:', user.id);
    }

    /**
     * Handle the "restored" event (after restore from soft delete)
     */
    async restored(user: User) {
        console.log('User was restored:', user.id);
    }
}
```

## Registering Observers

Register observers in your `AppServiceProvider`:

```typescript
// src/app/Providers/AppServiceProvider.ts
import { UserObserver } from '@/app/Observers/UserObserver';
import User from '@/app/Models/User/User';

export class AppServiceProvider extends ServiceProvider {
    boot(): void {
        this.registerObservers();
    }

    protected registerObservers(): void {
        User.observe(UserObserver);
        
        // Register multiple observers
        // Post.observe(PostObserver);
        // Comment.observe(CommentObserver);
    }
}
```

Or register directly on the model:

```typescript
// In your bootstrap or model file
User.observe(UserObserver);
```

## Available Events

| Event | When it fires |
|-------|--------------|
| `creating` | Before a new model is saved |
| `created` | After a new model is saved |
| `updating` | Before an existing model is updated |
| `updated` | After an existing model is updated |
| `saving` | Before creating or updating |
| `saved` | After creating or updating |
| `deleting` | Before a model is deleted |
| `deleted` | After a model is deleted |
| `restoring` | Before a soft-deleted model is restored |
| `restored` | After a soft-deleted model is restored |
| `forceDeleting` | Before a model is permanently deleted |
| `forceDeleted` | After a model is permanently deleted |

## Practical Examples

### Cache Invalidation Observer

```typescript
// src/app/Observers/CacheInvalidationObserver.ts
import { Observer } from '@/eloquent/Observers/Observer';
import { Model } from '@/eloquent/Model';
import { cacheDelPrefix } from '@/cache';

export class CacheInvalidationObserver extends Observer<Model> {
    async created(model: Model) {
        await this.invalidateCache(model, 'created');
    }

    async updated(model: Model) {
        await this.invalidateCache(model, 'updated');
    }

    async deleted(model: Model) {
        await this.invalidateCache(model, 'deleted');
    }

    private async invalidateCache(model: Model, event: string) {
        const tableName = (model.constructor as any).getTable();
        await cacheDelPrefix(`${tableName}:`);
        console.log(`Cache invalidated for ${tableName} on ${event}`);
    }
}
```

### Audit Log Observer

```typescript
// src/app/Observers/AuditObserver.ts
import { Observer } from '@/eloquent/Observers/Observer';
import { Model } from '@/eloquent/Model';
import AuditLog from '@/app/Models/AuditLog';

export class AuditObserver extends Observer<Model> {
    async created(model: Model) {
        await this.log(model, 'create');
    }

    async updated(model: Model) {
        await this.log(model, 'update');
    }

    async deleted(model: Model) {
        await this.log(model, 'delete');
    }

    private async log(model: Model, action: string) {
        const user = auth().user();
        
        await AuditLog.create({
            user_id: user?.id || null,
            model_type: model.constructor.name,
            model_id: (model as any).id,
            action,
            changes: JSON.stringify(model.getDirty()),
            created_at: new Date(),
        });
    }
}
```

### Notification Observer

```typescript
// src/app/Observers/OrderObserver.ts
import { Observer } from '@/eloquent/Observers/Observer';
import Order from '@/app/Models/Order';
import { NotificationService } from '@/app/Services/NotificationService';

export class OrderObserver extends Observer<Order> {
    async created(order: Order) {
        // Notify customer of new order
        await NotificationService.sendEmail(
            order.customer_email,
            'Order Confirmation',
            `Your order #${order.id} has been placed.`
        );
    }

    async updated(order: Order) {
        // Notify on status change
        if (order.wasChanged('status')) {
            await NotificationService.sendEmail(
                order.customer_email,
                'Order Update',
                `Your order #${order.id} status: ${order.status}`
            );
        }
    }
}
```

## Stopping Event Propagation

Return `false` from a "before" event to cancel the operation:

```typescript
export class UserObserver extends Observer<User> {
    async creating(user: User) {
        // Prevent creation if email is banned
        if (await this.isEmailBanned(user.email)) {
            return false; // Stops the create operation
        }
    }

    private async isEmailBanned(email: string): Promise<boolean> {
        // Check banned emails list
        return false;
    }
}
```

## Multiple Observers

You can attach multiple observers to a model:

```typescript
User.observe(UserObserver);
User.observe(AuditObserver);
User.observe(CacheInvalidationObserver);
```

Events fire in the order observers were registered.

## Testing with Observers

Disable observers during testing:

```typescript
// In your test setup
User.withoutObservers(() => {
    // Create users without triggering observers
    await User.create({ name: 'Test User' });
});
```

## Best Practices

1. **Keep observers lightweight**: Heavy operations should be queued
2. **Handle errors gracefully**: Don't let observer errors break model operations
3. **Use appropriate events**: Choose `created` vs `creating` based on your needs
4. **Avoid circular dependencies**: Be careful with observers that modify other models
5. **Log observer actions**: Helps with debugging

