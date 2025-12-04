// Model.ts
import { ModelAttributes, RelationshipConfig, Casts } from './types';
import { EloquentBuilder } from './EloquentBuilder';
import { HasOne, HasMany, BelongsTo, BelongsToMany } from './relationships';
import { query as dbQuery, getDbType, collection as mongoCollection } from '@/config/db.config';
import util from 'util';
import { ObjectId } from 'mongodb';


// Add cache for accessors/mutators
interface AccessorDescriptor {
    name: string;
    sync?: (value: any, instance: Model) => any;
    async?: (value: any, instance: Model) => Promise<any>;
}

interface MutatorDescriptor {
    name: string;
    sync?: (value: any, instance: Model) => any;
    async?: (value: any, instance: Model) => Promise<any>;
}

// Add this interface for type safety
export interface ToJSONOptions {
    maxDepth?: number;
    currentDepth?: number;
    visited?: WeakSet<any>;
    include?: string[];
    exclude?: string[];
    withRelations?: boolean;
    includeMetadata?: boolean;
    relationTree?: any;
    withAccessors?: boolean; // New option to include accessors
    onlyAppended?: boolean; // New option to only include appended attributes
}

export abstract class Model {
    [key: string]: any;

    static table: string = '';
    static primaryKey: string = 'id';
    static fillable: string[] = [];
    static guarded: string[] = [];
    static hidden: string[] = [];
    static appends: string[] = []; // New: Appended attributes field
    static casts: Casts = {};
    static timestamps: boolean = true;
    static softDeletes: boolean = false;
    static relationships: { [key: string]: RelationshipConfig } = {};
    static autoIncrement: boolean = true;

    // New static properties for accessors/mutators
    private static _accessors: Map<string, AccessorDescriptor> = new Map();
    private static _mutators: Map<string, MutatorDescriptor> = new Map();

    id?: number | string;
    created_at?: Date;
    updated_at?: Date;
    deleted_at?: Date | null;

    protected attributes: ModelAttributes = {};
    protected original: ModelAttributes = {};
    protected relationshipsLoaded: { [key: string]: any } = {};
    protected __exists: boolean = false;
    protected __isGettingAttribute: boolean = false;
    protected __attributeCache: Map<string, any> = new Map();

    constructor(attributes: ModelAttributes = {}) {
        this.fill(attributes);
        this.original = { ...this.attributes };
        return new Proxy(this, {
            get: (target: any, prop: PropertyKey, receiver: any) => {
                if (typeof prop === 'string') {
                    // Check if it's an appended attribute
                    const staticClass = target.constructor as typeof Model;
                    const isAppended = staticClass.appends.includes(prop);

                    // Handle accessors first (only if it's an appended attribute or direct property access)
                    const accessorValue = target.getAttributeWithAccessor(prop, isAppended);
                    if (accessorValue !== undefined) {
                        return accessorValue;
                    }

                    if (prop in target && typeof target[prop] === 'function') {
                        return target[prop].bind(target);
                    }
                    if (prop in target.attributes) {
                        return target.attributes[prop];
                    }
                    if (prop in target.relationshipsLoaded) {
                        return target.relationshipsLoaded[prop];
                    }
                    if (prop in target) {
                        const val = target[prop];
                        return typeof val === 'function' ? val.bind(target) : val;
                    }
                    return undefined;
                }
                return (target as any)[prop];
            },
            set: (target: any, prop: PropertyKey, value: any, receiver: any) => {
                if (typeof prop === 'string') {
                    const internalProps = new Set(['attributes', 'original', 'relationshipsLoaded', '__isGettingAttribute', '__attributeCache']);
                    if (internalProps.has(prop)) {
                        (target as any)[prop] = value;
                        return true;
                    }

                    // Handle mutators
                    if (target.setAttributeWithMutator(prop, value)) {
                        return true;
                    }

                    target.setAttribute(prop, value);
                    return true;
                }
                (target as any)[prop] = value;
                return true;
            },
        });
    }

    // Helper to convert snake_case to StudlyCase method segment
    private static toStudlyCase(key: string): string {
        return key
            .split('_')
            .filter(Boolean)
            .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
            .join('');
    }

    // Build accessor/mutator method name for a given key
    private static buildMethodName(prefix: 'get' | 'set', key: string, suffix: 'Attribute'): string {
        const studly = this.toStudlyCase(key);
        return `${prefix}${studly}${suffix}`;
    }

    // ====================
    // CORE ATTRIBUTE ACCESS METHODS
    // ====================

    /**
     * Get raw attribute value (bypasses accessors)
     */
    getRawAttribute(key: string): any {
        return this.attributes[key];
    }

    /**
     * Set raw attribute value (bypasses mutators)
     */
    setRawAttribute(key: string, value: any): void {
        this.attributes[key] = value;
        this.__attributeCache.delete(key);
    }

    /**
     * Get property with support for direct field access
     */
    getProperty(prop: string): any {
        // First check if it's a direct property
        if (prop in this && !['attributes', 'original', 'relationshipsLoaded'].includes(prop)) {
            return this[prop];
        }

        // Check attributes
        if (prop in this.attributes) {
            return this.attributes[prop];
        }

        // Check relationships
        if (prop in this.relationshipsLoaded) {
            return this.relationshipsLoaded[prop];
        }

        return undefined;
    }

    // ====================
    // ACCESSOR METHODS
    // ====================

    /**
     * Get an attribute with accessor support (sync/async)
     * @param key Attribute name
     * @param onlyAppended If true, only return value if it's in appends array
     */
    async getAttributeAsync<T = any>(key: string, onlyAppended: boolean = false): Promise<T> {
        // Check if we should only return appended attributes
        if (onlyAppended) {
            const staticClass = this.constructor as typeof Model;
            if (!staticClass.appends.includes(key)) {
                return undefined as T;
            }
        }

        // Check cache first
        if (this.__attributeCache.has(key)) {
            return this.__attributeCache.get(key);
        }

        // Check for accessor
        const staticClass = this.constructor as typeof Model;
        const accessorKey = (staticClass as any).buildMethodName('get', key, 'Attribute');
        const accessorDescriptor = staticClass._accessors.get(key);

        let value: any = undefined;

        // Check attributes first
        if (key in this.attributes) {
            value = this.attributes[key];
        } else if (this.relationshipsLoaded[key]) {
            value = this.relationshipsLoaded[key];
        }

        // Apply accessor if exists
        if (accessorDescriptor) {
            if (accessorDescriptor.async) {
                value = await accessorDescriptor.async(value, this);
            } else if (accessorDescriptor.sync) {
                value = accessorDescriptor.sync(value, this);
            }
        }
        // Fallback to instance method
        else if (typeof (this as any)[accessorKey] === 'function') {
            const result = (this as any)[accessorKey](value);
            if (result instanceof Promise) {
                value = await result;
            } else {
                value = result;
            }
        }

        // Cache the result
        if (value !== undefined) {
            this.__attributeCache.set(key, value);
        }

        return value as T;
    }

