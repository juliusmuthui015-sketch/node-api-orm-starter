# Traits, Scopes, and Accessors (Laravel-style)

This ORM supports Laravel-like traits, local/global scopes, scope methods, accessors/mutators (sync and async), and model events. Models auto-boot on first use—no manual boot() needed.

Contents
- Traits (register, apply, macros, built-ins, class traits)
- Scopes (local, global, method-style, builder helpers)
- Accessors & mutators (sync/async, appends, attribute cache)
- Using relationships inside accessors
- Serialization options with accessors
- Comprehensive examples
- Smoke scripts

## Traits

Trait system lets you bundle methods, scopes, and macros, then attach them to models by name.

Register a trait
```ts
import { registerTrait } from '@/eloquent/Traits/traits';
import { Model } from '@/eloquent/Model';
import { EloquentBuilder } from '@/eloquent/EloquentBuilder';

registerTrait('Sortable', {
  methods: {
    latest(this: typeof Model, column: string = 'created_at') {
      return (this as any).query().orderBy(column, 'desc');
    },
    oldest(this: typeof Model, column: string = 'created_at') {
      return (this as any).query().orderBy(column, 'asc');
    },
  },
  scope: {
    recent<T extends Model>(b: EloquentBuilder<T>, days: number = 7) {
      const since = new Date(Date.now() - days * 86400000);
      b.where('created_at', '>=', since);
    },
  },
});
```

Apply on a model
```ts
class User extends Model {
  static table = 'users';
  static traits = ['SoftDeletes', 'HasApiTokens', 'HasEvents', 'Sortable'];
}
```

Built-in traits (included)
- SoftDeletes: adds instance helpers forceDelete(), restore(), trashed(), isNotTrashed(); sets softDeletes=true.
- HasApiTokens: stub token helpers (createToken, currentAccessToken, tokens, revokeAllTokens).
- Notifiable: stub notify() & helpers.
- HasEvents: initializes event listeners and adds addEventListener/dispatchEvent.

Class traits (static methods via macros)
- Trait.methods attach instance methods (on prototype).
- Trait.macros attach static methods on the model class (and builder helper of same name).
- Use macros when you want `Model.search()`, `Tag.findBySlug()`, or `Order.reorder()` as class-level utilities.

Examples
```ts
// Timestamps (custom trait): enable timestamps + instance helpers
registerTrait('Timestamps', {
  boot: (modelClass: any) => { modelClass.timestamps = true; },
  methods: {
    async touch() { if (!(this as any).constructor.timestamps) return; this.setAttribute('updated_at', new Date()); await this.save(); },
  }
});

// Sluggable: auto-generate slug before save, plus static finder
registerTrait('Sluggable', {
  methods: {
    generateSlug(text: string) { return text.toLowerCase().replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').replace(/--+/g,'-').trim(); },
    setSlugFrom(field: string = 'name') { const src = this.getAttribute(field); if (src) this.setAttribute('slug', (this as any).generateSlug(src)); },
  },
  macros: {
    async findBySlug(this: any, slug: string) { return this.query().where('slug', slug).first(); },
  },
  boot: (modelClass: any) => {
    modelClass.addEventListener('saving', (m: any) => { if (m.isDirty('name') && !m.getAttribute('slug')) m.setSlugFrom('name'); });
  }
});

// Searchable: static search/advancedSearch
registerTrait('Searchable', {
  macros: {
    search(this: any, q: string, fields: string[] = ['name','description']) {
      const b = this.query();
      if (q) fields.forEach(f => b.orWhere(f, 'like', `%${q}%`));
      return b;
    },
    advancedSearch(this: any, params: Record<string, any>) {
      const b = this.query();
      Object.entries(params).forEach(([k, v]) => { if (Array.isArray(v)) b.whereIn(k, v); else if (v != null && v !== '') b.where(k, v); });
      return b;
    },
  }
});

// Orderable: class reorder + instance moveUp/moveDown
registerTrait('Orderable', {
  macros: {
    async reorder(this: any, ids: (number|string)[]) { for (let i=0;i<ids.length;i++) await this.query().where('id', ids[i]).update({ order: i+1 }); },
  },
  methods: {
    async moveUp(this: any) { const cur = this.getAttribute('order'); if (cur > 1) { const above = await (this.constructor as any).query().where('order', cur-1).first(); if (above) { await this.update({ order: cur-1 }); await (above as any).update({ order: cur }); } } },
    async moveDown(this: any) { const cur = this.getAttribute('order'); const max = await (this.constructor as any).query().max('order'); if (cur < max) { const below = await (this.constructor as any).query().where('order', cur+1).first(); if (below) { await this.update({ order: cur+1 }); await (below as any).update({ order: cur }); } } },
  }
});

// Toggleable: instance boolean toggles
registerTrait('Toggleable', {
  methods: {
    async toggle(field: string) { await this.update({ [field]: !this.getAttribute(field) }); },
    async enable(field: string) { await this.update({ [field]: true }); },
    async disable(field: string) { await this.update({ [field]: false }); },
    isEnabled(field: string) { return !!this.getAttribute(field); },
    isDisabled(field: string) { return !this.getAttribute(field); },
  }
});

// Cacheable: class-level caching wrappers (pseudo)
registerTrait('Cacheable', {
  macros: {
    cached(this: any, cb: Function, key: string, ttl = 3600) { /* integrate with cache */ return cb(); },
    clearCache() { /* clear keys */ },
    getCached(this: any, id: any) { return (this as any).cached(() => (this as any).find(id), `${this.name}:${id}`, 300); },
  }
});
```

