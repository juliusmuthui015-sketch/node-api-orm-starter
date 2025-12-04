import AuthController from '@/server/controllers/User/AuthController';
import UserController from '@/server/controllers/User/UserController';
import RoleController from '@/server/controllers/User/RoleController';
import PermissionController from '@/server/controllers/User/PermissionController';
import RouterBuilder from "@/eloquent/Router/router";

// Use middleware aliases (strings) resolved by middlewareConfig via RouterBuilder

export const routesBuilder = new RouterBuilder();
const rb = routesBuilder;
const UC = UserController;

rb.prefix('/api').group((api: RouterBuilder) => {
  api.prefix('/auth').group((g: RouterBuilder) => {
    g.post('/register', AuthController.register);
    g.post('/login', AuthController.login);
  });

  api.prefix('/users').middleware('auth').group((g: RouterBuilder) => {
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

  api.prefix('/roles').middleware('auth').group((g: RouterBuilder) => {
    g.get('/', 'can:view_roles', RoleController.index);
    g.get('/:id', 'can:view_roles', RoleController.show);
    g.post('/', 'can:create_roles', RoleController.store);
    g.put('/:id', 'can:update_roles', RoleController.update);
    g.delete('/:id', 'can:delete_roles', RoleController.destroy);
    g.post('/:id/permissions', 'can:add_permissions_to_roles', RoleController.syncPermissions);
  });

  api.prefix('/permissions').middleware('auth').group((g: RouterBuilder) => {
    g.get('/', 'can:view_permissions', PermissionController.index);
    g.get('/:id', 'can:view_permissions', PermissionController.show);
  });
});

export default rb.build();