    /**
     * Get an attribute with accessor support (sync)
     * @param key Attribute name
     * @param onlyAppended If true, only return value if it's in appends array
     */
    getAttribute<T = any>(key: string, onlyAppended: boolean = false): T {
        // Check if we should only return appended attributes
        if (onlyAppended) {
            const staticClass = this.constructor as typeof Model;
            if (!staticClass.appends.includes(key)) {
                return undefined as T;
            }
        }

        // Prevent infinite recursion
        if (this.__isGettingAttribute) {
            return this.attributes[key];
        }

        // Check cache first
        if (this.__attributeCache.has(key)) {
            return this.__attributeCache.get(key);
        }

        this.__isGettingAttribute = true;

        try {
            // Check for accessor
            const staticClass = this.constructor as typeof Model;
            const accessorKey = (staticClass as any).buildMethodName('get', key, 'Attribute');
            const accessorDescriptor = staticClass._accessors.get(key);

            let value: any = undefined;

            // Check attributes first
            if (key in this.attributes) {
                value = this.attributes[key];
            } else if (this.relationshipsLoaded[key]) {
                value = this.relationshipsLoaded[key];
            }

            // Apply accessor if exists
            if (accessorDescriptor) {
                if (accessorDescriptor.sync) {
                    value = accessorDescriptor.sync(value, this);
                }
                // Note: async accessors not called in sync context
            }
            // Fallback to instance method
            else if (typeof (this as any)[accessorKey] === 'function') {
                value = (this as any)[accessorKey](value);
                // If it returns a Promise in sync context, warn and return undefined
                if (value instanceof Promise) {
                    console.warn(`Accessor ${accessorKey} returned a Promise in sync context. Use getAttributeAsync() instead.`);
                    return undefined as T;
                }
            }

            // Cache the result
            if (value !== undefined) {
                this.__attributeCache.set(key, value);
            }

            return value as T;
        } finally {
            this.__isGettingAttribute = false;
        }
    }

    /**
     * Create a context for accessors that allows direct field access
     */
    private createAccessorContext(): any {
        // Return a proxy that allows direct field access
        return new Proxy(this, {
            get: (target: any, prop: PropertyKey, receiver: any) => {
                if (typeof prop === 'string') {
                    // Special handling for 'this' keyword
                    if (prop === 'this') {
                        return target;
                    }

                    // Check for direct attribute access
                    if (prop in target.attributes) {
                        return target.attributes[prop];
                    }

                    // Check for relationship access
                    if (prop in target.relationshipsLoaded) {
                        return target.relationshipsLoaded[prop];
                    }

                    // Check for methods
                    if (prop in target && typeof target[prop] === 'function') {
                        return target[prop].bind(target);
                    }

                    // Check for other properties
                    if (prop in target) {
                        const val = target[prop];
                        return typeof val === 'function' ? val.bind(target) : val;
                    }
                }

                return Reflect.get(target, prop, receiver);
            },

            set: (target: any, prop: PropertyKey, value: any, receiver: any) => {
                // Prevent modification of attributes from within accessors
                if (typeof prop === 'string' && prop in target.attributes) {
                    throw new Error(`Cannot modify attribute '${prop}' from within an accessor`);
                }
                return Reflect.set(target, prop, value, receiver);
            }
        });
    }



    /**
     * Get attribute with accessor for proxy/getter
     */
    private getAttributeWithAccessor<T = any>(key: string, isAppended: boolean = false): T | undefined {
        const staticClass = this.constructor as typeof Model;
        const accessorKey = `get${key.charAt(0).toUpperCase() + key.slice(1)}Attribute`;
        const accessorDescriptor = staticClass._accessors.get(key);

        // Only handle accessors if they're appended or if we're accessing directly
        const shouldHandle = isAppended || accessorDescriptor?.sync || typeof (this as any)[accessorKey] === 'function';

        if (shouldHandle) {
            return this.getAttribute(key, isAppended);
        }

        return undefined;
    }
    /**
     * Set attribute with mutator support
     */
    setAttributeWithMutator(key: string, value: any): boolean {
        const staticClass = this.constructor as typeof Model;
        const mutatorKey = `set${key.charAt(0).toUpperCase() + key.slice(1)}Attribute`;
        const mutatorDescriptor = staticClass._mutators.get(key);

        let processedValue = value;

        // Apply mutator if exists
        if (mutatorDescriptor) {
            if (mutatorDescriptor.sync) {
                const mutatorThis = this.createAccessorContext();
                processedValue = mutatorDescriptor.sync(value, mutatorThis);
            }
        }
        // Fallback to instance method
        else if (typeof (this as any)[mutatorKey] === 'function') {
            const mutatorThis = this.createAccessorContext();
            processedValue = (this as any)[mutatorKey].call(mutatorThis, value);
        } else {
            // No mutator found
            return false;
        }

        // Clear cache for this attribute
        this.__attributeCache.delete(key);

        // Set the processed value
        this.setAttribute(key, processedValue);
        return true;
    }
    /**
     * Get all appended attributes with their values
     */
    async getAppendedAttributesAsync(): Promise<ModelAttributes> {
        const staticClass = this.constructor as typeof Model;
        const result: ModelAttributes = {};

        for (const key of staticClass.appends) {
            const value = await this.getAttributeAsync(key);
            if (value !== undefined) {
                result[key] = value;
            }
        }

        return result;
    }

    /**
     * Get all appended attributes with their values (sync)
     */
    getAppendedAttributes(): ModelAttributes {
        const staticClass = this.constructor as typeof Model;
        const result: ModelAttributes = {};

        for (const key of staticClass.appends) {
            const value = this.getAttribute(key);
            if (value !== undefined) {
                result[key] = value;
            }
        }

        return result;
    }

    // ====================
    // STATIC REGISTRATION METHODS
    // ====================

    /**
     * Register a synchronous accessor
     */
    static registerAccessor(key: string, fn: (value: any, instance: Model) => any): void {
        const descriptor = this._accessors.get(key) || { name: key };
        descriptor.sync = fn;
        this._accessors.set(key, descriptor);
    }

    /**
     * Register an asynchronous accessor
     */
    static registerAsyncAccessor(key: string, fn: (value: any, instance: Model) => Promise<any>): void {
        const descriptor = this._accessors.get(key) || { name: key };
        descriptor.async = fn;
        this._accessors.set(key, descriptor);
    }

    /**
     * Register a synchronous mutator
     */
    static registerMutator(key: string, fn: (value: any, instance: Model) => any): void {
        const descriptor = this._mutators.get(key) || { name: key };
        descriptor.sync = fn;
        this._mutators.set(key, descriptor);
    }

    /**
     * Register an asynchronous mutator
     */
    static registerAsyncMutator(key: string, fn: (value: any, instance: Model) => Promise<any>): void {
        const descriptor = this._mutators.get(key) || { name: key };
        descriptor.async = fn;
        this._mutators.set(key, descriptor);
    }

