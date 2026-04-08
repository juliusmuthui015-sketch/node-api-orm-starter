# API Documentation System

Built-in auto-generating API documentation powered by route scanning, `@Doc` decorators, and the [Scalar](https://scalar.com/) UI.

## Quick Start

1. **Start the server** – docs are enabled by default in non-production environments:
   ```bash
   pnpm dev
   ```

2. **Open the docs UI** at [http://localhost:3000/docs](http://localhost:3000/docs)

3. **Raw OpenAPI spec** at [http://localhost:3000/docs/openapi.json](http://localhost:3000/docs/openapi.json)

## Features

- **Zero-config route scanning** – all registered routes are automatically discovered
- **Auto-detection** of authentication, permissions, path parameters, and middleware
- **`@Doc` decorator** for class-based controllers
- **`Doc.describe()`** for plain-object controllers
- **Validation rule → JSON Schema** mapping (parses your `req.validate()` rules)
- **Scalar UI** – modern, interactive API reference loaded from CDN (no npm dep)
- **Artisan commands** – generate static OpenAPI spec or list documented routes
- **OpenAPI 3.0.3** compatible output

## Configuration

Set these environment variables in `.env`:

| Variable | Default | Description |
|---|---|---|
| `DOCS_ENABLED` | `true` (non-production) | Enable/disable docs |
| `DOCS_TITLE` | `API Documentation` | API title |
| `DOCS_DESCRIPTION` | `Auto-generated API documentation` | API description |
| `DOCS_VERSION` | `1.0.0` | API version |
| `DOCS_PATH` | `/docs` | Base path for docs UI |
| `DOCS_SERVER_URL` | `http://localhost:{PORT}` | Server URL in spec |
| `DOCS_THEME` | `kepler` | Scalar UI theme |

Available themes: `default`, `alternate`, `moon`, `purple`, `solarized`, `bluePlanet`, `saturn`, `kepler`, `mars`, `deepSpace`, `none`.

## Usage

### Class-based Controllers (with `@Doc` decorator)

```typescript
import { Doc } from '@/eloquent/Router/Doc';
import { Injectable } from '@/eloquent/Container/Container';

@Injectable()
export class ProductController {
    @Doc({
        summary: 'List products',
        description: 'Retrieve a paginated list of products.',
        tags: ['Products'],
        params: [
            { name: 'search', in: 'query', description: 'Search term', type: 'string' },
            { name: 'page', in: 'query', description: 'Page number', type: 'integer' },
            { name: 'limit', in: 'query', description: 'Items per page', type: 'integer' },
        ],
    })
    async index(req, res) { ... }

    @Doc({
        summary: 'Create product',
        tags: ['Products'],
        validationRules: {
            name: 'required|string|max:255',
            price: 'required|numeric|min:0',
            category: 'required|string|in:electronics,clothing,food',
        },
        responses: [
            { status: 201, description: 'Product created' },
            { status: 422, description: 'Validation error' },
        ],
    })
    async store(req, res) { ... }

    @Doc.summary('Get product by ID')
    @Doc.group('Products')
    @Doc.param({ name: 'id', in: 'path', description: 'Product ID', type: 'integer' })
    @Doc.response({ status: 200, description: 'Product details' })
    @Doc.response({ status: 404, description: 'Not found' })
    async show(req, res) { ... }

    @Doc.deprecated()
    async legacyEndpoint(req, res) { ... }

    @Doc.hidden()
    async internalEndpoint(req, res) { ... }
}
```

### Plain-object Controllers (with `Doc.describe()`)

```typescript
// In your routes file or a separate docs file:
import { Doc } from '@/eloquent/Router/Doc';
import AuthController from '@/app/Http/Controllers/User/AuthController';

Doc.describe(AuthController, 'login', {
    summary: 'Login',
    description: 'Authenticate with email and password.',
    tags: ['Auth'],
    validationRules: {
        email: 'required|email',
        password: 'required|string|min:6',
    },
    responses: [
        { status: 200, description: 'Login successful', example: { token: 'eyJ...' } },
        { status: 401, description: 'Invalid credentials' },
    ],
});
```

### Available Sub-decorators

| Decorator | Description |
|---|---|
| `@Doc({ ... })` | Full metadata object |
| `@Doc.summary('...')` | Set summary |
| `@Doc.description('...')` | Set description |
| `@Doc.group('Tag1', 'Tag2')` | Set tags/groups |
| `@Doc.param({ ... })` | Add a parameter |
| `@Doc.body({ ... })` | Define request body schema |
| `@Doc.validates({ ... })` | Define validation rules |
| `@Doc.response({ ... })` | Add a response definition |
| `@Doc.deprecated()` | Mark as deprecated |
| `@Doc.hidden()` | Hide from docs |

### Validation Rule Mapping

Your existing validation rules are automatically converted to JSON Schema:

| Rule | JSON Schema |
|---|---|
| `string` | `type: "string"` |
| `int`, `integer` | `type: "integer"` |
| `numeric`, `float` | `type: "number"` |
| `boolean` | `type: "boolean"` |
| `array` | `type: "array"` |
| `email` | `type: "string", format: "email"` |
| `date` | `type: "string", format: "date-time"` |
| `url` | `type: "string", format: "uri"` |
| `uuid` | `type: "string", format: "uuid"` |
| `min:N` | `minLength` or `minimum` |
| `max:N` | `maxLength` or `maximum` |
| `in:a,b,c` | `enum: ["a","b","c"]` |
| `required` | Added to `required` array |
| `exists:table,col` | Description note |
| `unique:table,col` | Description note |

### Auto-detected Information

The scanner automatically detects from your routes:

- **Authentication** – routes with `auth` middleware get `security: [{ bearerAuth: [] }]`
- **Permissions** – `can:view_users` middleware → documented in description
- **Path parameters** – `:id`, `:userId` etc. → path parameters
- **Tags** – inferred from URL prefix (`/api/users` → `Users`)
- **Summaries** – inferred from route name or method + path
- **Middleware** – listed in route description

## Artisan Commands

### Generate OpenAPI spec file

```bash
pnpm artisan docs:generate                    # → docs/openapi.json
pnpm artisan docs:generate --output api.json  # Custom output path
pnpm artisan docs:generate --title "My API"   # Custom title
```

### List documented routes

```bash
pnpm artisan docs:routes              # List all routes
pnpm artisan docs:routes --tag Users  # Filter by tag
pnpm artisan docs:routes --json       # JSON output
```

## Architecture

```
src/eloquent/Router/
├── Doc.ts              # @Doc decorator & metadata store
├── RouteScanner.ts     # Scans RouterBuilder routes + enriches with metadata
├── OpenApiGenerator.ts # Converts scanned routes → OpenAPI 3.0 JSON
├── DocsUI.ts           # Serves HTML UI (Scalar) + JSON endpoint
└── router.ts           # RouterBuilder (enhanced with controllerRef tracking)

src/app/Providers/
└── DocServiceProvider.ts  # Mounts /docs routes on Express app

src/eloquent/Command/Commands/
└── DocsCommands.ts     # docs:generate & docs:routes artisan commands
```

