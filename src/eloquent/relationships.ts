// relationships.ts
import { Model } from './Model';
import { EloquentBuilder } from './EloquentBuilder';
import { query as dbQuery } from '@/config/db.config';

export abstract class Relation<T extends Model> {
    protected query: EloquentBuilder<T>;
    protected parent: Model;
    protected related: typeof Model;

    constructor(related: typeof Model, parent: Model) {
        this.related = related;
        this.parent = parent;
        this.query = new EloquentBuilder<T>(related as any);
    }

    abstract getResults(): Promise<T | T[] | null>;

    // Common relation methods
    where(column: string, operator?: any, value?: any): this {
        this.query.where(column, operator, value);
        return this;
    }

    orWhere(column: string, operator?: any, value?: any): this {
        this.query.orWhere(column, operator, value);
        return this;
    }

    whereIn(column: string, values: any[]): this {
        this.query.whereIn(column, values);
        return this;
    }

    whereNotIn(column: string, values: any[]): this {
        this.query.whereNotIn(column, values);
        return this;
    }

    whereNull(column: string): this {
        this.query.whereNull(column);
        return this;
    }

    whereNotNull(column: string): this {
        this.query.whereNotNull(column);
        return this;
    }

    orderBy(column: string, direction: 'asc' | 'desc' = 'asc'): this {
        this.query.orderBy(column, direction);
        return this;
    }

    latest(column: string = 'created_at'): this {
        this.query.latest(column);
        return this;
    }

    oldest(column: string = 'created_at'): this {
        this.query.oldest(column);
        return this;
    }

    limit(limit: number): this {
        this.query.limit(limit);
        return this;
    }

    offset(offset: number): this {
        this.query.offset(offset);
        return this;
    }

    with(relations: string | string[] | Record<string, any>): this {
        this.query.with(relations);
        return this;
    }

    select(columns: string[] | string): this {
        this.query.select(columns);
        return this;
    }

    async count(): Promise<number> {
        return this.query.count();
    }

    async exists(): Promise<boolean> {
        return this.query.exists();
    }

    async doesntExist(): Promise<boolean> {
        return this.query.doesntExist();
    }

    async first(): Promise<T | null> {
        return this.query.first();
    }

    getQuery(): EloquentBuilder<T> {
        return this.query;
    }
}

export class HasOne<T extends Model> extends Relation<T> {
    constructor(
        protected relatedModel: typeof Model,
        protected foreignKey: string,
        protected localKey: string = 'id',
        parent: Model
    ) {
        super(relatedModel, parent);
    }

    async getResults(): Promise<T | null> {
        const localValue = (this.parent as any).getAttribute(this.localKey);
        if (localValue === undefined || localValue === null) return null;

        this.query.where(this.foreignKey, localValue);
        return await this.query.first();
    }

    // HasOne specific methods
    async create(attributes: Record<string, any>): Promise<T> {
        const foreignValue = (this.parent as any).getAttribute(this.localKey);
        attributes[this.foreignKey] = foreignValue;

        const instance = new (this.relatedModel as any)(attributes) as T;
        await (instance as any).save();
        return instance;
    }

    async update(attributes: Record<string, any>): Promise<number> {
        const localValue = (this.parent as any).getAttribute(this.localKey);
        if (localValue === undefined || localValue === null) return 0;

        return await this.query
            .where(this.foreignKey, localValue)
            .update(attributes);
    }

    async save(model: T): Promise<T> {
        const localValue = (this.parent as any).getAttribute(this.localKey);
        (model as any).setAttribute(this.foreignKey, localValue);
        await (model as any).save();
        return model;
    }

    // Association management
    async associate(model: T | null): Promise<void> {
        const localValue = (this.parent as any).getAttribute(this.localKey);

        if (model === null) {
            // Dissociate
            await this.query
                .where(this.foreignKey, localValue)
                .update({ [this.foreignKey]: null });
        } else {
            const foreignValue = (model as any).getAttribute((this.relatedModel as any).primaryKey || 'id');
            if (!foreignValue) {
                await (model as any).save();
            }
            (model as any).setAttribute(this.foreignKey, localValue);
            await (model as any).save();
        }
    }

