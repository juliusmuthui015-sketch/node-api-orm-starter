# Authentication

This starter includes JWT-based authentication with role-based access control (RBAC).

## Overview

The authentication system provides:

- JWT token-based authentication
- User registration and login
- Role and permission management
- Password hashing with bcrypt
- Request validation

## Authentication Endpoints

### Register

```http
POST /api/auth/register
Content-Type: application/json

{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "password123",
    "password_confirmation": "password123",
    "phone_number": "+1234567890"
}
```

Response:
```json
{
    "user": {
        "id": 1,
        "name": "John Doe",
        "email": "john@example.com"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Login

```http
POST /api/auth/login
Content-Type: application/json

{
    "email": "john@example.com",
    "password": "password123"
}
```

Response:
```json
{
    "user": {
        "id": 1,
        "name": "John Doe",
        "email": "john@example.com",
        "roles": ["user"],
        "permissions": ["view_profile"]
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Get Current User

```http
GET /api/auth/me
Authorization: Bearer <token>
```

Response:
```json
{
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "profile": {
        "gender": "male",
        "type": "user"
    },
    "roles": [
        {
            "id": 2,
            "name": "User",
            "slug": "user",
            "permissions": [...]
        }
    ]
}
```

## Using Authentication

### Making Authenticated Requests

Include the JWT token in the Authorization header:

```javascript
fetch('/api/users', {
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    }
});
```

### Auth Helper Functions

Access the authenticated user in your code:

```typescript
import { auth } from '@/app/Helpers/auth';

// Check if user is authenticated
if (auth().check()) {
    // Get the authenticated user
    const user = auth().user();
    console.log(user.name);
}

// Get user ID
const userId = auth().id();

// Check user roles
if (auth().hasRole('admin')) {
    // Admin-only logic
}

// Check user permissions
if (auth().can('create_users')) {
    // Has permission
}
```

### In Controllers

```typescript
export default {
    async index(req: Request, res: Response) {
        // Access user from request
        const user = req.user;
        
        // User has id, roles, and permissions
        console.log(user.id);
        console.log(user.roles);      // ['admin', 'user']
        console.log(user.permissions); // ['view_users', 'create_users']
    }
}
```

## Protecting Routes

### Require Authentication

```typescript
// Single route
rb.get('/profile', 'auth', ProfileController.show);

// Route group
rb.prefix('/users')
    .middleware(['auth'])
    .group((g) => {
        g.get('/', UserController.index);
    });
```

### Require Active Account

```typescript
rb.prefix('/users')
    .middleware(['auth', 'must-be-active'])
    .group((g) => {
        // Only active users can access
    });
```

### Require Specific Roles

```typescript
// Using authorizeRoles middleware
rb.get('/admin', ['auth', authorizeRoles('admin')], AdminController.index);

// Multiple roles (any of)
rb.get('/manage', ['auth', authorizeRoles('admin', 'manager')], ManageController.index);
```

### Require Specific Permissions

```typescript
// Using can: prefix
rb.get('/users', 'can:view_users', UserController.index);
rb.post('/users', 'can:create_users', UserController.store);
rb.put('/users/:id', 'can:update_users', UserController.update);
rb.delete('/users/:id', 'can:delete_users', UserController.destroy);
```

## Role & Permission Management

### Creating Roles

```typescript
const role = await Role.create({
    name: 'Editor',
    slug: 'editor',
    description: 'Can edit content'
});
```

### Creating Permissions

```typescript
const permission = await Permission.create({
    name: 'Edit Posts',
    slug: 'edit_posts',
    description: 'Can edit blog posts'
});
```

### Assigning Permissions to Roles

```typescript
const role = await Role.find(roleId);
await role.permissions().attach([permissionId1, permissionId2]);

// Or sync (replace all)
await role.permissions().sync([permissionId1, permissionId2]);
```

### Assigning Roles to Users

```typescript
const user = await User.find(userId);
await user.roles().attach(roleId);

// Multiple roles
await user.roles().attach([roleId1, roleId2]);
```

## Default Roles and Permissions

The seeder creates these default roles:

| Role | Slug | Description |
|------|------|-------------|
| Admin | admin | Full access |
| User | user | Basic access |

Default permissions:

| Permission | Description |
|------------|-------------|
| view_users | View user list |
| create_users | Create new users |
| update_users | Update existing users |
| delete_users | Delete users |
| view_roles | View roles |
| create_roles | Create roles |
| update_roles | Update roles |
| delete_roles | Delete roles |
| add_permissions_to_roles | Manage role permissions |
| view_permissions | View permissions |
| view_files | View files |
| upload_files | Upload files |
| delete_files | Delete files |

## Password Management

### Set Password (Admin)

```http
POST /api/users/:id/password
Authorization: Bearer <admin-token>
Content-Type: application/json

{
    "password": "newpassword123",
    "password_confirmation": "newpassword123"
}
```

### Reset Own Password

```http
POST /api/users/:id/password/reset
Authorization: Bearer <token>
Content-Type: application/json

{
    "password": "newpassword123",
    "password_confirmation": "newpassword123"
}
```

## JWT Configuration

Configure in your `.env`:

```env
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d
```

## Security Best Practices

1. **Use strong JWT secrets**: Generate with `pnpm run key:generate`
2. **Set appropriate token expiration**: Balance security and user experience
3. **Use HTTPS in production**: Protect tokens in transit
4. **Validate all input**: Use the validation system
5. **Hash passwords properly**: bcrypt with appropriate rounds
6. **Implement rate limiting**: Prevent brute force attacks
7. **Log authentication events**: Monitor for suspicious activity

