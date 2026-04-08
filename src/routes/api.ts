/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider and all of them will
| be assigned to the "api" middleware group.
|
*/

import AuthController from '@/app/Http/Controllers/User/AuthController';
import UserController from '@/app/Http/Controllers/User/UserController';
import RoleController from '@/app/Http/Controllers/User/RoleController';
import PermissionController from '@/app/Http/Controllers/User/PermissionController';
import RouterBuilder from '@/eloquent/Router/router';
import FileController, { multerUpload } from '@/app/Http/Controllers/File/FileController';
import Doc from "@/eloquent/Router/Doc";

export const routesBuilder = new RouterBuilder();
const rb = routesBuilder;

/*
|--------------------------------------------------------------------------
| Authentication Routes
|--------------------------------------------------------------------------
*/
rb.prefix('/auth').group((g: RouterBuilder) => {
  g.post('/register', AuthController.register);
  g.post('/login', AuthController.login);
  g.get('/me', 'auth', AuthController.me);
});

/*
|--------------------------------------------------------------------------
| User Routes
|--------------------------------------------------------------------------
*/
rb.prefix('/users')
  .middleware(['auth', 'must-be-active'])
  .group((g: RouterBuilder) => {
    g.get('/', 'can:view_users', UserController.index);
    g.get('/:id', 'can:view_users', UserController.show);
    g.get('/:id/profile', UserController.showProfile);
    g.post('/', 'can:create_users', UserController.store);
    g.put('/:id', 'can:update_users', UserController.update);
    g.put('/:id/profile', UserController.updateProfile);
    g.post('/:id/password', 'can:update_users', UserController.setPassword);
    g.post('/:id/password/reset', UserController.resetPassword);
    g.post('/:id/roles', 'can:add_roles_to_users', UserController.addRole);
    g.delete('/:id/roles/:roleId', 'can:remove_roles_from_users', UserController.removeRole);
    g.delete('/:id', 'can:delete_users', UserController.destroy);
    g.patch('/:user/status', 'can:activate_and_deactivate_users', UserController.toggleStatus);
  });

/*
|--------------------------------------------------------------------------
| Role Routes
|--------------------------------------------------------------------------
*/
rb.prefix('/roles')
  .middleware(['auth', 'must-be-active'])
  .group((g: RouterBuilder) => {
    g.get('/', 'can:view_roles', RoleController.index);
    g.get('/:role', 'can:view_roles', RoleController.show);
    g.post('/', 'can:create_roles', RoleController.store);
    g.put('/:id', 'can:update_roles', RoleController.update);
    g.delete('/:id', 'can:delete_roles', RoleController.destroy);
    g.post('/:id/permissions', 'can:add_permissions_to_roles', RoleController.syncPermissions);
  });

/*
|--------------------------------------------------------------------------
| Permission Routes
|--------------------------------------------------------------------------
*/
rb.prefix('/permissions')
  .middleware(['auth', 'must-be-active'])
  .group((g: RouterBuilder) => {
    g.get('/', 'can:view_permissions', PermissionController.index);
    g.get('/:id', 'can:view_permissions', PermissionController.show);
  });

/*
|--------------------------------------------------------------------------
| File Routes
|--------------------------------------------------------------------------
*/
rb.prefix('/files')
  .middleware(['auth', 'must-be-active'])
  .group((g: RouterBuilder) => {
    g.get('/', 'can:view_files', FileController.index);
    g.get('/:id', 'can:view_files', FileController.show);
    g.get('/:id/download', 'can:view_files', FileController.download);
    g.get('/:id/view', 'can:view_files', FileController.view);
    g.post('/', [multerUpload.single('file'), 'can:upload_files'] as any, FileController.store);
    g.post('/raw', 'can:upload_files', FileController.storeRaw);
    g.get('/:id/signed-url', 'can:view_files', FileController.signedUrl);
    g.get('/:id/signed-thumbnail', 'can:view_files', FileController.signedThumbnailUrl);
    g.delete('/:id', 'can:delete_files', FileController.destroy);
    g.get('/:id/thumbnail', 'can:view_files', FileController.thumbnail);
    g.post('/:id/thumbnail/regenerate', 'can:upload_files', FileController.regenerateThumbnail);
  });

export default rb;