## Scopes

Define scopes in three ways and mix them freely.

Local scopes map
```ts
class User extends Model {
  static localScopes = {
    active: b => b.where('status','active'),
    verified: b => b.where('email_verified_at', '!=', null),
    role: (b, role: string) => b.where('role', role),
    createdBetween: (b, start: Date, end: Date) => b.whereBetween('created_at', [start, end]),
  };
}
```

Global scopes map
```ts
class User extends Model {
  static globalScopes = {
    defaultOrder: b => b.orderBy('name','asc'),
    excludeBanned: b => b.where('status','!=','banned'),
  };
}
```

Method-style scope (scopeX)
```ts
class User extends Model {
  static scopePopular(b: any, minFollowers = 100) { return b.where('followers_count', '>=', minFollowers); }
  static scopeWithPosts(b: any) { return b.with('posts'); }
}
```

Using scopes
```ts
// Builder helpers
await User.query().scope('active').get();
await User.query().scopes({ active: [], role: ['admin'] }).get();
await User.query().namedScope('popular', 500).get();

// Static convenience
await User.scope('active').get();

// Remove global scope
await User.withoutGlobalScope('excludeBanned').get();

// Remove all global scopes (use the underscore form defined in Model)
await User.withoutGlobalScopes_().get();

// Compose with additional where
const recentActiveAdmins = await User.query()
  .scope('active')
  .scope('role', 'admin')
  .where('created_at', '>=', new Date(Date.now() - 30*24*60*60*1000))
  .get();
```

Notes
- Global scopes apply automatically unless removed via withoutGlobalScope()/withoutGlobalScopes_().
- withoutScope() on the builder prevents re-applying a named scope later in the chain.

## Accessors & Mutators

Register sync and async accessors/mutators, and expose computed values via appends.

Sync/async accessors
```ts
class User extends Model { static appends = ['fullName','isAdmin','permissionsCount']; }

// Method-style
class User extends Model {
  getFullNameAttribute() { return `${this.getAttribute('first_name')} ${this.getAttribute('last_name')}`; }
  getIsAdminAttribute() { return this.getAttribute('role') === 'admin'; }
}

// Descriptor-style
User.registerAccessor('fullName', (v, m) => `${m.getField('first_name')} ${m.getField('last_name')}`);
User.registerAsyncAccessor('permissionsCount', async (v, m) => await m.getRelationshipCount('permissions'));
```

