# Query Builder

The EloquentBuilder powers Model.query() with a fluent API that runs on SQL or MongoDB.

Highlights
- where/orWhere with nested groups
- whereIn/NotIn, whereNull/NotNull, between/not between
- has/whereHas/doesntHave with nested relation constraints
- joins, groupBy, having, orderBy, limit/offset, paginate
- aggregates: count, sum, avg, min, max, exists/doesntExist
- eager loading with() of any depth, per-path constraints
- soft deletes: withTrashed(), onlyTrashed(), withoutTrashed()
- scopes: scope(name, ...args), scopes({ name:[args] })

Basics
```ts
const users = await User.query()
  .select(['id','name'])
  .where('status','active')
  .orWhere(q => q.where('email','like','%example.com'))
  .orderBy('created_at','desc')
  .limit(20)
  .offset(0)
  .get();
```

Eager loading (any depth)
```ts
const posts = await Post.query()
  .with(['author','comments.author','tags'])
  .get();

const postsJson = await Post.query()
  .with({ 'comments': qb => qb.where('status','approved') })
  .toArray();
```

Aggregation & pagination
```ts
const total = await User.query().count();
const stats = {
  maxId: await User.query().max('id'),
  minId: await User.query().min('id'),
  avgId: await User.query().avg('id'),
  sumId: await User.query().sum('id'),
};

const { data, pagination } = await User.query().paginate(15, 1);
```

Relations filtering
```ts
// with at least 2 roles
await User.query().whereHas('roles', undefined, '>=', 2).get();

// users with a role that has a specific permission
await User.query().whereHas('roles', r => r.whereHas('permissions', p => p.where('name','edit'))).get();

// without comments
await Post.query().whereDoesntHave('comments').get();
```

Soft deletes
```ts
await User.query().withTrashed().get();   // include soft-deleted
await User.query().onlyTrashed().get();   // only soft-deleted
await User.query().withoutTrashed().get();// default behavior
```

Joins, groups, having (SQL)
```ts
const rows = await Order.query()
  .join('order_items', 'orders.id', '=', 'order_items.order_id')
  .groupBy(['orders.id'])
  .having('SUM(order_items.qty)', '>', 5)
  .get();
```

Scopes
```ts
// Local scopes
User.addLocalScope('active', b => b.where('status','active'));

await User.query().scope('active').get();
await User.query().scopes({ active: [] }).get();
```

MongoDB notes
- The builder auto-normalizes id-like fields (`id` <-> `_id`, `*_id` coercion to ObjectId when possible).
- whereHas is post-filtered in-memory by fetching related documents as needed.
- Order/limit/offset map to Mongo `sort/limit/skip`.

