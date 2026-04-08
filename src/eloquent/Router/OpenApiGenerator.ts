/*
|--------------------------------------------------------------------------
| OpenAPI 3.0 Generator
|--------------------------------------------------------------------------
|
| Converts ScannedRoute[] into a valid OpenAPI 3.0.x document.
| Supports auto-detection of parameters, request bodies from validation
| rules, security schemes, and tag grouping.
|
*/

import { ScannedRoute } from './RouteScanner';
import { DocBodyFieldMeta } from './Doc';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface OpenApiDocument {
    openapi: string;
    info: {
        title: string;
        description?: string;
        version: string;
        contact?: { name?: string; email?: string; url?: string };
    };
    servers?: Array<{ url: string; description?: string }>;
    tags: Array<{ name: string; description?: string }>;
    paths: Record<string, Record<string, any>>;
    components: {
        securitySchemes?: Record<string, any>;
        schemas?: Record<string, any>;
    };
}

export interface OpenApiGeneratorOptions {
    title?: string;
    description?: string;
    version?: string;
    serverUrl?: string;
    contact?: { name?: string; email?: string; url?: string };
}

// ─── Validation Rule → JSON Schema Mapper ──────────────────────────────────────

function validationRuleToSchema(ruleString: string): {
    type: string;
    format?: string;
    minimum?: number;
    maximum?: number;
    minLength?: number;
    maxLength?: number;
    enum?: string[];
    items?: any;
    required: boolean;
    description?: string;
} {
    const parts = ruleString.split('|').map((s) => s.trim()).filter(Boolean);

    let type = 'string';
    let format: string | undefined;
    let minimum: number | undefined;
    let maximum: number | undefined;
    let minLength: number | undefined;
    let maxLength: number | undefined;
    let enumValues: string[] | undefined;
    let items: any = undefined;
    let required = false;
    const descParts: string[] = [];

    for (const part of parts) {
        switch (true) {
            case part === 'required':
                required = true;
                break;
            case part === 'nullable':
                // Not required
                break;
            case part === 'string':
                type = 'string';
                break;
            case part === 'int' || part === 'integer':
                type = 'integer';
                break;
            case part === 'numeric' || part === 'float' || part === 'double':
                type = 'number';
                break;
            case part === 'boolean':
                type = 'boolean';
                break;
            case part === 'array':
                type = 'array';
                items = { type: 'string' };
                break;
            case part === 'json':
                type = 'object';
                break;
            case part === 'object':
                type = 'object';
                break;
            case part === 'email':
                type = 'string';
                format = 'email';
                break;
            case part === 'date':
                type = 'string';
                format = 'date-time';
                break;
            case part === 'url':
                type = 'string';
                format = 'uri';
                break;
            case part === 'uuid':
                type = 'string';
                format = 'uuid';
                break;
            case part === 'phone':
                type = 'string';
                format = 'phone';
                break;
            case part === 'confirmed':
                descParts.push('Must match confirmation field');
                break;
            case part.startsWith('min:'):
                const minVal = Number(part.split(':')[1]);
                if (type === 'integer' || type === 'number') minimum = minVal;
                else minLength = minVal;
                break;
            case part.startsWith('max:'):
                const maxVal = Number(part.split(':')[1]);
                if (type === 'integer' || type === 'number') maximum = maxVal;
                else maxLength = maxVal;
                break;
            case part.startsWith('in:'):
                enumValues = part.split(':')[1].split(',').map((s) => s.trim());
                break;
            case part.startsWith('exists:'):
                const existsParts = part.split(':')[1].split(',');
                descParts.push(`Must exist in ${existsParts[0]}.${existsParts[1] || 'id'}`);
                break;
            case part.startsWith('unique:'):
                const uniqueParts = part.split(':')[1].split(',');
                descParts.push(`Must be unique in ${uniqueParts[0]}.${uniqueParts[1] || 'id'}`);
                break;
            case part.startsWith('regex:'):
                descParts.push(`Must match pattern: ${part.split(':')[1]}`);
                break;
            case part.startsWith('size:'):
                const sizeVal = Number(part.split(':')[1]);
                if (type === 'integer' || type === 'number') {
                    minimum = sizeVal;
                    maximum = sizeVal;
                } else {
                    minLength = sizeVal;
                    maxLength = sizeVal;
                }
                break;
            case part.startsWith('between:'):
                const [bMin, bMax] = part.split(':')[1].split(',').map(Number);
                if (type === 'integer' || type === 'number') {
                    minimum = bMin;
                    maximum = bMax;
                } else {
                    minLength = bMin;
                    maxLength = bMax;
                }
                break;
        }
    }

    const schema: any = { type, required };
    if (format) schema.format = format;
    if (minimum !== undefined) schema.minimum = minimum;
    if (maximum !== undefined) schema.maximum = maximum;
    if (minLength !== undefined) schema.minLength = minLength;
    if (maxLength !== undefined) schema.maxLength = maxLength;
    if (enumValues) schema.enum = enumValues;
    if (items) schema.items = items;
    if (descParts.length > 0) schema.description = descParts.join('. ');

    return schema;
}