    /**
     * Add attributes to appends array
     */
    static addAppends(...attributes: string[]): void {
        this.appends = [...new Set([...this.appends, ...attributes])];
    }

    // ====================
    // HELPER METHODS FOR ACCESSORS
    // ====================

    /**
     * Get a field value (alias for this.field_name in accessors)
     */
    getField(fieldName: string): any {
        return this.attributes[fieldName];
    }

    /**
     * Get relationship count (for use in accessors)
     */
    async getRelationshipCount(relationshipName: string): Promise<number> {
        if (this.relationshipsLoaded[relationshipName]) {
            return Array.isArray(this.relationshipsLoaded[relationshipName])
                ? this.relationshipsLoaded[relationshipName].length
                : 1;
        }

        // Load relationship if not loaded
        const relation = this.getRelationship(relationshipName);
        if (!relation) return 0;

        switch (relation.type) {
            case 'hasOne':
            case 'belongsTo':
                const single = await this[relationshipName]?.().first();
                return single ? 1 : 0;

            case 'hasMany':
            case 'belongsToMany':
                const many = await this[relationshipName]?.().get();
                return Array.isArray(many) ? many.length : 0;

            default:
                return 0;
        }
    }

    /**
     * Get relationship query (for use in accessors)
     */
    getRelationshipQuery(relationshipName: string): any {
        const relation = this.getRelationship(relationshipName);
        if (!relation) return null;

        return this[relationshipName]?.();
    }

    // ====================
    // UPDATED toJSON METHOD
    // ====================

    async toJSONAsync(options: ToJSONOptions = {}): Promise<any> {
        const {
            maxDepth = 10,
            currentDepth = 0,
            visited = new WeakSet(),
            include = [],
            exclude = [],
            withRelations = true,
            relationTree = {},
            includeMetadata = false,
            withAccessors = true,
            onlyAppended = false,
        } = options;

        if (visited.has(this)) {
            return '[Circular]';
        }
        visited.add(this);

        if (currentDepth >= maxDepth) {
            return '[Max Depth Reached]';
        }

        const obj: any = {};

        if (onlyAppended) {
            // Only include appended attributes
            const staticClass = this.constructor as typeof Model;
            const appendedAttrs = await this.getAppendedAttributesAsync();

            for (const [key, value] of Object.entries(appendedAttrs)) {
                if (exclude.includes(key)) continue;
                obj[key] = value;
            }

            return obj;
        }

        // Build relationTree from include dot-paths and separate attribute includes
        const knownRelations = new Set<string>([
            ...Object.keys(this.relationshipsLoaded || {}),
            ...Object.keys(this.getAllRelationships() || {}),
        ]);
        const computedTree: Record<string, any> = { ...(relationTree || {}) };
        const directRelations = new Set<string>();
        const includeAttr: string[] = [];
        (include || []).forEach((path) => {
            if (!path) return;
            if (path.includes('.')) {
                const segments = path.split('.');
                const head = segments.shift() as string;
                directRelations.add(head);
                let cursor = (computedTree[head] = computedTree[head] || {});
                while (segments.length) {
                    const seg = segments.shift() as string;
                    cursor[seg] = cursor[seg] || {};
                    cursor = cursor[seg];
                }
            } else {
                if (knownRelations.has(path)) {
                    directRelations.add(path);
                } else {
                    includeAttr.push(path);
                }
            }
        });

        // Get base attributes (filtered by hidden)
        const baseAttributes = this.attributesToArray;

        // Apply attribute filters
        const filteredAttributes: ModelAttributes = {};
        Object.keys(baseAttributes).forEach((key) => {
            if ((includeAttr.length === 0 || includeAttr.includes(key)) &&
                !exclude.includes(key)) {
                filteredAttributes[key] = baseAttributes[key];
            }
        });

        // Add regular attributes
        for (const [key, value] of Object.entries(filteredAttributes)) {
            obj[key] = value;
        }

        // Add appended attributes if withAccessors is true
        if (withAccessors) {
            const staticClass = this.constructor as typeof Model;
            for (const key of staticClass.appends) {
                if (exclude.includes(key)) continue;
                if (includeAttr.length > 0 && !includeAttr.includes(key) && !directRelations.has(key)) continue;

                obj[key] = await this.getAttributeAsync(key);
            }
        }

        if (withRelations && Object.keys(this.relationshipsLoaded).length > 0) {
            await this.serializeRelationshipsAsync(obj, {
                maxDepth,
                currentDepth: currentDepth + 1,
                visited,
                include: Array.from(directRelations),
                exclude,
                withRelations,
                relationTree: computedTree,
                withAccessors,
                onlyAppended: false,
            });
        }

        if (withRelations) {
            const allRelations = this.getAllRelationships();
            for (const relName of Object.keys(allRelations)) {
                if (obj[relName] !== undefined) continue;

                if (directRelations.size > 0 || Object.keys(computedTree).length > 0) {
                    const allowed = directRelations.has(relName) || computedTree[relName] !== undefined;
                    if (!allowed) continue;
                }
                if (exclude.length > 0 && exclude.includes(relName)) continue;

                const relType = allRelations[relName].type;
                obj[relName] =
                    relType === 'hasOne' || relType === 'belongsTo' || relType === 'morphOne' ? null : [];
            }
        }

        if (includeMetadata) {
            this.addMetadata(obj);
        }

        return obj;
    }

