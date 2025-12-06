# Router

RouterBuilder is a fluent router for Express with route groups, prefix/middleware scoping, names, constraints, resources, and automatic model binding.

Quick example
```ts
const rb = new RouterBuilder();
rb.prefix('/api').group(api => {
  api.prefix('/users').middleware('auth').group(users => {
    users.get('/', 'can:view_users', UserController.index).name('users.index');
    users.get('/:user', 'can:view_users', UserController.show).name('users.show');
    users.post('/', ['auth','role:admin'], UserController.store);
  });
});
export default rb.build();
```

Groups
- prefix('/base').group(cb)
- middleware('alias' | fn | [..]).group(cb)
- name('base') stacks names for inner routes
- where({ id:/\d+/ }) parameter constraints

Handlers
- May be: express RequestHandler, controller method (function), string alias, or arrays mixing them
- Strings are resolved via middleware registry; factories support `alias:a,b`

Route names & URLs
```ts
users.get('/:user', UserController.show).name('users.show');
const url = rb.route('users.show', { user: 5 }, { tab:'perm' });
```

Resources
```ts
rb.resource('users', UserController);
rb.apiResource('posts', PostController); // excludes create/edit
```

Automatic model binding
- A `:user` param injects a User into controller method if a matching model name is registered
- Registration: `RouterBuilder.registerModel('user', User)` or `rb.model('user', User)`
- Custom binder: `rb.model('order', async (val)=> await Order.query().where('uuid',val).firstOrFail())`

Controller signatures
- `(req, res)`
- `(req, res, user)` when a single model is bound
- `(req, res, next, ...models)` when using next/multiple bindings

Other helpers
- `match(['get','post'], '/ping', handler)`
- `any('/health', handler)`
- `redirect('/from','/to', 302)` / `permanentRedirect('/from','/to')`
- `view('/tpl','template', { a:1 })`
- `fallback(handler)` applies to `*` at the end

