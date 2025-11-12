// Model.ts
import { ModelAttributes, RelationshipConfig, Casts } from './types';
import { EloquentBuilder } from './EloquentBuilder';
import { HasOne, HasMany, BelongsTo, BelongsToMany } from './relationships';
import { query as dbQuery } from '../config/db.config';

export abstract class Model {
    [key: string]: any;

    static table: string = '';
    static primaryKey: string = 'id';
    static fillable: string[] = [];
    static guarded: string[] = [];
    static hidden: string[] = [];
    static casts: Casts = {};
    static timestamps: boolean = true;
    static softDeletes: boolean = false;
    static relationships: { [key: string]: RelationshipConfig } = {};

    id?: number | string;
    created_at?: Date;
    updated_at?: Date;
    deleted_at?: Date | null;

    protected attributes: ModelAttributes = {};
    protected original: ModelAttributes = {};
    protected relationshipsLoaded: { [key: string]: any } = {};

    constructor(attributes: ModelAttributes = {}) {
        this.fill(attributes);
        this.original = { ...this.attributes };
        return new Proxy(this, {
            get: (target: any, prop: PropertyKey, receiver: any) => {
                if (typeof prop === 'string') {
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
                    const internalProps = new Set(['attributes', 'original', 'relationshipsLoaded']);
                    if (internalProps.has(prop)) {
                        (target as any)[prop] = value;
                        return true;
                    }
                    target.setAttribute(prop, value);
                    return true;
                }
                (target as any)[prop] = value;
                return true;
            }
        });
    }

    // Add this getter to access the table name
    // protected get table(): string {
    //     return (this.constructor as typeof Model).getTable();
    // }

    // Enhanced methods with additional features
    hydrate(attributes: ModelAttributes): this {
        Object.keys(attributes).forEach((key) => {
            this.setAttribute(key, attributes[key]);
        });
        this.original = { ...this.attributes };
        return this;
    }

    fill(attributes: ModelAttributes): this {
        const staticClass = this.constructor as typeof Model;
        Object.keys(attributes).forEach(key => {
            if (staticClass.fillable.length === 0 || staticClass.fillable.includes(key)) {
                if (!staticClass.guarded.includes(key)) {
                    this.setAttribute(key, attributes[key]);
                }
            }
        });
        return this;
    }

    setAttribute(key: string, value: any): void {
        const staticClass = this.constructor as typeof Model;
        if (staticClass.casts[key]) {
            value = this.castAttribute(key, value);
        }
        this.attributes[key] = value;
    }

