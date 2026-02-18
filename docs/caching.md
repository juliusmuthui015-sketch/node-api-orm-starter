# Caching

The starter includes a flexible caching system supporting multiple drivers.

## Configuration

Configure caching in your `.env`:

```env
# Cache driver: memory, redis, file
CACHE_DRIVER=memory

# Redis configuration (if using redis driver)
REDIS_URL=redis://localhost:6379

# File cache directory (if using file driver)
CACHE_PATH=./storage/cache
```

## Basic Usage

### Getting and Setting Values

```typescript
import { cacheGet, cacheSet, cacheDel, cacheHas } from '@/cache';

// Set a value (with optional TTL in seconds)
await cacheSet('user:1', { name: 'John', email: 'john@example.com' }, 3600);

// Get a value
const user = await cacheGet('user:1');

// Check if key exists
const exists = await cacheHas('user:1');

// Delete a key
await cacheDel('user:1');
```

### Using the Cache Manager

```typescript
import cache from '@/cache';

// Set value
await cache.set('key', 'value', 3600);

// Get value
const value = await cache.get('key');

// Get with default
const value = await cache.get('key', 'default');

// Delete
await cache.delete('key');

// Clear all
await cache.clear();
```

## Cache Keys

### Generating Keys

```typescript
import { generateCacheKey } from '@/cache';

// Generate a namespaced key
const key = generateCacheKey('users', 'list', { page: 1, limit: 10 });
// Result: "users:list:page=1:limit=10"
```

### Key Patterns

Use consistent key patterns:

```typescript
// Entity keys
`user:${userId}`
`post:${postId}`

// List keys
`users:list:page=${page}`
`posts:category:${categoryId}`

// Computed/aggregated keys
`stats:daily:${date}`
`report:monthly:${month}`
```

## Cache Operations

### Get or Set (Remember)

```typescript
// Get from cache, or compute and store
const users = await cache.remember('users:all', 3600, async () => {
    return await User.all();
});
```

### Get Multiple Keys

```typescript
const keys = ['user:1', 'user:2', 'user:3'];
const values = await cache.getMany(keys);
```

### Delete by Pattern

```typescript
import { cacheDelPrefix } from '@/cache';

// Delete all keys starting with 'user:'
await cacheDelPrefix('user:');

// Delete all keys starting with 'report:'
await cacheDelPrefix('report:');
```

### List Keys

```typescript
import { cacheKeys } from '@/cache';

// Get all cache keys (use sparingly in production)
const keys = await cacheKeys();

// Get keys matching pattern
const userKeys = await cacheKeys('user:*');
```

## Cache Drivers

### Memory Driver

Default driver, stores in process memory:

```env
CACHE_DRIVER=memory
```

- Pros: Fast, no external dependencies
- Cons: Lost on restart, not shared between processes

### Redis Driver

For production and distributed systems:

```env
CACHE_DRIVER=redis
REDIS_URL=redis://localhost:6379
```

- Pros: Persistent, shared across processes, supports clustering
- Cons: Requires Redis server

### File Driver

Stores cache in filesystem:

```env
CACHE_DRIVER=file
CACHE_PATH=./storage/cache
```

- Pros: Persistent, no external dependencies
- Cons: Slower than memory/redis

## Caching Strategies

### Cache-Aside Pattern

Most common pattern - check cache first, load from DB if missing:

```typescript
async function getUser(id: number) {
    const cacheKey = `user:${id}`;
    
    // Try cache first
    let user = await cacheGet(cacheKey);
    
    if (!user) {
        // Load from database
        user = await User.find(id);
        
        // Store in cache
        if (user) {
            await cacheSet(cacheKey, user, 3600);
        }
    }
    
    return user;
}
```

### Write-Through Pattern

Update cache when data changes:

```typescript
async function updateUser(id: number, data: any) {
    const user = await User.find(id);
    await user.update(data);
    
    // Update cache
    await cacheSet(`user:${id}`, user, 3600);
    
    // Invalidate related caches
    await cacheDelPrefix('users:list');
    
    return user;
}
```

### Cache Invalidation

Clear cache when data changes:

```typescript
// In an Observer
export class UserObserver extends Observer<User> {
    async updated(user: User) {
        await cacheDel(`user:${user.id}`);
        await cacheDelPrefix('users:');
    }

    async deleted(user: User) {
        await cacheDel(`user:${user.id}`);
        await cacheDelPrefix('users:');
    }
}
```

## Using with Models

### Cacheable Trait

Add caching to models:

```typescript
import { Model, use } from '@/eloquent/Model';
import { Cacheable } from '@/eloquent/Traits/built-ins';

@use(Cacheable)
export class User extends Model {
    static cacheTTL = 3600; // Cache for 1 hour
}
```

### Query Result Caching

```typescript
// Cache query results
const users = await User.query()
    .where('status', 'active')
    .remember(3600, 'active-users')
    .get();
```

## Cache Commands

### Clear Cache

```bash
pnpm run cache:clear
```

### Cache CLI Tool

```bash
# List all keys
node build/tools/cache-cli.js keys

# Get a key
node build/tools/cache-cli.js get user:1

# Delete a key
node build/tools/cache-cli.js del user:1

# Clear all
node build/tools/cache-cli.js clear
```

## Best Practices

1. **Use meaningful key names**: `user:123` instead of `u123`
2. **Set appropriate TTLs**: Balance freshness vs performance
3. **Invalidate on writes**: Keep cache consistent with database
4. **Use cache prefixes**: Group related keys for easy invalidation
5. **Handle cache misses gracefully**: Always have fallback logic
6. **Monitor cache hit rates**: Optimize based on usage patterns
7. **Don't cache sensitive data**: Or encrypt it first
8. **Consider cache stampede**: Use locking for expensive operations

## Troubleshooting

### Cache Not Working

1. Check `CACHE_DRIVER` is set correctly
2. Verify Redis connection (if using Redis)
3. Check file permissions (if using file driver)

### Stale Data

1. Verify cache invalidation is working
2. Check TTL values
3. Review observer implementations

### Memory Issues

1. Set appropriate TTLs
2. Use Redis for large datasets
3. Implement cache eviction policies

