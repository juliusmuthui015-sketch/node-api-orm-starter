# Database Migrations

Migrations allow you to version control your database schema and share it across environments.

## Creating Migrations

Generate a new migration:

```bash
pnpm run make:migration create_posts_table
pnpm run make:migration add_status_to_users_table
```

This creates a timestamped file in `src/database/migrations/`.

## Migration Structure

```typescript
// src/database/migrations/20240101000000_create_posts_table.ts
import type { MigrationSchema, TableBuilder } from '../Schema';

type QueryFn = (sql: string, params?: any[]) => Promise<any>;

module.exports.up = async function (schema: MigrationSchema, query: QueryFn) {
    return schema.createTable('posts', (table: TableBuilder) => {
        table.increments('id');
        table.string('title', 255).notNullable();
        table.text('content').nullable();
        table.integer('user_id').notNullable();
        table.enum('status', ['draft', 'published', 'archived']).default('draft');
        table.boolean('featured').default(false);
        table.datetime('published_at').nullable();
        table.timestamps();
        table.softDeletes();
        
        table.foreign('user_id').references('id').inTable('users').onDelete('cascade');
        table.index('status');
    });
};

module.exports.down = async function (schema: MigrationSchema, query: QueryFn) {
    return schema.dropTable('posts');
};
```

## Column Types

### Numeric Types

```typescript
table.increments('id');           // Auto-incrementing primary key
table.integer('count');           // Integer
table.bigInteger('views');        // Big integer
table.float('price');             // Float
table.decimal('amount', 10, 2);   // Decimal with precision
table.boolean('is_active');       // Boolean
```

### String Types

```typescript
table.string('name', 255);        // VARCHAR
table.text('description');        // TEXT
table.longText('content');        // LONGTEXT
table.char('code', 4);            // CHAR
table.uuid('uuid');               // UUID
```

### Date/Time Types

```typescript
table.datetime('published_at');   // DATETIME
table.date('birth_date');         // DATE
table.time('start_time');         // TIME
table.timestamp('created_at');    // TIMESTAMP
table.timestamps();               // created_at + updated_at
table.softDeletes();              // deleted_at
```

### Other Types

```typescript
table.json('metadata');           // JSON
table.enum('status', ['a', 'b']); // ENUM
table.binary('data');             // BLOB
```

## Column Modifiers

```typescript
table.string('name').notNullable();
table.string('email').nullable();
table.string('status').default('pending');
table.integer('position').unsigned();
table.string('unique_code').unique();
table.string('email').index();
```

## Indexes and Keys

```typescript
// Primary key
table.increments('id');  // Auto primary key
table.primary(['col1', 'col2']);  // Composite primary key

// Unique
table.unique('email');
table.unique(['first_name', 'last_name']);

// Index
table.index('status');
table.index(['category', 'status']);

// Foreign key
table.foreign('user_id')
    .references('id')
    .inTable('users')
    .onDelete('cascade')
    .onUpdate('cascade');
```

## Running Migrations

```bash
# Run all pending migrations
pnpm run db:migrate

# Rollback and re-run all migrations
pnpm run db:fresh

# Fresh migrate and seed
pnpm run db:fresh -- --seed
```

## Migration Examples

### Create Table

```typescript
module.exports.up = async function (schema: MigrationSchema, query: QueryFn) {
    return schema.createTable('categories', (table) => {
        table.increments('id');
        table.string('name', 100).notNullable();
        table.string('slug', 100).unique();
        table.integer('parent_id').nullable();
        table.integer('sort_order').default(0);
        table.timestamps();
        
        table.foreign('parent_id').references('id').inTable('categories').onDelete('set null');
    });
};

module.exports.down = async function (schema: MigrationSchema, query: QueryFn) {
    return schema.dropTable('categories');
};
```

### Add Column

```typescript
module.exports.up = async function (schema: MigrationSchema, query: QueryFn) {
    return schema.alterTable('users', (table) => {
        table.string('phone_number', 25).nullable();
        table.boolean('email_verified').default(false);
    });
};

module.exports.down = async function (schema: MigrationSchema, query: QueryFn) {
    return schema.alterTable('users', (table) => {
        table.dropColumn('phone_number');
        table.dropColumn('email_verified');
    });
};
```

### Create Pivot Table

```typescript
module.exports.up = async function (schema: MigrationSchema, query: QueryFn) {
    return schema.createTable('post_tags', (table) => {
        table.increments('id');
        table.integer('post_id').notNullable();
        table.integer('tag_id').notNullable();
        table.timestamps();
        
        table.foreign('post_id').references('id').inTable('posts').onDelete('cascade');
        table.foreign('tag_id').references('id').inTable('tags').onDelete('cascade');
        table.unique(['post_id', 'tag_id']);
    });
};

module.exports.down = async function (schema: MigrationSchema, query: QueryFn) {
    return schema.dropTable('post_tags');
};
```

### Add Index

```typescript
module.exports.up = async function (schema: MigrationSchema, query: QueryFn) {
    return schema.alterTable('posts', (table) => {
        table.index(['user_id', 'status']);
    });
};

module.exports.down = async function (schema: MigrationSchema, query: QueryFn) {
    return schema.alterTable('posts', (table) => {
        table.dropIndex(['user_id', 'status']);
    });
};
```

### Raw SQL

```typescript
module.exports.up = async function (schema: MigrationSchema, query: QueryFn) {
    await query(`
        CREATE INDEX posts_fulltext_idx 
        ON posts USING gin(to_tsvector('english', title || ' ' || content))
    `);
};

module.exports.down = async function (schema: MigrationSchema, query: QueryFn) {
    await query('DROP INDEX IF EXISTS posts_fulltext_idx');
};
```

## Core Migrations

The starter includes these essential migrations:

| Migration | Description |
|-----------|-------------|
| 000_create_cache_store | Cache storage table |
| 001_create_users | Users table |
| 002_create_roles | Roles table |
| 003_create_permissions | Permissions table |
| 004_create_roles_users | User-role pivot table |
| 005_create_permissions_roles | Role-permission pivot table |
| user_profile | User profiles table |
| files | File uploads table |

## Best Practices

1. **One change per migration**: Makes rollbacks easier
2. **Use descriptive names**: `create_posts_table`, `add_status_to_users`
3. **Always implement down()**: Enable rollbacks
4. **Test migrations**: Run fresh migrations regularly
5. **Don't modify existing migrations**: Create new ones instead
6. **Use transactions**: For complex migrations
7. **Back up before migrating production**: Safety first