    async dissociate(): Promise<void> {
        return this.associate(null);
    }
}

export class HasMany<T extends Model> extends Relation<T> {
    constructor(
        protected relatedModel: typeof Model,
        protected foreignKey: string,
        protected localKey: string = 'id',
        parent: Model
    ) {
        super(relatedModel, parent);
    }

    async getResults(): Promise<T[]> {
        const localValue = (this.parent as any).getAttribute(this.localKey);
        if (localValue === undefined || localValue === null) return [];

        this.query.where(this.foreignKey, localValue);
        return await this.query.get();
    }

    // HasMany specific methods
    async create(attributes: Record<string, any>): Promise<T> {
        const foreignValue = (this.parent as any).getAttribute(this.localKey);
        attributes[this.foreignKey] = foreignValue;

        const instance = new (this.relatedModel as any)(attributes) as T;
        await (instance as any).save();
        return instance;
    }

    async createMany(rows: Array<Record<string, any>>): Promise<T[]> {
        const foreignValue = (this.parent as any).getAttribute(this.localKey);
        const instances: T[] = [];

        for (const row of rows) {
            row[this.foreignKey] = foreignValue;
            const instance = new (this.relatedModel as any)(row) as T;
            await (instance as any).save();
            instances.push(instance);
        }

        return instances;
    }

    async save(model: T): Promise<T> {
        const foreignValue = (this.parent as any).getAttribute(this.localKey);
        (model as any).setAttribute(this.foreignKey, foreignValue);
        await (model as any).save();
        return model;
    }

    async saveMany(models: T[]): Promise<T[]> {
        const foreignValue = (this.parent as any).getAttribute(this.localKey);

        for (const model of models) {
            (model as any).setAttribute(this.foreignKey, foreignValue);
            await (model as any).save();
        }

        return models;
    }

    // Collection management
    async attach(model: T | number | string): Promise<void> {
        let relatedId: number | string;

        if (typeof model === 'number' || typeof model === 'string') {
            relatedId = model;
        } else {
            relatedId = (model as any).getAttribute((this.relatedModel as any).primaryKey || 'id');
            if (!relatedId) {
                await (model as any).save();
                relatedId = (model as any).getAttribute((this.relatedModel as any).primaryKey || 'id');
            }
        }

        const foreignValue = (this.parent as any).getAttribute(this.localKey);
        await dbQuery(
            `UPDATE ${(this.relatedModel as typeof Model).getTable()} SET ${this.foreignKey} = ? WHERE ${(this.relatedModel as any).primaryKey || 'id'} = ?`,
            [foreignValue, relatedId]
        );
    }

    async detach(model?: T | number | string): Promise<number> {
        const foreignValue = (this.parent as any).getAttribute(this.localKey);

        if (model === undefined) {
            // Detach all
            return await this.query
                .where(this.foreignKey, foreignValue)
                .update({ [this.foreignKey]: null });
        }

        let relatedId: number | string;

        if (typeof model === 'number' || typeof model === 'string') {
            relatedId = model;
        } else {
            relatedId = (model as any).getAttribute((this.relatedModel as any).primaryKey || 'id');
        }

        return await dbQuery(
            `UPDATE ${(this.relatedModel as typeof Model).getTable()} SET ${this.foreignKey} = NULL WHERE ${(this.relatedModel as any).primaryKey || 'id'} = ? AND ${this.foreignKey} = ?`,
            [relatedId, foreignValue]
        ).then((result: any) => result.affectedRows || 0);
    }