Sync/async mutators
```ts
User.registerMutator('name', (v, m) => String(v).trim());
User.registerAsyncMutator('password', async (v, m) => await hashPassword(v));
```

Attribute cache
- Accessor results are cached per key and cleared when attributes change or on hydrate().
- Use getAttribute(key) for sync accessors; use getAttributeAsync(key) for async accessors.

Appends to JSON
```ts
User.addAppends('fullName','isAdmin');
const json = await user.toJSONAsync({ include:['fullName','isAdmin'] });
```

## Using relationships within accessors

Helpers
- getField(name): direct attribute (bypasses accessors)
- getRelationshipCount(name): counts related records (uses loaded relation if present)
- getRelationshipQuery(name): returns relation query builder

Example
```ts
User.registerAsyncAccessor('rolesCount', async (v, m) => await m.getRelationshipCount('roles'));
```

## Serialization with accessors

```ts
const json = await user.toJSONAsync({
  include: ['roles.permissions', 'fullName'],
  exclude: ['internal_note'],
  withRelations: true,
  relationTree: { roles: { permissions: {} } },
  withAccessors: true,
  onlyAppended: false,
  maxDepth: 5,
});
```

Notes
- include accepts dot-paths for relations and plain keys for attributes.
- When withRelations is true, missing relations default to null or [] based on relation type.

## Comprehensive examples

Mirroring the ExampleModel patterns:
- Local scopes: active, verified, role, createdBetween
- Global scopes: defaultOrder, excludeBanned; disable with withoutGlobalScope('excludeBanned') or withoutGlobalScopes_()
- Method scopes: scopePopular(min), scopeWithPosts()
- Accessors: getFullNameAttribute(), getIsAdminAttribute(), plus appends via addAppends()
- Events: override static boot() to wire creating/created/saving listeners (e.g., hash password before save)
- Static helpers: `findByEmail()` using `this.query()`
- Chained scopes: `User.scope('active').scope('role','admin').get()`
- Trait methods: SoftDeletes instance methods (restore/trashed/forceDelete), HasApiTokens (createToken), Notifiable (notify)

## Smoke scripts
- Traits + scopes + accessors: `src/tmp/traits-scopes-accessors-smoke.ts`
- Scopes only: `src/tmp/scopes-smoke.ts`

Run
```bash
npm run smoke:traits
npm run smoke:scopes
```

# Class-based trait (SortableTrait) and usage

You can organize trait methods in a class and expose static helpers that return the actual macro functions bound to the model class. This plays nicely with the trait system’s `macros` support (static methods on the model class and query builder):

Definition
```ts
import { Model } from '@/eloquent/Model';

class SortableTrait {
  static latest() {
    return function(this: typeof Model) {
      return (this as any).query().orderBy('created_at', 'desc');
    };
  }
  static oldest() {
    return function(this: typeof Model) {
      return (this as any).query().orderBy('created_at', 'asc');
    };
  }
}
```

Registration
```ts
import { registerTrait } from '@/eloquent/Traits/traits';

registerTrait('Sortable', {
  // Attach as static macros on the model class (and builder helper of same name)
  macros: {
    latest: SortableTrait.latest(),
    oldest: SortableTrait.oldest(),
  },
});
```

Apply and use
```ts
class User extends Model { static traits = ['Sortable']; }

// Static macro on the model
const newest = await User.latest().get();

// Builder helper (macro applied to builder prototype as well)
const oldest = await User.query().oldest().get();
```

Notes
- Using `macros` makes these available as both `User.latest()` and `User.query().latest()` (same for `oldest`).
- Prefer `macros` for class-level utilities that return a builder; use `methods` for instance helpers.
- If you want these as named scopes instead, register in `localScopes` or provide a trait `scope` with e.g. `scope: { latest: (b) => b.orderBy('created_at','desc') }`.