    toJSON(options: ToJSONOptions & { relationTree?: Record<string, any> } = {}): any {
        const {
            maxDepth = 10,
            currentDepth = 0,
            visited = new WeakSet(),
            include = [],
            exclude = [],
            withRelations = true,
            relationTree = {},
            includeMetadata = false,
            withAccessors = true,
            onlyAppended = false,
        } = options;

        if (visited.has(this)) {
            return '[Circular]';
        }
        visited.add(this);

        if (currentDepth >= maxDepth) {
            return '[Max Depth Reached]';
        }

        const obj: any = {};

        if (onlyAppended) {
            // Only include appended attributes
            const staticClass = this.constructor as typeof Model;
            const appendedAttrs = this.getAppendedAttributes();

            for (const [key, value] of Object.entries(appendedAttrs)) {
                if (exclude.includes(key)) continue;
                obj[key] = value;
            }

            return obj;
        }

        // Build relationTree from include dot-paths and separate attribute includes
        const knownRelations = new Set<string>([
            ...Object.keys(this.relationshipsLoaded || {}),
            ...Object.keys(this.getAllRelationships() || {}),
        ]);
        const computedTree: Record<string, any> = { ...(relationTree || {}) };
        const directRelations = new Set<string>();
        const includeAttr: string[] = [];
        (include || []).forEach((path) => {
            if (!path) return;
            if (path.includes('.')) {
                const segments = path.split('.');
                const head = segments.shift() as string;
                directRelations.add(head);
                let cursor = (computedTree[head] = computedTree[head] || {});
                while (segments.length) {
                    const seg = segments.shift() as string;
                    cursor[seg] = cursor[seg] || {};
                    cursor = cursor[seg];
                }
            } else {
                if (knownRelations.has(path)) {
                    directRelations.add(path);
                } else {
                    includeAttr.push(path);
                }
            }
        });

        // Get base attributes (filtered by hidden)
        const baseAttributes = this.attributesToArray;

        // Apply attribute filters
        const filteredAttributes: ModelAttributes = {};
        Object.keys(baseAttributes).forEach((key) => {
            if ((includeAttr.length === 0 || includeAttr.includes(key)) &&
                !exclude.includes(key)) {
                filteredAttributes[key] = baseAttributes[key];
            }
        });

        // Add regular attributes
        for (const [key, value] of Object.entries(filteredAttributes)) {
            obj[key] = value;
        }

        // Add appended attributes if withAccessors is true
        if (withAccessors) {
            const staticClass = this.constructor as typeof Model;
            for (const key of staticClass.appends) {
                if (exclude.includes(key)) continue;
                if (includeAttr.length > 0 && !includeAttr.includes(key) && !directRelations.has(key)) continue;

                obj[key] = this.getAttribute(key);
            }
        }

        if (withRelations && Object.keys(this.relationshipsLoaded).length > 0) {
            this.serializeRelationships(obj, {
                maxDepth,
                currentDepth: currentDepth + 1,
                visited,
                include: Array.from(directRelations),
                exclude,
                withRelations,
                relationTree: computedTree,
                withAccessors,
                onlyAppended: false,
            });
        }

        if (withRelations) {
            const allRelations = this.getAllRelationships();
            Object.keys(allRelations).forEach((relName) => {
                if (obj[relName] !== undefined) return;

                if (directRelations.size > 0 || Object.keys(computedTree).length > 0) {
                    const allowed = directRelations.has(relName) || computedTree[relName] !== undefined;
                    if (!allowed) return;
                }
                if (exclude.length > 0 && exclude.includes(relName)) return;

                const relType = allRelations[relName].type;
                obj[relName] =
                    relType === 'hasOne' || relType === 'belongsTo' || relType === 'morphOne' ? null : [];
            });
        }

        if (includeMetadata) {
            this.addMetadata(obj);
        }

        return obj;
    }

    /**
     * Get attributes for array conversion (excludes hidden fields)
     */
    get attributesToArray(): ModelAttributes {
        const staticClass = this.constructor as typeof Model;
        const result: ModelAttributes = {};
        Object.keys(this.attributes).forEach((key) => {
            if (!staticClass.hidden.includes(key)) {
                result[key] = this.attributes[key];
            }
        });
        return result;
    }

    /**
     * Get all attributes including appended ones
     */
    getAttributesWithAppends(): ModelAttributes {
        const base = this.attributesToArray;
        const appended = this.getAppendedAttributes();
        return { ...base, ...appended };
    }

    /**
     * Get all attributes including appended ones (async)
     */
    async getAttributesWithAppendsAsync(): Promise<ModelAttributes> {
        const base = this.attributesToArray;
        const appended = await this.getAppendedAttributesAsync();
        return { ...base, ...appended };
    }

    private async serializeRelationshipsAsync(
        obj: any,
        options: ToJSONOptions & { relationTree?: Record<string, any> },
    ): Promise<void> {
        const directSet = new Set<string>(options.include || []);

        for (const rel of Object.keys(this.relationshipsLoaded)) {
            if (options.exclude?.includes(rel)) continue;

            const hasFilter =
                (options.include && options.include.length > 0) ||
                (options.relationTree && Object.keys(options.relationTree).length > 0);
            if (
                hasFilter &&
                !directSet.has(rel) &&
                !(options.relationTree && options.relationTree[rel] !== undefined)
            ) {
                continue;
            }

            const val = this.relationshipsLoaded[rel];
            const nestedTree = (options.relationTree && options.relationTree[rel]) || {};

            if (Array.isArray(val)) {
                obj[rel] = [];
                for (const v of val) {
                    if (!v || typeof v.toJSONAsync !== 'function') {
                        obj[rel].push(v);
                        continue;
                    }
                    const relationOptions = this.getRelationSerializationOptions(rel, options);
                    relationOptions.relationTree = nestedTree;
                    relationOptions.include = Object.keys(nestedTree || {});
                    relationOptions.currentDepth = (options.currentDepth || 0) + 1;
                    const json = await v.toJSONAsync(relationOptions);
                    if (json !== undefined) {
                        obj[rel].push(json);
                    }
                }
            } else if (val && typeof val.toJSONAsync === 'function') {
                const relationOptions = this.getRelationSerializationOptions(rel, options);
                relationOptions.relationTree = nestedTree;
                relationOptions.include = Object.keys(nestedTree || {});
                relationOptions.currentDepth = (options.currentDepth || 0) + 1;
                obj[rel] = await val.toJSONAsync(relationOptions);
            } else if (val !== undefined && val !== null) {
                obj[rel] = val;
            }
        }
    }

    private serializeRelationships(
        obj: any,
        options: ToJSONOptions & { relationTree?: Record<string, any> },
    ): void {
        const directSet = new Set<string>(options.include || []);

        Object.keys(this.relationshipsLoaded).forEach((rel) => {
            if (options.exclude?.includes(rel)) return;

            const hasFilter =
                (options.include && options.include.length > 0) ||
                (options.relationTree && Object.keys(options.relationTree).length > 0);
            if (
                hasFilter &&
                !directSet.has(rel) &&
                !(options.relationTree && options.relationTree[rel] !== undefined)
            ) {
                return;
            }

            const val = this.relationshipsLoaded[rel];
            const nestedTree = (options.relationTree && options.relationTree[rel]) || {};

            if (Array.isArray(val)) {
                obj[rel] = val
                    .map((v) => {
                        if (!v || typeof v.toJSON !== 'function') return v;
                        const relationOptions = this.getRelationSerializationOptions(rel, options);
                        relationOptions.relationTree = nestedTree;
                        relationOptions.include = Object.keys(nestedTree || {});
                        relationOptions.currentDepth = (options.currentDepth || 0) + 1;
                        return v.toJSON(relationOptions);
                    })
                    .filter((v) => v !== undefined);
            } else if (val && typeof val.toJSON === 'function') {
                const relationOptions = this.getRelationSerializationOptions(rel, options);
                relationOptions.relationTree = nestedTree;
                relationOptions.include = Object.keys(nestedTree || {});
                relationOptions.currentDepth = (options.currentDepth || 0) + 1;
                obj[rel] = val.toJSON(relationOptions);
            } else if (val !== undefined && val !== null) {
                obj[rel] = val;
            }
        });
    }

    // Clear attribute cache when attributes change
    setAttribute(key: string, value: any): void {
        const staticClass = this.constructor as typeof Model;
        if (staticClass.casts[key]) {
            value = this.castAttribute(key, value);
        }
        this.attributes[key] = value;
        this.__attributeCache.delete(key); // Clear cache for this attribute
    }

