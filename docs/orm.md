# ORM (Model)

Model is an Eloquent-like base with attributes, casts, events, traits, scopes, relations, and JSON serialization for SQL and MongoDB backends.

Contents
- Define a model
- Attributes: fillable/guarded/hidden/casts/appends
- Accessors, mutators, and attribute cache
- Events lifecycle
- Relationships
- Scopes (local, global, method-style)
- Soft deletes
- Serialization (toJSON / toJSONAsync)
- Examples

Define a model
```ts
import { Model } from '@/eloquent/Model';

export class User extends Model {
  static table = 'users';
  static primaryKey = 'id';
  static fillable = ['name','email','password','status'];
  static hidden = ['password'];
  static casts = { created_at: 'date', updated_at: 'date' };
  static timestamps = true;
  static softDeletes = true;

  roles() { return this.belongsToMany(Role, 'roles_users', 'users_id', 'roles_id'); }
  profile() { return this.hasOne(Profile, 'user_id'); }
}
```

Attributes
- fillable: fields allowed for mass assignment (Model.fill / query().create)
- guarded: fields not assignable (takes precedence over fillable)
- hidden: excluded from toJSON output by default
- casts: simple casting (e.g., 'date')
- appends: computed attributes to include in toJSON

Accessors & mutators
```ts
// Accessor (descriptor)
User.registerAccessor('display_name', (v, m) => `${m.getField('name')} <${m.getField('email')}>`);
User.addAppends('display_name');

// Accessor/Mutator (method form)
class Profile extends Model {
  static table = 'profiles';
  getFullNameAttribute() { return `${this.getAttribute('first_name')} ${this.getAttribute('last_name')}`; }
  setPasswordAttribute(v: string) { return (this as any).attributes.password = hash(v); }
}

// Attribute cache is cleared when a field changes
```

Events
- creating/created, updating/updated, saving/saved
- deleting/deleted, restoring/restored, retrieved
- Return false in a "halt-able" event (creating/updating/saving/deleting/restoring) to stop the operation.

```ts
User.eventListeners.creating.push(m => {
  if (!m.getField('email')) return false; // halt create
});
```

Relationships
- hasOne(model, foreignKey?, localKey?)
- hasMany(model, foreignKey?, localKey?)
- belongsTo(model, foreignKey?, ownerKey?)
- belongsToMany(model, pivotTable?, foreignPivotKey?, relatedPivotKey?)
- morphOne/morphMany(name) and morphTo(name)

Usage
```ts
const user = await User.query().with(['roles','profile']).first();
const roles = await user.roles().get();
```

## Static relationships map

In addition to instance methods, you can declare relationships via a static `relationships` map. The Model reads these at runtime and treats them the same as method-based relations. This is useful to avoid circular imports or when you prefer a declarative style.

Example
```ts
import { Model } from '@/eloquent/Model';

class Post extends Model {
  static table = 'posts';
  static fillable = ['title','content','user_id','status'];

  static relationships = {
    author: { type: 'belongsTo', model: User, foreignKey: 'user_id' },
    comments: { type: 'hasMany', model: Comment, foreignKey: 'post_id' },
    tags: { type: 'belongsToMany', model: Tag, table: 'post_tag' },
  };
}
```

Notes
- Supported types: hasOne, hasMany, belongsTo, belongsToMany, morphOne, morphMany.
- Keys are relation names; the same names will appear in eager loading and serialization (`with(['author','comments','tags'])`).
- You can mix static and method-based relations in the same model; method-based definitions take precedence when both exist.

Scopes
- Local: static localScopes = { active: b => b.where('status','active') }
- Global: static globalScopes = { notBanned: b => b.where('status','!=','banned') }
- Method-style: static scopePopular(b, min=100) { return b.where('followers', '>=', min); }

```ts
await User.query().scope('active').get();
await User.scope('active').get(); // static helper
await User.query().namedScope('popular', 500).get();
```

Soft deletes
- Enable via `static softDeletes = true`.
- Builder auto-applies `deleted_at IS NULL` (SQL) / `{ deleted_at: null }` (Mongo).
- Override with `.withTrashed()` and `.onlyTrashed()`.
- Instance restore(): sets deleted_at back to null.

Serialization
- toJSON({ include, exclude, withRelations, relationTree, maxDepth, withAccessors, onlyAppended })
- Handles circulars and depth limits; includes appends when configured.

```ts
const json = user.toJSON({ include: ['roles.permissions','display_name'], exclude: ['internal_note'], maxDepth: 5 });
```

Examples
```ts
// Create
const u = await User.query().create({ name:'Ana', email:'ana@example.com' });

// Find or fail
const f = await User.query().findOrFail(u.id!);

// Update & save
f.status = 'active';
await f.save();

// Delete (soft) & restore
await f.delete();
await f.restore();

// Eager load deep relations
const posts = await Post.query().with(['author','comments.author','tags']).get();

// Serialize with appends
User.addAppends('display_name');
const data = f.toJSON({ include:['display_name'] });
```