/*
|--------------------------------------------------------------------------
| Route Documentation (for plain-object controllers)
|--------------------------------------------------------------------------
| Use Doc.describe() to add documentation metadata for controllers
| that are plain objects (not classes with decorators).
|--------------------------------------------------------------------------
*/

// Auth routes
Doc.describe(AuthController, 'register', {
    summary: 'Register a new user',
    tags: ['Auth'],
    validationRules: {
        name: 'required|string|max:191',
        email: 'required|email|max:255',
        password: 'required|string|min:6',
        password_confirmation: 'required|string|min:6',
        profile: 'nullable',
    },
    responses: [
        { status: 201, description: 'User registered successfully' },
        { status: 422, description: 'Validation error' },
    ],
});

Doc.describe(AuthController, 'login', {
    summary: 'Login',
    description: 'Authenticate with email and password to receive a JWT token.',
    tags: ['Auth'],
    validationRules: {
        email: 'required|email|max:255',
        password: 'required|string|min:6',
    },
    responses: [
        { status: 200, description: 'Login successful', example: { token: 'eyJ...', user: {} } },
        { status: 401, description: 'Invalid credentials' },
        { status: 422, description: 'Validation error' },
    ],
});

Doc.describe(AuthController, 'me', {
    summary: 'Get current user',
    description: 'Returns the authenticated user profile.',
    tags: ['Auth'],
    auth: true,
});

// User routes
Doc.describe(UserController, 'index', {
    summary: 'List users',
    tags: ['Users'],
    params: [
        { name: 'search', in: 'query', description: 'Search term', type: 'string' },
        { name: 'page', in: 'query', description: 'Page number', type: 'integer' },
        { name: 'limit', in: 'query', description: 'Items per page', type: 'integer' },
        { name: 'sort', in: 'query', description: 'Sort field', type: 'string' },
        { name: 'order', in: 'query', description: 'Sort direction', type: 'string', enum: ['asc', 'desc'] },
    ],
});

Doc.describe(UserController, 'show', {
    summary: 'Get user by ID',
    tags: ['Users'],
});

Doc.describe(UserController, 'store', {
    summary: 'Create user',
    tags: ['Users'],
    validationRules: {
        name: 'required|string|max:255',
        email: 'required|email|max:255',
        password: 'required|string|min:6',
        phone_number: 'required|string|max:25',
        active_status: 'nullable|int',
        roles: 'nullable|array',
    },
});

Doc.describe(UserController, 'update', {
    summary: 'Update user',
    tags: ['Users'],
    validationRules: {
        name: 'nullable|string|max:255',
        email: 'nullable|email|max:255',
        password: 'nullable|string|min:6',
        phone_number: 'nullable|string|max:25',
        active_status: 'nullable|int',
    },
});

Doc.describe(UserController, 'destroy', {
    summary: 'Delete user',
    tags: ['Users'],
});

Doc.describe(UserController, 'toggleStatus', {
    summary: 'Toggle user status',
    description: 'Toggles the user active/inactive status.',
    tags: ['Users'],
});

Doc.describe(UserController, 'setPassword', {
    summary: 'Set user password (admin)',
    tags: ['Users'],
    validationRules: {
        password: 'required|string|min:6',
        confirm_password: 'required|string|min:6',
    },
});

Doc.describe(UserController, 'resetPassword', {
    summary: 'Reset own password',
    tags: ['Users'],
    validationRules: {
        password: 'required|string|min:6',
        confirm_password: 'required|string|min:6',
    },
});

Doc.describe(UserController, 'addRole', {
    summary: 'Add role to user',
    tags: ['Users'],
    validationRules: { role_id: 'required|int' },
});

Doc.describe(UserController, 'removeRole', {
    summary: 'Remove role from user',
    tags: ['Users'],
});

Doc.describe(UserController, 'showProfile', {
    summary: 'Get user profile',
    tags: ['Users'],
});

Doc.describe(UserController, 'updateProfile', {
    summary: 'Update user profile',
    tags: ['Users'],
    validationRules: {
        gender: 'nullable|string|in:male,female',
        type: 'nullable|string|max:50|in:admin,staff,user,agent',
        id_number: 'nullable|string|max:100',
        city: 'nullable|string|max:100',
        country: 'nullable|string|max:100',
        address: 'nullable|string|max:255',
        zip_code: 'nullable|string|max:20',
        date_of_birth: 'nullable|date',
    },
});