    getAttribute<T = any>(key: string): T {
        if (key in this.attributes) {
            return this.attributes[key];
        }
        if (this.relationshipsLoaded[key]) {
            return this.relationshipsLoaded[key];
        }
        return undefined as T;
    }

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
        Object.keys(this.attributes).forEach(key => {
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

    get attributesToArray(): ModelAttributes {
        const staticClass = this.constructor as typeof Model;
        const result: ModelAttributes = {};
        Object.keys(this.attributes).forEach(key => {
            if (!staticClass.hidden.includes(key)) {
                result[key] = this.attributes[key];
            }
        });
        return result;
    }

    toJSON(): any {
        const obj: any = { ...this.attributesToArray };
        Object.keys(this.relationshipsLoaded).forEach(rel => {
            const val = this.relationshipsLoaded[rel];
            if (Array.isArray(val)) {
                obj[rel] = val.map(v => (v && typeof v.toJSON === 'function') ? v.toJSON() : v);
            } else if (val && typeof val.toJSON === 'function') {
                obj[rel] = val.toJSON();
            } else {
                obj[rel] = val;
            }
        });
        return obj;
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
        const lk = localKey || ((this.constructor as any).primaryKey || 'id');
        return new HasOne(model, fk, lk, this);
    }

    hasMany(model: typeof Model, foreignKey?: string, localKey?: string): HasMany<any> {
        const table = (this.constructor as typeof Model).getTable();
        const fk = foreignKey || `${table}_id`;
        const lk = localKey || ((this.constructor as any).primaryKey || 'id');
        return new HasMany(model, fk, lk, this);
    }

    belongsTo(model: typeof Model, foreignKey?: string, ownerKey?: string): BelongsTo<any> {
        const relatedTable = (model as typeof Model).getTable();
        const fk = foreignKey || `${relatedTable}_id`;
        const ok = ownerKey || ((model as any).primaryKey || 'id');
        return new BelongsTo(model, fk, ok, this);
    }

    belongsToMany(model: typeof Model, table?: string, foreignPivotKey?: string, relatedPivotKey?: string): BelongsToMany<any> {
        const parentTable = (this.constructor as typeof Model).getTable();
        const relatedTable = (model as typeof Model).getTable();
        const pivotTable = table || [parentTable, relatedTable].sort().join('_');
        const foreignKey = foreignPivotKey || `${parentTable}_id`;
        const relatedKey = relatedPivotKey || `${relatedTable}_id`;
        const parentPrimaryKey = (this.constructor as any).primaryKey || 'id';
        const relatedPrimaryKey = (model as any).primaryKey || 'id';
        return new BelongsToMany(model, pivotTable, foreignKey, relatedKey, parentPrimaryKey, relatedPrimaryKey, this);
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
            return new BelongsTo(Model, morphId,id, this); // Return base model if no type/id
        }

        // You would need to maintain a mapping of model names to constructors
        const modelConstructor = (this.constructor as any).morphMap?.[type] || Model;
        return this.belongsTo(modelConstructor, morphId);
    }

    // Enhanced persistence methods
    async save(options: { force?: boolean } = {}): Promise<this> {
        const staticClass = this.constructor as typeof Model & { table: string; primaryKey: string; timestamps?: boolean };
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

        if (id === undefined || id === null || options.force) {
            // INSERT or forced update
            const insertCols = Object.keys(attrs).filter(k => attrs[k] !== undefined && k !== primaryKey);
            const placeholders = insertCols.map(() => '?').join(',');
            const sql = `INSERT INTO ${table} (${insertCols.join(',')}) VALUES (${placeholders})`;
            const params = insertCols.map(c => attrs[c]);
            const result: any = await dbQuery<any>(sql, params);
            const insertId = result.insertId;
            if (insertId !== undefined) {
                this.setAttribute(primaryKey, insertId);
            }
        } else {
            // UPDATE
            const dirty = this.getDirty();
            const setCols = Object.keys(dirty).filter(k => k !== primaryKey);
            if (setCols.length) {
                const setSql = setCols.map(c => `${c} = ?`).join(', ');
                const sql = `UPDATE ${table} SET ${setSql} WHERE ${primaryKey} = ?`;
                const params = [...setCols.map(c => dirty[c]), id];
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
        const staticClass = this.constructor as typeof Model & { table: string; primaryKey: string; softDeletes?: boolean };
        const table = staticClass.getTable();
        const primaryKey = staticClass.primaryKey || 'id';
        const id = this.getAttribute(primaryKey);
        if (id === undefined || id === null) return false;

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
        const staticClass = this.constructor as typeof Model & { table: string; primaryKey: string; softDeletes?: boolean };
        if (!(staticClass as any).softDeletes) return false;

        const table = staticClass.getTable();
        const primaryKey = staticClass.primaryKey || 'id';
        const id = this.getAttribute(primaryKey);
        if (id === undefined || id === null) return false;

        this.setAttribute('deleted_at', null);
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
        except.forEach(attr => delete attributes[attr]);

        replicated.fill(attributes);
        return replicated;
    }

    // Static methods
    static async create<M extends typeof Model>(this: M, attributes: ModelAttributes): Promise<InstanceType<M>> {
        const instance = new (this as any)(attributes) as InstanceType<M>;
        await (instance as any).save();
        return instance;
    }

    static async createMany<M extends typeof Model>(this: M, rows: Array<ModelAttributes>): Promise<InstanceType<M>[]> {
        const created: InstanceType<M>[] = [];
        for (const row of rows) {
            created.push(await this.create(row));
        }
        return created;
    }

    static query<M extends typeof Model>(this: M): EloquentBuilder<InstanceType<M>> {
        return new EloquentBuilder<InstanceType<M>>(this as any);
    }

    static with<M extends typeof Model>(this: M, relationships: string[]): EloquentBuilder<InstanceType<M>> {
        return this.query<M>().with(relationships) as EloquentBuilder<InstanceType<M>>;
    }

    static where<M extends typeof Model>(this: M, column: string, operator: any, value?: any): EloquentBuilder<InstanceType<M>> {
        return this.query<M>().where(column, operator, value) as EloquentBuilder<InstanceType<M>>;
    }

    static find<M extends typeof Model>(this: M, id: number | string): Promise<InstanceType<M> | null> {
        return this.query<M>().where((this as any).primaryKey, id).first() as Promise<InstanceType<M> | null>;
    }

    static async findOrFail<M extends typeof Model>(this: M, id: number | string): Promise<InstanceType<M>> {
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
        if (this.table && this.table !== "") {
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
            'person': 'people', 'man': 'men', 'woman': 'women', 'child': 'children',
            'foot': 'feet', 'tooth': 'teeth', 'goose': 'geese', 'mouse': 'mice',
            'louse': 'lice', 'ox': 'oxen', 'die': 'dice', 'penny': 'pence',

            // Latin/Greek plurals
            'appendix': 'appendices', 'index': 'indices', 'matrix': 'matrices',
            'vertex': 'vertices', 'crisis': 'crises', 'analysis': 'analyses',
            'thesis': 'theses', 'criterion': 'criteria', 'phenomenon': 'phenomena',
            'datum': 'data', 'medium': 'media', 'bacterium': 'bacteria',
            'curriculum': 'curricula', 'stimulus': 'stimuli', 'alumnus': 'alumni',
            'focus': 'foci', 'nucleus': 'nuclei', 'syllabus': 'syllabi',
            'fungus': 'fungi', 'cactus': 'cacti',

            // Unchanging plurals
            'sheep': 'sheep', 'deer': 'deer', 'fish': 'fish', 'species': 'species',
            'aircraft': 'aircraft', 'series': 'series', 'means': 'means'
        };

        // Uncountable nouns (stay the same)
        const uncountable = new Set([
            'equipment', 'information', 'rice', 'money', 'species', 'series',
            'fish', 'sheep', 'deer', 'aircraft', 'news', 'education'
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
                return irregularPlurals[lowerWord].charAt(0).toUpperCase() +
                    irregularPlurals[lowerWord].slice(1);
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
            [/^(.*)$/i, '$1s']
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
        return pluralEndings.some(ending => word.toLowerCase().endsWith(ending));
    }
}