    async sync(models: (T | number | string)[], detaching: boolean = true): Promise<{ attached: any[], detached: any[], updated: any[] }> {
        const foreignValue = (this.parent as any).getAttribute(this.localKey);
        const current = await this.getResults();
        const currentIds = new Set(current.map(item => (item as any).getAttribute((this.relatedModel as any).primaryKey || 'id')));

        const newIds = new Set();
        const modelsToSync: T[] = [];

        // Process new models/ids
        for (const model of models) {
            let relatedId: number | string;
            let modelInstance: T;

            if (typeof model === 'number' || typeof model === 'string') {
                relatedId = model;
                modelInstance = await (this.relatedModel as any).find(relatedId) as T;
                if (!modelInstance) continue;
            } else {
                modelInstance = model;
                relatedId = (model as any).getAttribute((this.relatedModel as any).primaryKey || 'id');
                if (!relatedId) {
                    await (model as any).save();
                    relatedId = (model as any).getAttribute((this.relatedModel as any).primaryKey || 'id');
                }
            }

            newIds.add(relatedId);
            modelsToSync.push(modelInstance);
        }

        const attached: any[] = [];
        const detached: any[] = [];
        const updated: any[] = [];

        // Detach removed models
        if (detaching) {
            for (const currentId of currentIds) {
                if (!newIds.has(currentId)) {
                    await this.detach(currentId);
                    detached.push(currentId);
                }
            }
        }

        // Attach/update new models
        for (const model of modelsToSync) {
            const relatedId = (model as any).getAttribute((this.relatedModel as any).primaryKey || 'id');

            if (currentIds.has(relatedId)) {
                // Update existing
                await (model as any).save();
                updated.push(relatedId);
            } else {
                // Attach new
                await this.attach(model);
                attached.push(relatedId);
            }
        }

        return { attached, detached, updated };
    }
}

export class BelongsTo<T extends Model> extends Relation<T> {
    constructor(
        private relatedModel: typeof Model,
        private foreignKey: string,
        private ownerKey: string = 'id',
        parent: Model
    ) {
        super(relatedModel, parent);
    }

    async getResults(): Promise<T | null> {
        const foreignValue = (this.parent as any).getAttribute(this.foreignKey);
        if (foreignValue === undefined || foreignValue === null) return null;

        this.query.where(this.ownerKey, foreignValue);
        return await this.query.first();
    }

    // BelongsTo specific methods
    async associate(model: T | number | string | null): Promise<void> {
        if (model === null) {
            // Dissociate
            (this.parent as any).setAttribute(this.foreignKey, null);
            await (this.parent as any).save();
            return;
        }

        let relatedId: number | string;

        if (typeof model === 'number' || typeof model === 'string') {
            relatedId = model;
        } else {
            relatedId = (model as any).getAttribute(this.ownerKey);
            if (!relatedId) {
                await (model as any).save();
                relatedId = (model as any).getAttribute(this.ownerKey);
            }
        }

        (this.parent as any).setAttribute(this.foreignKey, relatedId);
        await (this.parent as any).save();
    }

    async dissociate(): Promise<void> {
        return this.associate(null);
    }

    // Update the related model
    async update(attributes: Record<string, any>): Promise<number> {
        const related = await this.getResults();
        if (!related) return 0;

        return await (related as any).update(attributes).then(() => 1);
    }
}

export class BelongsToMany<T extends Model> extends Relation<T> {
    private pivotColumns: string[] = [];
    private pivotWheres: Array<{ column: string; operator: string; value: any }> = [];

    constructor(
        private relatedModel: typeof Model,
        private pivotTable: string,
        private foreignPivotKey: string,
        private relatedPivotKey: string,
        private parentPrimaryKey: string = 'id',
        private relatedPrimaryKey: string = 'id',
        parent: Model
    ) {
        super(relatedModel, parent);
    }

