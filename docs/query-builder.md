# Query Builder

The Query Builder provides a fluent interface for constructing database queries.

## Getting Started

```typescript
import User from '@/app/Models/User/User';

// Start a query
const query = User.query();

// Or use static methods directly
const users = await User.where('status', 'active').get();
```

## Retrieving Results

### Get All Records

```typescript
const users = await User.all();
const users = await User.get();
```

### Get Single Record

```typescript
// By primary key
const user = await User.find(1);
const user = await User.findOrFail(1); // Throws if not found

// First matching record
const user = await User.where('email', 'john@example.com').first();
const user = await User.where('email', 'john@example.com').firstOrFail();
```

### Pagination

```typescript
const result = await User.paginate(10, 1); // 10 per page, page 1

// Result structure:
{
    data: [...],
    total: 100,
    perPage: 10,
    currentPage: 1,
    lastPage: 10
}
```

## Where Clauses

### Basic Where

```typescript
// Equals
User.where('status', 'active')
User.where('status', '=', 'active')

// Comparison operators
User.where('age', '>', 18)
User.where('age', '>=', 21)
User.where('status', '!=', 'banned')

// LIKE
User.where('name', 'like', '%john%')
```

### Multiple Conditions

```typescript
// AND conditions
User.where('status', 'active')
    .where('role', 'admin')
    .get();

// OR conditions
User.where('status', 'active')
    .orWhere('role', 'admin')
    .get();
```

### Where In / Not In

```typescript
User.whereIn('id', [1, 2, 3]).get();
User.whereNotIn('status', ['banned', 'suspended']).get();
```

### Where Null / Not Null

```typescript
User.whereNull('deleted_at').get();
User.whereNotNull('email_verified_at').get();
```

### Where Has (Relationship)

```typescript
// Users with at least one post
User.whereHas('posts').get();

// Users with posts matching condition
User.whereHas('posts', (query) => {
    query.where('published', true);
}).get();
```

## Ordering

```typescript
User.orderBy('name').get();
User.orderBy('name', 'asc').get();
User.orderBy('created_at', 'desc').get();

// Latest/Oldest
User.latest().get();      // ORDER BY created_at DESC
User.oldest().get();      // ORDER BY created_at ASC
```

## Limiting & Offsetting

```typescript
User.limit(10).get();
User.offset(20).get();

// Pagination style
User.limit(10).offset(20).get();
```

## Selecting Columns

```typescript
User.select('id', 'name', 'email').get();
User.select(['id', 'name', 'email']).get();
```

## Aggregates

```typescript
const count = await User.count();
const max = await User.max('age');
const min = await User.min('age');
const avg = await User.avg('salary');
const sum = await User.sum('points');
```

## Soft Deletes

When using the `SoftDeletes` trait:

```typescript
// Only non-deleted (default)
User.get();

// Include soft-deleted
User.withTrashed().get();

// Only soft-deleted
User.onlyTrashed().get();
```

## Eager Loading

```typescript
// Load relationships
User.with('profile').get();
User.with(['profile', 'roles']).get();
User.with(['roles', 'roles.permissions']).get();
```

