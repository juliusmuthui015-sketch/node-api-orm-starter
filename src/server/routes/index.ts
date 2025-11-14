
import AuthController from '@/server/controllers/AuthController';
import UserController from '@/server/controllers/UserController';
import RoleController from '@/server/controllers/RoleController';
import PermissionController from '@/server/controllers/PermissionController';
import RouterBuilder from "@/eloquent/Router/router";

// Use middleware aliases (strings) resolved by middlewareConfig via RouterBuilder

const rb = new RouterBuilder();
const UC: any = UserController;

rb.group({ prefix: '/api' }, (api: RouterBuilder) => {
  api.group({ prefix: '/auth' }, (g: RouterBuilder) => {
    g.post('/register', AuthController.register);
    g.post('/login', AuthController.login);
  });

  api.group({ prefix: '/users', middleware: 'auth' }, (g: RouterBuilder) => {
    g.get('/', 'can:view_users', UserController.index);
    g.get('/:id', 'can:view_users', UserController.show);
    g.get('/:id/profile', 'can:view_users', UC.showProfile);
    g.post('/', 'can:create_users', UserController.store);
    g.put('/:id', 'can:update_users', UserController.update);
    g.put('/:id/profile', 'can:update_users', UC.updateProfile);
    g.post('/:id/password', 'can:update_users', UC.setPassword);
    g.post('/:id/password/reset', UC.resetPassword);
    g.delete('/:id', 'can:delete_users', UC.destroy);
  });

  api.group({ prefix: '/roles', middleware: 'auth' }, (g: RouterBuilder) => {
    g.get('/', 'can:view_roles', RoleController.index);
    g.get('/:id', 'can:view_roles', RoleController.show);
    g.post('/', 'can:create_roles', RoleController.store);
    g.put('/:id', 'can:update_roles', RoleController.update);
    g.delete('/:id', 'can:delete_roles', RoleController.destroy);
    g.post('/:id/permissions', 'can:add_permissions_to_roles', RoleController.syncPermissions);
  });

  api.group({ prefix: '/permissions', middleware: 'auth' }, (g: RouterBuilder) => {
    g.get('/', 'can:view_permissions', PermissionController.index);
    g.get('/:id', 'can:view_permissions', PermissionController.show);
    g.post('/', 'can:create_permissions', PermissionController.store);
    g.put('/:id', 'can:update_permissions', PermissionController.update);
    g.delete('/:id', 'can:delete_permissions', PermissionController.destroy);
  });
});

export default rb.build();