    // Clear entire cache when hydrating
    hydrate(attributes: ModelAttributes): this {
        Object.keys(attributes).forEach((key) => {
            this.setAttribute(key, attributes[key]);
        });
        this.original = { ...this.attributes };
        this.__exists = true;
        this.__attributeCache.clear(); // Clear entire cache
        return this;
    }

    fill(attributes: ModelAttributes): this {
        const staticClass = this.constructor as typeof Model;
        Object.keys(attributes).forEach((key) => {
            if (staticClass.fillable.length === 0 || staticClass.fillable.includes(key)) {
                if (!staticClass.guarded.includes(key)) {
                    this.setAttribute(key, attributes[key]);
                }
            }
        });
        return this;
    }
    // Add this getter to access the table name
    // protected get table(): string {
    //     return (this.constructor as typeof Model).getTable();
    // }
    getAttributes(): ModelAttributes {
        return { ...this.attributes };
    }

    getOriginal(key?: string): any {
        if (key) {
            return this.original[key];
        }
        return { ...this.original };
    }

    isDirty(key?: string): boolean {
        if (key) {
            return this.attributes[key] !== this.original[key];
        }
        return JSON.stringify(this.attributes) !== JSON.stringify(this.original);
    }

    getDirty(): ModelAttributes {
        const dirty: ModelAttributes = {};
        Object.keys(this.attributes).forEach((key) => {
            if (this.attributes[key] !== this.original[key]) {
                dirty[key] = this.attributes[key];
            }
        });
        return dirty;
    }

    syncOriginal(): this {
        this.original = { ...this.attributes };
        return this;
    }

    /**
     * Get relationship configuration for a given relation name
     * Supports both static relationships and instance method relationships
     */
    protected getRelationship(relation: string): RelationshipConfig | null {
        const staticClass = this.constructor as typeof Model;

        // First check static relationships
        if (staticClass.relationships && staticClass.relationships[relation]) {
            return staticClass.relationships[relation];
        }

        // Then check if there's an instance method for this relationship
        if (typeof (this as any)[relation] === 'function') {
            try {
                const relationInstance = (this as any)[relation]();
                return this.convertRelationToConfig(relationInstance, relation);
            } catch (error) {
                console.warn(`Failed to get relationship "${relation}" from instance method:`, error);
                return null;
            }
        }

        return null;
    }

    /**
     * Convert a relation instance to a RelationshipConfig
     */
    private convertRelationToConfig(
        relationInstance: any,
        relationName: string,
    ): RelationshipConfig | null {
        if (relationInstance instanceof HasOne) {
            return {
                type: 'hasOne',
                model: (relationInstance as any).relatedModel,
                foreignKey: (relationInstance as any).foreignKey,
                localKey: (relationInstance as any).localKey,
            };
        } else if (relationInstance instanceof HasMany) {
            return {
                type: 'hasMany',
                model: (relationInstance as any).relatedModel,
                foreignKey: (relationInstance as any).foreignKey,
                localKey: (relationInstance as any).localKey,
            };
        } else if (relationInstance instanceof BelongsTo) {
            return {
                type: 'belongsTo',
                model: (relationInstance as any).relatedModel,
                foreignKey: (relationInstance as any).foreignKey,
                ownerKey: (relationInstance as any).ownerKey,
            };
        } else if (relationInstance instanceof BelongsToMany) {
            return {
                type: 'belongsToMany',
                model: (relationInstance as any).relatedModel,
                table: (relationInstance as any).pivotTable,
                foreignKey: (relationInstance as any).foreignPivotKey,
                relatedKey: (relationInstance as any).relatedPivotKey,
            };
        }

        return null;
    }

    /**
     * Get all defined relationships (both static and instance)
     */
    protected getAllRelationships(): { [key: string]: RelationshipConfig } {
        const staticClass = this.constructor as typeof Model;
        const allRelations: { [key: string]: RelationshipConfig } = {};

        // Add static relationships
        if (staticClass.relationships) {
            Object.assign(allRelations, staticClass.relationships);
        }

        // Add instance method relationships
        const instanceMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(this)).filter(
            (prop) => typeof (this as any)[prop] === 'function' && prop !== 'constructor',
        );

        for (const methodName of instanceMethods) {
            // Skip if already defined in static relationships
            if (allRelations[methodName]) continue;

            try {
                const relationInstance = (this as any)[methodName]();
                const config = this.convertRelationToConfig(relationInstance, methodName);
                if (config) {
                    allRelations[methodName] = config;
                }
            } catch (error) {
                // Ignore methods that don't return valid relationship instances
            }
        }