    async getResults(): Promise<T[]> {
        const parentId = (this.parent as any).getAttribute(this.parentPrimaryKey);
        if (parentId === undefined || parentId === null) return [];

        // Get related IDs from pivot with additional pivot conditions
        let pivotSql = `SELECT ${this.relatedPivotKey} AS related_id`;

        // Add pivot columns if specified
        if (this.pivotColumns.length > 0) {
            pivotSql += `, ${this.pivotColumns.join(', ')}`;
        }

        pivotSql += ` FROM ${this.pivotTable} WHERE ${this.foreignPivotKey} = ?`;
        const pivotParams: any[] = [parentId];

        // Add pivot where conditions
        this.pivotWheres.forEach(where => {
            pivotSql += ` AND ${where.column} ${where.operator} ?`;
            pivotParams.push(where.value);
        });

        const pivotRows = await dbQuery<any>(pivotSql, pivotParams);
        const relatedIds = pivotRows.map((r: any) => r.related_id);

        if (!relatedIds.length) return [];

        const placeholders = relatedIds.map(() => '?').join(',');
        const rows = await dbQuery<any>(
            `SELECT * FROM ${(this.relatedModel as typeof Model).getTable()} WHERE ${this.relatedPrimaryKey} IN (${placeholders})`,
            relatedIds
        );

        // Attach pivot data to related models
        const pivotMap = new Map(pivotRows.map((r: any) => [r.related_id, r]));

        return rows.map(row => {
            const instance = new (this.relatedModel as any)(row) as T;
            const pivotData = pivotMap.get(row[this.relatedPrimaryKey]);
            if (pivotData) {
                (instance as any).pivot = this.createPivot(pivotData);
            }
            return instance;
        });
    }

    // Pivot management methods
    withPivot(...columns: string[]): this {
        this.pivotColumns.push(...columns);
        return this;
    }

    wherePivot(column: string, operator: any, value?: any): this {
        if (value === undefined) {
            value = operator;
            operator = '=';
        }

        this.pivotWheres.push({ column, operator, value });
        return this;
    }

    async attach(relatedId: number | string | Record<string, any> | (number | string | Record<string, any>)[], extra: Record<string, any> = {}): Promise<void> {
        const parentId = (this.parent as any).getAttribute(this.parentPrimaryKey);
        if (parentId === undefined || parentId === null) return;

        const attachments = Array.isArray(relatedId) ? relatedId : [relatedId];

        for (const attachment of attachments) {
            let actualRelatedId: number | string;
            let pivotData: Record<string, any> = { ...extra };

            if (typeof attachment === 'number' || typeof attachment === 'string') {
                actualRelatedId = attachment;
            } else {
                actualRelatedId = attachment[this.relatedPrimaryKey];
                pivotData = { ...attachment, ...extra };
                delete pivotData[this.relatedPrimaryKey];
            }

            const columns = [this.foreignPivotKey, this.relatedPivotKey, ...Object.keys(pivotData)];
            const placeholders = columns.map(() => '?').join(',');
            const values = [parentId, actualRelatedId, ...Object.values(pivotData)];

            await dbQuery(
                `INSERT INTO ${this.pivotTable} (${columns.join(',')}) VALUES (${placeholders}) 
         ON DUPLICATE KEY UPDATE ${Object.keys(pivotData).map(k => `${k} = ?`).join(', ')}`,
                [...values, ...Object.values(pivotData)]
            );
        }
    }

    async detach(relatedIds?: (number | string)[]): Promise<number> {
        const parentId = (this.parent as any).getAttribute(this.parentPrimaryKey);
        if (parentId === undefined || parentId === null) return 0;

        let sql = `DELETE FROM ${this.pivotTable} WHERE ${this.foreignPivotKey} = ?`;
        const params: any[] = [parentId];

        if (relatedIds && relatedIds.length > 0) {
            const placeholders = relatedIds.map(() => '?').join(',');
            sql += ` AND ${this.relatedPivotKey} IN (${placeholders})`;
            params.push(...relatedIds);
        }

        const result: any = await dbQuery(sql, params);
        return result.affectedRows || 0;
    }

