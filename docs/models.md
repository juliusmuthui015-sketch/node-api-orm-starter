# Models & ORM

This starter includes an Eloquent-style ORM inspired by Laravel, providing an expressive way to interact with your database.

## Defining Models

Models are located in `src/app/Models/`. Create a model by extending the base `Model` class:

```typescript
import { Model, use } from '@/eloquent/Model';
import { SoftDeletes } from '@/eloquent/Traits/SoftDeletes';
import { Timestamps } from '@/eloquent/Traits/built-ins';

@use(SoftDeletes, Timestamps)
export class Post extends Model {
    static primaryKey = 'id';
    
    static fillable = [
        'title',
        'content',
        'user_id',
        'published_at',
        'created_at',
        'updated_at',
    ];
    
    static hidden = ['deleted_at'];
    
    static casts = {
        published_at: 'datetime',
        created_at: 'datetime',
        updated_at: 'datetime',
    } as any;

    // Relationships
    user() {
        return this.belongsTo(User, 'user_id', 'id');
    }

    comments() {
        return this.hasMany(Comment, 'post_id');
    }
}

export default Post;
```

## Model Properties

```typescript
class Post extends Model {
    // Table name (defaults to lowercase plural of class name)
    static table = 'posts';
    
    // Primary key column
    static primaryKey = 'id';
    
    // Mass-assignable attributes
    static fillable = ['title', 'content', 'user_id'];
    
    // Attributes excluded from JSON
    static hidden = ['password', 'remember_token'];
    
    // Attribute type casting
    static casts = {
        is_active: 'boolean',
        metadata: 'json',
        published_at: 'datetime',
    };
}
```

## Traits

Apply traits using the `@use` decorator:

```typescript
import { Model, use } from '@/eloquent/Model';
import { SoftDeletes } from '@/eloquent/Traits/SoftDeletes';
import { Timestamps, Cacheable, Sortable } from '@/eloquent/Traits/built-ins';

@use(SoftDeletes, Timestamps, Cacheable, Sortable)
export class User extends Model {
    // ...
}
```

### Available Traits

- **SoftDeletes**: Adds soft delete functionality (`deleted_at` column)
- **Timestamps**: Auto-manages `created_at` and `updated_at`
- **Cacheable**: Adds model-level caching
- **Sortable**: Adds sorting capabilities

## CRUD Operations

### Creating Records

```typescript
// Create and save
const user = await User.create({
    name: 'John Doe',
    email: 'john@example.com',
    password: hashedPassword,
});

// Create instance then save
const user = new User({ name: 'John' });
user.email = 'john@example.com';
await user.save();
```

### Reading Records

```typescript
// Find by primary key
const user = await User.find(1);
const user = await User.findOrFail(1); // Throws if not found

// Get all records
const users = await User.all();

// First record matching query
const user = await User.where('email', 'john@example.com').first();

// Get multiple records
const users = await User.where('status', 'active').get();
```

### Updating Records

```typescript
// Update instance
const user = await User.find(1);
await user.update({ name: 'Jane Doe' });

// Mass update
await User.where('status', 'pending').update({ status: 'active' });
```

### Deleting Records

```typescript
// Delete instance
const user = await User.find(1);
await user.delete();

// Mass delete
await User.where('status', 'inactive').delete();

// Soft delete (if using SoftDeletes trait)
await user.delete(); // Sets deleted_at

// Force delete (permanently)
await user.forceDelete();

// Restore soft-deleted record
await user.restore();
```

## Relationships

### Defining Relationships

```typescript
class User extends Model {
    // One-to-One
    profile() {
        return this.hasOne(UserProfile, 'user_id', 'id');
    }

    // One-to-Many
    posts() {
        return this.hasMany(Post, 'user_id');
    }

    // Many-to-Many
    roles() {
        return this.belongsToMany(Role, 'roles_users', 'users_id', 'roles_id');
    }

    // Inverse One-to-Many
    company() {
        return this.belongsTo(Company, 'company_id', 'id');
    }
}
```

### Eager Loading

```typescript
// Load relationships with the query
const users = await User.with(['profile', 'roles']).get();

// Nested eager loading
const users = await User.with(['roles', 'roles.permissions']).get();

// Load after fetching
const user = await User.find(1);
await user.load('profile');
```

### Working with Relationships

```typescript
// Access relationship data
const user = await User.with('profile').find(1);
const profile = user.profile;

// Create related record
await user.posts().create({ title: 'My Post' });

// Attach/Detach (Many-to-Many)
await user.roles().attach(roleId);
await user.roles().attach([1, 2, 3]);
await user.roles().detach(roleId);
await user.roles().sync([1, 2, 3]); // Replace all
```

## Soft Deletes

```typescript
@use(SoftDeletes)
class User extends Model {
    // ...
}

// Query only soft-deleted
const deleted = await User.onlyTrashed().get();

// Include soft-deleted
const all = await User.withTrashed().get();

// Check if soft-deleted
if (user.trashed()) {
    // ...
}

// Restore
await user.restore();

// Permanently delete
await user.forceDelete();
```

