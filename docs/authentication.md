# Authentication

This starter includes JWT-based authentication with role-based access control.

## Endpoints

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
    "user": { "id": 1, "name": "John Doe", "email": "john@example.com" },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Get Current User

```http
GET /api/auth/me
Authorization: Bearer <token>
```

## Using Authentication

### In Requests

```javascript
fetch('/api/users', {
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    }
});
```

### Auth Helper

```typescript
import { auth } from '@/app/Helpers/auth';

if (auth().check()) {
    const user = auth().user();
    console.log(user.name);
}

// Check roles/permissions
if (auth().hasRole('admin')) { }
if (auth().can('create_users')) { }
```

## Protecting Routes

```typescript
// Require authentication
rb.get('/profile', 'auth', ProfileController.show);

// Require permission
rb.get('/users', 'can:view_users', UserController.index);

// Route group
rb.prefix('/users')
    .middleware(['auth', 'must-be-active'])
    .group((g) => {
        g.get('/', 'can:view_users', UserController.index);
    });
```

## Default Roles

| Role | Description |
|------|-------------|
| admin | Full access |
| user | Basic access |

## Default Permissions

- `view_users`, `create_users`, `update_users`, `delete_users`
- `view_roles`, `create_roles`, `update_roles`, `delete_roles`
- `view_permissions`
- `view_files`, `upload_files`, `delete_files`

## Configuration

```env
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
```