    async sync(relatedIds: (number | string | Record<string, any>)[], detaching: boolean = true): Promise<{ attached: any[], detached: any[], updated: any[] }> {
        const parentId = (this.parent as any).getAttribute(this.parentPrimaryKey);
        if (parentId === undefined || parentId === null) {
            return { attached: [], detached: [], updated: [] };
        }

        // Get current related IDs
        const currentPivotRows = await dbQuery<any>(
            `SELECT ${this.relatedPivotKey} FROM ${this.pivotTable} WHERE ${this.foreignPivotKey} = ?`,
            [parentId]
        );

        const currentIds = new Set(currentPivotRows.map((r: any) => r[this.relatedPivotKey]));
        const newIds = new Set();

        const attached: any[] = [];
        const detached: any[] = [];
        const updated: any[] = [];

        // Process new IDs
        for (const relatedId of relatedIds) {
            let actualId: number | string;
            let extraData: Record<string, any> = {};

            if (typeof relatedId === 'number' || typeof relatedId === 'string') {
                actualId = relatedId;
            } else {
                actualId = relatedId[this.relatedPrimaryKey];
                extraData = { ...relatedId };
                delete extraData[this.relatedPrimaryKey];
            }

            newIds.add(actualId);

            if (currentIds.has(actualId)) {
                // Update existing pivot
                if (Object.keys(extraData).length > 0) {
                    const setSql = Object.keys(extraData).map(k => `${k} = ?`).join(', ');
                    await dbQuery(
                        `UPDATE ${this.pivotTable} SET ${setSql} WHERE ${this.foreignPivotKey} = ? AND ${this.relatedPivotKey} = ?`,
                        [...Object.values(extraData), parentId, actualId]
                    );
                    updated.push(actualId);
                }
            } else {
                // Attach new
                await this.attach(relatedId);
                attached.push(actualId);
            }
        }

        // Detach removed IDs
        if (detaching) {
            for (const currentId of currentIds) {
                if (!newIds.has(currentId)) {
                    await this.detach([currentId]);
                    detached.push(currentId);
                }
            }
        }

        return { attached, detached, updated };
    }

    async toggle(relatedIds: (number | string)[]): Promise<{ attached: any[], detached: any[] }> {
        const parentId = (this.parent as any).getAttribute(this.parentPrimaryKey);
        if (parentId === undefined || parentId === null) {
            return { attached: [], detached: [] };
        }

        // Check which IDs are currently attached
        const placeholders = relatedIds.map(() => '?').join(',');
        const currentRows = await dbQuery<any>(
            `SELECT ${this.relatedPivotKey} FROM ${this.pivotTable} 
       WHERE ${this.foreignPivotKey} = ? AND ${this.relatedPivotKey} IN (${placeholders})`,
            [parentId, ...relatedIds]
        );

        const currentIds = new Set(currentRows.map((r: any) => r[this.relatedPivotKey]));

        const toAttach = relatedIds.filter(id => !currentIds.has(id));
        const toDetach = relatedIds.filter(id => currentIds.has(id));

        if (toAttach.length > 0) {
            await this.attach(toAttach);
        }

        if (toDetach.length > 0) {
            await this.detach(toDetach);
        }

        return {
            attached: toAttach,
            detached: toDetach
        };
    }

    async updateExistingPivot(relatedId: number | string, attributes: Record<string, any>): Promise<number> {
        const parentId = (this.parent as any).getAttribute(this.parentPrimaryKey);
        if (parentId === undefined || parentId === null) return 0;

        const setSql = Object.keys(attributes).map(k => `${k} = ?`).join(', ');
        const result: any = await dbQuery(
            `UPDATE ${this.pivotTable} SET ${setSql} WHERE ${this.foreignPivotKey} = ? AND ${this.relatedPivotKey} = ?`,
            [...Object.values(attributes), parentId, relatedId]
        );

        return result.affectedRows || 0;
    }

    private createPivot(pivotData: Record<string, any>): Pivot {
        return new Pivot(pivotData, this.pivotTable, this.foreignPivotKey, this.relatedPivotKey);
    }
}

// Pivot model for many-to-many relationships
export class Pivot {
    public exists: boolean = true;

    constructor(
        private attributes: Record<string, any>,
        private pivotTable: string,
        private foreignPivotKey: string,
        private relatedPivotKey: string
    ) {}

    getAttribute<T = any>(key: string): T {
        return this.attributes[key];
    }

    setAttribute(key: string, value: any): void {
        this.attributes[key] = value;
    }

    toJSON(): any {
        return { ...this.attributes };
    }