        return allRelations;
    }

    // Update the toJSON method to use getAllRelationships for fallback

    // Update the getRelationSerializationOptions to use getRelationship
    private getRelationSerializationOptions(
        relationName: string,
        parentOptions: ToJSONOptions,
    ): ToJSONOptions {
        const relationConfig = this.getRelationship(relationName);

        // Default options - continue with same settings but increment depth
        const baseOptions: ToJSONOptions = {
            maxDepth: parentOptions.maxDepth,
            currentDepth: parentOptions.currentDepth,
            visited: parentOptions.visited,
            withRelations: parentOptions.withRelations,
            includeMetadata: parentOptions.includeMetadata,
        };

        // Check if there are relationship-specific serialization rules
        if (relationConfig && (relationConfig as any).serialization) {
            const serializationConfig = (relationConfig as any).serialization;

            if (serializationConfig.include) {
                baseOptions.include = serializationConfig.include;
            }

            if (serializationConfig.exclude) {
                baseOptions.exclude = serializationConfig.exclude;
            }

            if (serializationConfig.maxDepth !== undefined) {
                baseOptions.maxDepth = serializationConfig.maxDepth;
            }

            if (serializationConfig.withRelations !== undefined) {
                baseOptions.withRelations = serializationConfig.withRelations;
            }
        }

        return baseOptions;
    }

    private applyAttributeFilters(obj: any, include: string[], exclude: string[]): void {
        if (include.length > 0) {
            // Only include specified attributes
            Object.keys(obj).forEach((key) => {
                if (!include.includes(key)) {
                    delete obj[key];
                }
            });
        } else if (exclude.length > 0) {
            // Exclude specified attributes
            exclude.forEach((key) => {
                delete obj[key];
            });
        }
    }

    private addMetadata(obj: any): void {
        const staticClass = this.constructor as typeof Model;

        obj.$metadata = {
            model: staticClass.name,
            table: staticClass.getTable(),
            primaryKey: staticClass.primaryKey,
            timestamps: staticClass.timestamps,
            softDeletes: staticClass.softDeletes,
            loadedRelations: Object.keys(this.relationshipsLoaded),
            isDirty: this.isDirty(),
            exists: this.getAttribute(staticClass.primaryKey) !== undefined,
        };
    }

    public setLoadedRelation(name: string, value: any): void {
        this.relationshipsLoaded[name] = value;
    }

    public unsetRelation(name: string): void {
        delete this.relationshipsLoaded[name];
    }

    public relationLoaded(name: string): boolean {
        return name in this.relationshipsLoaded;
    }

    // Enhanced relationship methods with chaining support
    hasOne(model: typeof Model, foreignKey?: string, localKey?: string): HasOne<any> {
        const table = (this.constructor as typeof Model).getTable();
        const fk = foreignKey || `${table}_id`;
        const lk = localKey || (this.constructor as any).primaryKey || 'id';
        return new HasOne(model, fk, lk, this);
    }

    hasMany(model: typeof Model, foreignKey?: string, localKey?: string): HasMany<any> {
        const table = (this.constructor as typeof Model).getTable();
        const fk = foreignKey || `${table}_id`;
        const lk = localKey || (this.constructor as any).primaryKey || 'id';
        return new HasMany(model, fk, lk, this);
    }

    belongsTo(model: typeof Model, foreignKey?: string, ownerKey?: string): BelongsTo<any> {
        const relatedTable = (model as typeof Model).getTable();
        const fk = foreignKey || `${relatedTable}_id`;
        const ok = ownerKey || (model as any).primaryKey || 'id';
        return new BelongsTo(model, fk, ok, this);
    }

    belongsToMany(
        model: typeof Model,
        table?: string,
        foreignPivotKey?: string,
        relatedPivotKey?: string,
    ): BelongsToMany<any> {
        const parentTable = (this.constructor as typeof Model).getTable();
        const relatedTable = (model as typeof Model).getTable();
        const pivotTable = table || [parentTable, relatedTable].sort().join('_');
        const foreignKey = foreignPivotKey || `${parentTable}_id`;
        const relatedKey = relatedPivotKey || `${relatedTable}_id`;
        const parentPrimaryKey = (this.constructor as any).primaryKey || 'id';
        const relatedPrimaryKey = (model as any).primaryKey || 'id';
        return new BelongsToMany(
            model,
            pivotTable,
            foreignKey,
            relatedKey,
            parentPrimaryKey,
            relatedPrimaryKey,
            this,
        );
    }

    morphOne(model: typeof Model, name: string): HasOne<any> {
        const morphType = `${name}_type`;
        const morphId = `${name}_id`;
        return this.hasOne(model, morphId).where(morphType, this.constructor.name);
    }

    morphMany(model: typeof Model, name: string): HasMany<any> {
        const morphType = `${name}_type`;
        const morphId = `${name}_id`;
        return this.hasMany(model, morphId).where(morphType, this.constructor.name);
    }

    morphTo(name: string): BelongsTo<any> {
        const morphType = `${name}_type`;
        const morphId = `${name}_id`;
        const type = this.getAttribute(morphType);
        const id = this.getAttribute(morphId);

        if (!type || !id) {
            return new BelongsTo(Model, morphId, id, this); // Return base model if no type/id
        }

        // You would need to maintain a mapping of model names to constructors
        const modelConstructor = (this.constructor as any).morphMap?.[type] || Model;
        return this.belongsTo(modelConstructor, morphId);
    }

    // Enhanced persistence methods
    async save(options: { force?: boolean } = {}): Promise<this> {
        const staticClass = this.constructor as typeof Model & {
            table: string;
            primaryKey: string;
            timestamps?: boolean;
            autoIncrement?: boolean;
        };
        const table = staticClass.getTable();
        const primaryKey = staticClass.primaryKey || 'id';
        const now = new Date();

        if ((staticClass as any).timestamps) {
            if (!this.getAttribute('created_at')) {
                this.setAttribute('created_at', now);
            }
            this.setAttribute('updated_at', now);
        }

        const attrs = { ...this.attributes } as any;
        const id = attrs[primaryKey];
        const exists = this.__exists; // whether record already persisted
        const isMongo = getDbType() === 'mongodb';

        // Decide insert vs update
        const doInsert =
            !exists || options.force || (id === undefined && (staticClass as any).autoIncrement);

        if (isMongo) {
            const c = mongoCollection(table);
            // Helper: normalize any foreign key fields to ObjectId if possible, else string
            const normalizeForeignIds = (obj: Record<string, any>) => {
                Object.keys(obj).forEach((k) => {
                    if (!k || !k.endsWith('_id')) return;
                    const v = obj[k];
                    if (v === undefined || v === null) return;
                    try {
                        if (v instanceof ObjectId) {
                            obj[k] = v;
                            return;
                        }
                        const str = String(v);
                        if (/^[0-9a-fA-F]{24}$/.test(str)) {
                            obj[k] = new ObjectId(str);
                        } else {
                            obj[k] = str;
                        }
                    } catch {
                        obj[k] = String(v);
                    }
                });
            };

            if (doInsert) {
                const doc: any = { ...attrs };
                if (primaryKey === 'id') {
                    if (doc.id) {
                        try {
                            doc._id = new ObjectId(String(doc.id));
                        } catch {
                            doc._id = doc.id;
                        }
                        delete doc.id;
                    }
                }
                // Normalize FK fields for Mongo
                normalizeForeignIds(doc);
                const res = await c.insertOne(doc);
                if (primaryKey === 'id') this.setAttribute('id', String(res.insertedId));
                this.__exists = true;
            } else {
                const dirty = this.getDirty();
                const setDoc: any = {};
                Object.keys(dirty).forEach((k) => {
                    if (k === primaryKey && primaryKey === 'id') return;
                    setDoc[k] = dirty[k];
                });
                if (Object.keys(setDoc).length) {
                    // Normalize FK fields for Mongo
                    normalizeForeignIds(setDoc);
                    const filter: any =
                        primaryKey === 'id' ? { _id: new ObjectId(String(id)) } : { [primaryKey]: id };
                    await c.updateOne(filter, { $set: setDoc });
                }
            }
            this.original = { ...this.attributes };
            return this;
        }

        // Helper to normalize SQL params (avoid array/object expansion by driver)
        const normalizeSqlParam = (val: any) => {
            if (val === undefined) return undefined as any;
            if (val === null) return null as any;
            // Keep Date, Buffer, and ObjectId as-is
            if (val instanceof Date || Buffer.isBuffer(val)) return val;
            try {
                // Lazy import to avoid direct dependency
                const maybeObjId =
                    (val as any)?._bsontype === 'ObjectID' ||
                    (typeof ObjectId !== 'undefined' && val instanceof ObjectId);
                if (maybeObjId) return String(val);
            } catch {}
            const t = typeof val;
            if (t === 'object') {
                // JSON stringify plain objects/arrays/maps/sets
                try {
                    return JSON.stringify(val);
                } catch {
                    return String(val);
                }
            }
            return val;
        };

        if (doInsert) {
            // INSERT path
            const insertCols = Object.keys(attrs).filter(
                (k) => attrs[k] !== undefined && (k !== primaryKey || !(staticClass as any).autoIncrement),
            );
            const placeholders = insertCols.map(() => '?').join(',');
            const sql = `INSERT INTO ${table} (${insertCols.join(',')}) VALUES (${placeholders})`;
            const params = insertCols.map((c) => normalizeSqlParam(attrs[c]));
            const result: any = await dbQuery<any>(sql, params);
            if ((staticClass as any).autoIncrement && result && result.insertId !== undefined) {
                this.setAttribute(primaryKey, result.insertId);
            }
            this.__exists = true;
        } else {
            // UPDATE path
            const dirty = this.getDirty();
            const setCols = Object.keys(dirty).filter((k) => k !== primaryKey);
            if (setCols.length) {
                const setSql = setCols.map((c) => `${c} = ?`).join(', ');
                const sql = `UPDATE ${table} SET ${setSql} WHERE ${primaryKey} = ?`;
                const params = [...setCols.map((c) => normalizeSqlParam(dirty[c])), id];
                await dbQuery<any>(sql, params);
            }
        }

        this.original = { ...this.attributes };
        return this;
    }

    async update(attributes: ModelAttributes): Promise<this> {
        this.fill(attributes);
        return this.save();
    }

    async delete(force: boolean = false): Promise<boolean> {
        const staticClass = this.constructor as typeof Model & {
            table: string;
            primaryKey: string;
            softDeletes?: boolean;
        };
        const table = staticClass.getTable();
        const primaryKey = staticClass.primaryKey || 'id';
        const id = this.getAttribute(primaryKey);
        if (id === undefined || id === null) return false;

        if (getDbType() === 'mongodb') {
            const c = mongoCollection(table);
            if ((staticClass as any).softDeletes && !force) {
                await c.updateOne(
                    primaryKey === 'id' ? { _id: new ObjectId(String(id)) } : { [primaryKey]: id },
                    { $set: { deleted_at: new Date() } },
                );
                this.setAttribute('deleted_at', new Date());
                return true;
            } else {
                await c.deleteOne(
                    primaryKey === 'id' ? { _id: new ObjectId(String(id)) } : { [primaryKey]: id },
                );
                return true;
            }
        }

        if ((staticClass as any).softDeletes && !force) {
            const now = new Date();
            this.setAttribute('deleted_at', now);
            const sql = `UPDATE ${table} SET deleted_at = ? WHERE ${primaryKey} = ?`;
            await dbQuery<any>(sql, [now, id]);
            return true;
        } else {
            const sql = `DELETE FROM ${table} WHERE ${primaryKey} = ?`;
            await dbQuery<any>(sql, [id]);
            return true;
        }
    }

    async restore(): Promise<boolean> {
        const staticClass = this.constructor as typeof Model & {
            table: string;
            primaryKey: string;
            softDeletes?: boolean;
        };
        if (!(staticClass as any).softDeletes) return false;

        const table = staticClass.getTable();
        const primaryKey = staticClass.primaryKey || 'id';
        const id = this.getAttribute(primaryKey);
        if (id === undefined || id === null) return false;

        this.setAttribute('deleted_at', null);

        if (getDbType() === 'mongodb') {
            const c = mongoCollection(table);
            await c.updateOne(
                primaryKey === 'id' ? { _id: new ObjectId(String(id)) } : { [primaryKey]: id },
                { $set: { deleted_at: null } },
            );
            return true;
        }

        const sql = `UPDATE ${table} SET deleted_at = NULL WHERE ${primaryKey} = ?`;
        await dbQuery<any>(sql, [id]);
        return true;
    }

    async forceDelete(): Promise<boolean> {
        return this.delete(true);
    }

    async refresh(): Promise<this> {
        const staticClass = this.constructor as typeof Model;
        const primaryKey = staticClass.primaryKey || 'id';
        const id = this.getAttribute(primaryKey);

        if (id === undefined || id === null) return this;

        const fresh = await (staticClass as any).find(id);
        if (fresh) {
            this.attributes = { ...(fresh as any).attributes };
            this.original = { ...this.attributes };
        }

        return this;
    }

    replicate(except: string[] = []): this {
        const staticClass = this.constructor as typeof Model;
        const replicated = new (staticClass as any)();
        const attributes = { ...this.attributes };

        // Remove primary key and excluded attributes
        delete attributes[staticClass.primaryKey || 'id'];
        except.forEach((attr) => delete attributes[attr]);

        replicated.fill(attributes);
        return replicated;
    }

    // Static methods
    static async create<M extends typeof Model>(
        this: M,
        attributes: ModelAttributes,
    ): Promise<InstanceType<M>> {
        const instance = new (this as any)(attributes) as InstanceType<M>;
        await (instance as any).save();
        return instance;
    }

    static async createMany<M extends typeof Model>(
        this: M,
        rows: Array<ModelAttributes>,
    ): Promise<InstanceType<M>[]> {
        const created: InstanceType<M>[] = [];
        for (const row of rows) {
            created.push(await this.create(row));
        }
        return created;
    }

    static query<M extends typeof Model>(this: M): EloquentBuilder<InstanceType<M>> {
        return new EloquentBuilder<InstanceType<M>>(this as any);
    }

    static with<M extends typeof Model>(
        this: M,
        relationships: string[],
    ): EloquentBuilder<InstanceType<M>> {
        return this.query<M>().with(relationships) as EloquentBuilder<InstanceType<M>>;
    }

    static withTrashed<M extends typeof Model>(this: M): EloquentBuilder<InstanceType<M>> {
        return this.query<M>().withTrashed();
    }

    // Alias accommodating typo 'withThrashed'
    static withThrashed<M extends typeof Model>(this: M): EloquentBuilder<InstanceType<M>> {
        return this.withTrashed<M>();
    }

    static withoutTrashed<M extends typeof Model>(this: M): EloquentBuilder<InstanceType<M>> {
        return this.query<M>().withoutTrashed();
    }

    // Alias accommodating typo 'withoutThrashed'
    static withoutThrashed<M extends typeof Model>(this: M): EloquentBuilder<InstanceType<M>> {
        return this.withoutTrashed<M>();
    }

    static onlyTrashed<M extends typeof Model>(this: M): EloquentBuilder<InstanceType<M>> {
        return this.query<M>().onlyTrashed();
    }

    static onlyThrashed<M extends typeof Model>(this: M): EloquentBuilder<InstanceType<M>> {
        return this.onlyTrashed<M>();
    }

    static where<M extends typeof Model>(
        this: M,
        column: string,
        operator: any,
        value?: any,
    ): EloquentBuilder<InstanceType<M>> {
        return this.query<M>().where(column, operator, value) as EloquentBuilder<InstanceType<M>>;
    }

    static find<M extends typeof Model>(
        this: M,
        id: number | string,
    ): Promise<InstanceType<M> | null> {
        return this.query<M>()
            .where((this as any).primaryKey, id)
            .first() as Promise<InstanceType<M> | null>;
    }

    static async findOrFail<M extends typeof Model>(
        this: M,
        id: number | string,
    ): Promise<InstanceType<M>> {
        const found = await this.find(id);
        if (!found) throw new Error(`${(this as any).name || 'Model'} not found`);
        return found as InstanceType<M>;
    }

    static all<M extends typeof Model>(this: M): Promise<InstanceType<M>[]> {
        return this.query<M>().get() as Promise<InstanceType<M>[]>;
    }

    static first<M extends typeof Model>(this: M): Promise<InstanceType<M> | null> {
        return this.query<M>().first() as Promise<InstanceType<M> | null>;
    }

    // Static table name resolution
    static getTable(): string {
        // If table name is explicitly set, use it
        if (this.table && this.table !== '') {
            return this.table;
        }

        // Generate table name from class name
        let tableName = this.name;

        // Convert PascalCase to snake_case
        tableName = tableName
            .replace(/([A-Z])/g, '_$1')
            .toLowerCase()
            .replace(/^_/, '');

        // Pluralize
        tableName = this.pluralize(tableName);

        return tableName;
    }

    // Utility methods
    private castAttribute(key: string, value: any): any {
        const staticClass = this.constructor as typeof Model;
        const castType = staticClass.casts[key];
        if (typeof castType === 'function') {
            return castType(value);
        }
        switch (castType) {
            case 'int':
            case 'integer':
                return parseInt(value, 10);
            case 'real':
            case 'float':
            case 'double':
                return parseFloat(value);
            case 'string':
                return String(value);
            case 'bool':
            case 'boolean':
                return Boolean(value);
            case 'object':
            case 'array':
                return JSON.parse(value);
            case 'json':
                return typeof value === 'string' ? JSON.parse(value) : value;
            case 'date':
            case 'datetime':
                return new Date(value);
            case 'timestamp':
                return new Date(value).getTime();
            case 'collection':
                return new Map(Object.entries(value));
            default:
                return value;
        }
    }

    protected getPrimaryKey(): string {
        return (this.constructor as typeof Model).primaryKey;
    }

    // Static pluralization method
    private static pluralize(word: string): string {
        // Comprehensive irregular plurals
        const irregularPlurals: Record<string, string> = {
            // Common irregulars
            person: 'people',
            man: 'men',
            woman: 'women',
            child: 'children',
            foot: 'feet',
            tooth: 'teeth',
            goose: 'geese',
            mouse: 'mice',
            louse: 'lice',
            ox: 'oxen',
            die: 'dice',
            penny: 'pence',

            // Latin/Greek plurals
            appendix: 'appendices',
            index: 'indices',
            matrix: 'matrices',
            vertex: 'vertices',
            crisis: 'crises',
            analysis: 'analyses',
            thesis: 'theses',
            criterion: 'criteria',
            phenomenon: 'phenomena',
            datum: 'data',
            medium: 'media',
            bacterium: 'bacteria',
            curriculum: 'curricula',
            stimulus: 'stimuli',
            alumnus: 'alumni',
            focus: 'foci',
            nucleus: 'nuclei',
            syllabus: 'syllabi',
            fungus: 'fungi',
            cactus: 'cacti',

            // Unchanging plurals
            sheep: 'sheep',
            deer: 'deer',
            fish: 'fish',
            species: 'species',
            aircraft: 'aircraft',
            series: 'series',
            means: 'means',
        };

        // Uncountable nouns (stay the same)
        const uncountable = new Set([
            'equipment',
            'information',
            'rice',
            'money',
            'species',
            'series',
            'fish',
            'sheep',
            'deer',
            'aircraft',
            'news',
            'education',
        ]);

        const lowerWord = word.toLowerCase();

        // Check for uncountable nouns
        if (uncountable.has(lowerWord)) {
            return word;
        }

        // Check for irregular plurals
        if (irregularPlurals[lowerWord]) {
            // Preserve case
            if (word === word.toUpperCase()) {
                return irregularPlurals[lowerWord].toUpperCase();
            } else if (word[0] === word[0].toUpperCase()) {
                return (
                    irregularPlurals[lowerWord].charAt(0).toUpperCase() + irregularPlurals[lowerWord].slice(1)
                );
            }
            return irregularPlurals[lowerWord];
        }

        // Pluralization rules in order of specificity
        const pluralRules = [
            // Words ending in -is (Greek origin)
            [/^(.*)is$/i, '$1es'],
            // Words ending in -us (Latin origin)
            [/^(.*)us$/i, '$1i'],
            // Words ending in -on (Greek origin)
            [/^(.*)on$/i, '$1a'],
            // Words ending in -s, -x, -z, -ch, -sh
            [/^(.*)(s|sh?|ch|z|x)$/i, '$1$2es'],
            // Words ending in -f or -fe
            [/^(.*[aeiou]?)f$/i, '$1ves'],
            [/^(.*)fe$/i, '$1ves'],
            // Words ending in -y
            [/^(.*[^aeiou])y$/i, '$1ies'],
            // Words ending in -o
            [/^(.*[^aeiou])o$/i, '$1oes'],
            // Default rule
            [/^(.*)$/i, '$1s'],
        ];

        // Apply rules
        for (const [rule, replacement] of pluralRules) {
            if ((rule as RegExp).test(word)) {
                const plural = word.replace(rule as RegExp, replacement as string);

                // Special case: don't pluralize if it's already plural-looking
                if (this.looksPlural(plural)) {
                    return plural;
                }
                break;
            }
        }

        // Fallback
        return word + 's';
    }

    private static looksPlural(word: string): boolean {
        const pluralEndings = ['s', 'es', 'ies', 'ves', 'i', 'a', 'en'];
        return pluralEndings.some((ending) => word.toLowerCase().endsWith(ending));
    }

    [util.inspect.custom](depth: number, options: any) {
        // Return fully expanded JSON representation for console.log/dir
        return this.toJSON();
    }

    public async load(relations: string[] | string): Promise<this> {
        const staticClass = this.constructor as typeof Model;

        const fresh = await staticClass
            .query()
            .with(relations)
            .where(this.primaryKey, this.getAttributes()[this.primaryKey])
            .first();

        if (fresh) {
            this.hydrate({...fresh.attributes, ...fresh.relationshipsLoaded});
        }

        return this;
    }

    public async loadMissing(relations: string[] | string): Promise<this> {
        const names = Array.isArray(relations) ? relations : [relations];
        const toLoad = names.filter((n) => !this.relationLoaded(n));
        return this.load(toLoad);
    }

    /**
     * Structured changes report comparing current attributes to original snapshot
     */
    public changes(): {
        before: ModelAttributes;
        after: ModelAttributes;
        keys: string[];
        count: number;
    } {
        const before = this.getOriginal();
        const after = this.getAttributes();
        const keys: string[] = [];
        Object.keys(after).forEach((k) => {
            if (after[k] !== before[k]) keys.push(k);
        });
        return { before, after, keys, count: keys.length };
    }
}