// ─── Generator ─────────────────────────────────────────────────────────────────

export class OpenApiGenerator {
    /**
     * Generate an OpenAPI 3.0 document from scanned routes.
     */
    static generate(routes: ScannedRoute[], options: OpenApiGeneratorOptions = {}): OpenApiDocument {
        const doc: OpenApiDocument = {
            openapi: '3.0.3',
            info: {
                title: options.title || process.env.DOCS_TITLE || 'API Documentation',
                description: options.description || process.env.DOCS_DESCRIPTION || 'Auto-generated API documentation',
                version: options.version || process.env.DOCS_VERSION || '1.0.0',
            },
            servers: [],
            tags: [],
            paths: {},
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                        description: 'Enter your JWT token',
                    },
                },
                schemas: {},
            },
        };

        if (options.contact) {
            doc.info.contact = options.contact;
        }

        const serverUrl = options.serverUrl || process.env.DOCS_SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
        doc.servers!.push({ url: serverUrl, description: 'Default Server' });

        // Collect unique tags
        const tagSet = new Set<string>();

        // Build paths
        for (const route of routes) {
            const openApiPath = this.expressToOpenApiPath(route.path);
            const method = route.method.toLowerCase();

            if (!doc.paths[openApiPath]) {
                doc.paths[openApiPath] = {};
            }

            // Skip duplicate methods on same path (e.g. PUT + PATCH for update)
            if (doc.paths[openApiPath][method]) continue;

            // Tags
            for (const tag of route.tags) tagSet.add(tag);

            // Build operation
            const operation: any = {
                summary: route.doc.summary || '',
                description: route.doc.description || '',
                tags: route.tags,
                operationId: this.buildOperationId(method, route.path, route.name),
                parameters: [],
                responses: {},
            };

            if (route.doc.deprecated) {
                operation.deprecated = true;
            }

            // Security
            if (route.requiresAuth) {
                operation.security = [{ bearerAuth: [] }];
            }

            // Add permission info to description
            if (route.permissions.length > 0) {
                const permDesc = `\n\n**Required permissions:** \`${route.permissions.join('`, `')}\``;
                operation.description = (operation.description || '') + permDesc;
            }

            // Add middleware info
            if (route.middleware.length > 0) {
                const mwDesc = `\n\n**Middleware:** ${route.middleware.map((m: string) => `\`${m}\``).join(', ')}`;
                operation.description = (operation.description || '') + mwDesc;
            }

            // Path parameters
            for (const param of route.pathParams) {
                const docParam = route.doc.params?.find((p) => p.name === param);
                operation.parameters.push({
                    name: param,
                    in: 'path',
                    required: true,
                    description: docParam?.description || `The ${param} parameter`,
                    schema: {
                        type: docParam?.type || 'string',
                        ...(docParam?.enum ? { enum: docParam.enum } : {}),
                    },
                    ...(docParam?.example !== undefined ? { example: docParam.example } : {}),
                });
            }

            // Query parameters (from @Doc.param with in: 'query')
            if (route.doc.params) {
                for (const p of route.doc.params) {
                    if (p.in === 'query' || p.in === 'header' || p.in === 'cookie') {
                        operation.parameters.push({
                            name: p.name,
                            in: p.in,
                            required: p.required || false,
                            description: p.description || '',
                            schema: {
                                type: p.type || 'string',
                                ...(p.enum ? { enum: p.enum } : {}),
                            },
                            ...(p.example !== undefined ? { example: p.example } : {}),
                        });
                    }
                }
            }

            // Request body (from validation rules or @Doc.body)
            if (['post', 'put', 'patch'].includes(method)) {
                const bodySchema = this.buildRequestBodySchema(route);
                if (bodySchema) {
                    operation.requestBody = {
                        required: true,
                        content: {
                            'application/json': {
                                schema: bodySchema,
                            },
                        },
                    };
                }
            }

            // Responses
            operation.responses = this.buildResponses(route);

            doc.paths[openApiPath][method] = operation;
        }

        // Build tags array
        doc.tags = Array.from(tagSet).sort().map((name) => ({ name }));

        return doc;
    }

    /**
     * Convert Express-style path (:param) to OpenAPI style ({param}).
     */
    private static expressToOpenApiPath(path: string): string {
        return path.replace(/:(\w+)(\([^)]*\))?/g, '{$1}');
    }

    /**
     * Build a unique operation ID.
     */
    private static buildOperationId(method: string, path: string, name: string | null): string {
        if (name) {
            return name.replace(/\./g, '_');
        }
        // Fallback: method + path segments
        const segments = path
            .replace(/^\/api/, '')
            .split('/')
            .filter(Boolean)
            .map((s) => s.replace(/[:{}\(\)]/g, '').replace(/^\w/, (c) => c.toUpperCase()));
        return method.toLowerCase() + segments.join('');
    }

    /**
     * Build request body JSON schema from @Doc.body, @Doc.validates, or validation rules.
     */
    private static buildRequestBodySchema(route: ScannedRoute): any | null {
        const body = route.doc.body;
        const validationRules = route.doc.validationRules;

        // Priority: explicit body > validation rules
        const rules: Record<string, string> = {};

        if (body) {
            for (const [field, spec] of Object.entries(body)) {
                if (typeof spec === 'string') {
                    rules[field] = spec;
                } else {
                    // DocBodyFieldMeta – convert to rule string for uniform processing
                    const meta = spec as DocBodyFieldMeta;
                    const parts: string[] = [];
                    if (meta.required) parts.push('required');
                    if (meta.type) parts.push(meta.type);
                    if (meta.enum) parts.push(`in:${meta.enum.join(',')}`);
                    rules[field] = parts.join('|') || 'nullable|string';
                }
            }
        } else if (validationRules) {
            Object.assign(rules, validationRules);
        }

        if (Object.keys(rules).length === 0) return null;

        const properties: Record<string, any> = {};
        const required: string[] = [];

        for (const [field, ruleString] of Object.entries(rules)) {
            // Skip wildcard/nested rules (e.g. 'roles.*')
            if (field.includes('*') || field.includes('.')) continue;

            const schema = validationRuleToSchema(ruleString);
            const { required: isRequired, ...schemaProps } = schema;
            properties[field] = schemaProps;

            if (isRequired) required.push(field);
        }

        if (Object.keys(properties).length === 0) return null;

        const result: any = {
            type: 'object',
            properties,
        };
        if (required.length > 0) result.required = required;

        return result;
    }

    /**
     * Build responses map.
     */
    private static buildResponses(route: ScannedRoute): Record<string, any> {
        const responses: Record<string, any> = {};

        // Use explicit responses if provided
        if (route.doc.responses && route.doc.responses.length > 0) {
            for (const resp of route.doc.responses) {
                const statusStr = String(resp.status);
                responses[statusStr] = {
                    description: resp.description || this.defaultStatusDescription(resp.status),
                };
                if (resp.schema) {
                    responses[statusStr].content = {
                        'application/json': { schema: resp.schema },
                    };
                }
                if (resp.example) {
                    if (!responses[statusStr].content) {
                        responses[statusStr].content = { 'application/json': {} };
                    }
                    responses[statusStr].content['application/json'].example = resp.example;
                }
            }
            return responses;
        }

        // Auto-generate sensible defaults
        const method = route.method.toUpperCase();

        if (method === 'POST') {
            responses['201'] = { description: 'Created successfully' };
        } else {
            responses['200'] = { description: 'Successful response' };
        }

        if (route.requiresAuth) {
            responses['401'] = { description: 'Unauthorized – authentication required' };
        }

        if (route.permissions.length > 0) {
            responses['403'] = { description: 'Forbidden – insufficient permissions' };
        }

        if (route.pathParams.length > 0) {
            responses['404'] = { description: 'Resource not found' };
        }

        // If route has body validation, add 422
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
            responses['422'] = {
                description: 'Validation error',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                errors: {
                                    type: 'object',
                                    description: 'Field-level error codes',
                                    additionalProperties: {
                                        type: 'array',
                                        items: { type: 'string' },
                                    },
                                },
                                messages: {
                                    type: 'object',
                                    description: 'Human-readable error messages',
                                    additionalProperties: {
                                        type: 'array',
                                        items: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                },
            };
        }

        return responses;
    }

    /**
     * Default HTTP status description.
     */
    private static defaultStatusDescription(status: number): string {
        const map: Record<number, string> = {
            200: 'OK',
            201: 'Created',
            204: 'No Content',
            301: 'Moved Permanently',
            302: 'Found',
            400: 'Bad Request',
            401: 'Unauthorized',
            403: 'Forbidden',
            404: 'Not Found',
            405: 'Method Not Allowed',
            409: 'Conflict',
            422: 'Unprocessable Entity',
            429: 'Too Many Requests',
            500: 'Internal Server Error',
        };
        return map[status] || 'Response';
    }
}

export default OpenApiGenerator;