    async save(): Promise<boolean> {
        const foreignValue = this.attributes[this.foreignPivotKey];
        const relatedValue = this.attributes[this.relatedPivotKey];

        if (!foreignValue || !relatedValue) return false;

        const updateData = { ...this.attributes };
        delete updateData[this.foreignPivotKey];
        delete updateData[this.relatedPivotKey];

        const setSql = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
        const values = [...Object.values(updateData), foreignValue, relatedValue];

        const result: any = await dbQuery(
            `UPDATE ${this.pivotTable} SET ${setSql} WHERE ${this.foreignPivotKey} = ? AND ${this.relatedPivotKey} = ?`,
            values
        );

        return result.affectedRows > 0;
    }

    async delete(): Promise<boolean> {
        const foreignValue = this.attributes[this.foreignPivotKey];
        const relatedValue = this.attributes[this.relatedPivotKey];

        if (!foreignValue || !relatedValue) return false;

        const result: any = await dbQuery(
            `DELETE FROM ${this.pivotTable} WHERE ${this.foreignPivotKey} = ? AND ${this.relatedPivotKey} = ?`,
            [foreignValue, relatedValue]
        );

        if (result.affectedRows > 0) {
            this.exists = false;
            return true;
        }

        return false;
    }
}

// Morph relationships
export class MorphOne<T extends Model> extends HasOne<T> {
    private morphType: string;

    constructor(
        relatedModel: typeof Model,
        morphType: string,
        foreignKey: string,
        localKey: string = 'id',
        parent: Model
    ) {
        super(relatedModel, foreignKey, localKey, parent);
        this.morphType = morphType;
    }

    async getResults(): Promise<T | null> {
        const localValue = (this.parent as any).getAttribute(this.localKey);
        if (localValue === undefined || localValue === null) return null;

        this.query
            .where(this.foreignKey, localValue)
            .where(`${this.morphType}_type`, this.parent.constructor.name);

        return await this.query.first();
    }

    async create(attributes: Record<string, any>): Promise<T> {
        const foreignValue = (this.parent as any).getAttribute(this.localKey);
        attributes[this.foreignKey] = foreignValue;
        attributes[`${this.morphType}_type`] = this.parent.constructor.name;

        const instance = new (this.relatedModel as any)(attributes) as T;
        await (instance as any).save();
        return instance;
    }
}

export class MorphMany<T extends Model> extends HasMany<T> {
    private morphType: string;

    constructor(
        relatedModel: typeof Model,
        morphType: string,
        foreignKey: string,
        localKey: string = 'id',
        parent: Model
    ) {
        super(relatedModel, foreignKey, localKey, parent);
        this.morphType = morphType;
    }

    async getResults(): Promise<T[]> {
        const localValue = (this.parent as any).getAttribute(this.localKey);
        if (localValue === undefined || localValue === null) return [];

        this.query
            .where(this.foreignKey, localValue)
            .where(`${this.morphType}_type`, this.parent.constructor.name);

        return await this.query.get();
    }

    async create(attributes: Record<string, any>): Promise<T> {
        const foreignValue = (this.parent as any).getAttribute(this.localKey);
        attributes[this.foreignKey] = foreignValue;
        attributes[`${this.morphType}_type`] = this.parent.constructor.name;

        const instance = new (this.relatedModel as any)(attributes) as T;
        await (instance as any).save();
        return instance;
    }
}

export class MorphTo<T extends Model> extends Relation<T> {
    private morphType: string;
    private morphId: string;

    constructor(
        morphType: string,
        morphId: string,
        parent: Model,
        private morphMap?: Record<string, typeof Model>
    ) {
        super(Model, parent); // Base model, will be overridden
        this.morphType = morphType;
        this.morphId = morphId;
    }

    async getResults(): Promise<T | null> {
        const type = (this.parent as any).getAttribute(this.morphType);
        const id = (this.parent as any).getAttribute(this.morphId);

        if (!type || !id) return null;

        // Resolve the actual model class from morph map or type
        let modelClass: typeof Model = this.morphMap?.[type] || Model;

        // Try to find the model by convention if not in morph map
        if (modelClass === Model) {
            // You might want to implement a naming convention here
            // For example: convert "User" to user model class
        }

        this.related = modelClass;
        this.query = new EloquentBuilder<T>(modelClass as any);

        this.query.where((modelClass as any).primaryKey || 'id', id);
        return await this.query.first();
    }
}