// EloquentBuilder.ts
import { Model } from './Model';
import { WhereClause, QueryResult, JoinClause, EagerLoadOptions } from './types';
import { query as dbQuery } from '../config/db.config';

export class EloquentBuilder<T extends Model> {
    private model: typeof Model;
    private withRelations: Map<string, EagerLoadOptions> = new Map();
    private whereClauses: WhereClause[] = [];
    private havingClauses: WhereClause[] = [];
    private joinClauses: JoinClause[] = [];
    private limitValue?: number;
    private offsetValue?: number;
    private orderByColumn?: string;
    private orderByDirection: 'asc' | 'desc' = 'asc';
    private groupByColumns: string[] = [];
    private hasConditions: { relation: string; operator?: string; count?: number; callback?: (query: EloquentBuilder<any>) => void }[] = [];
    private selectedColumns?: string[];
    private distinctValue: boolean = false;

    constructor(model: typeof Model) {
        this.model = model;
    }

    with(relations: string | string[] | Record<string, any>): this {
        if (typeof relations === 'string') {
            this.withRelations.set(relations, {});
        } else if (Array.isArray(relations)) {
            relations.forEach(r => this.withRelations.set(r, {}));
        } else if (relations && typeof relations === 'object') {
            Object.entries(relations).forEach(([key, val]) => {
                const options: EagerLoadOptions = {};
                if (typeof val === 'function') {
                    options.constraints = val as (b: EloquentBuilder<any>) => void;
                } else if (Array.isArray(val)) {
                    options.columns = val as string[];
                } else if (val && typeof val === 'object') {
                    Object.assign(options, val as EagerLoadOptions);
                }
                this.withRelations.set(key, options);
            });
        }
        return this;
    }

    select(columns: string[] | string): this {
        if (typeof columns === 'string') {
            this.selectedColumns = [columns];
        } else {
            this.selectedColumns = columns;
        }
        return this;
    }

    addSelect(columns: string[] | string): this {
        if (!this.selectedColumns) {
            this.selectedColumns = ['*'];
        }
        if (typeof columns === 'string') {
            this.selectedColumns.push(columns);
        } else {
            this.selectedColumns.push(...columns);
        }
        return this;
    }

    distinct(): this {
        this.distinctValue = true;
        return this;
    }

    where(column: string | ((builder: EloquentBuilder<T>) => void), operator?: any, value?: any): this {
        if (typeof column === 'function') {
            // Nested where
            const nestedBuilder = new EloquentBuilder<T>(this.model as any);
            column(nestedBuilder);
            const nestedWhere = nestedBuilder.getWhereClauses();
            if (nestedWhere.length > 0) {
                this.whereClauses.push({
                    column: '',
                    operator: 'nested',
                    value: nestedWhere,
                    boolean: 'and'
                });
            }
            return this;
        }

        if (value === undefined) {
            value = operator;
            operator = '=';
        }

        this.whereClauses.push({
            column,
            operator,
            value,
            boolean: 'and'
        });

        return this;
    }

    orWhere(column: string | ((builder: EloquentBuilder<T>) => void), operator?: any, value?: any): this {
        if (typeof column === 'function') {
            const nestedBuilder = new EloquentBuilder<T>(this.model as any);
            column(nestedBuilder);
            const nestedWhere = nestedBuilder.getWhereClauses();
            if (nestedWhere.length > 0) {
                this.whereClauses.push({
                    column: '',
                    operator: 'nested',
                    value: nestedWhere,
                    boolean: 'or'
                });
            }
            return this;
        }

        if (value === undefined) {
            value = operator;
            operator = '=';
        }

        this.whereClauses.push({
            column,
            operator,
            value,
            boolean: 'or'
        });

        return this;
    }

    whereIn(column: string, values: any[]): this {
        this.whereClauses.push({ column, operator: 'IN', value: values, boolean: 'and' });
        return this;
    }

    whereNotIn(column: string, values: any[]): this {
        this.whereClauses.push({ column, operator: 'NOT IN', value: values, boolean: 'and' });
        return this;
    }

    whereNull(column: string): this {
        this.whereClauses.push({ column, operator: '=', value: null, boolean: 'and' });
        return this;
    }

    whereNotNull(column: string): this {
        this.whereClauses.push({ column, operator: '!=', value: null, boolean: 'and' });
        return this;
    }

    whereBetween(column: string, range: [any, any]): this {
        this.whereClauses.push({
            column,
            operator: 'BETWEEN',
            value: range,
            boolean: 'and'
        });
        return this;
    }

    whereNotBetween(column: string, range: [any, any]): this {
        this.whereClauses.push({
            column,
            operator: 'NOT BETWEEN',
            value: range,
            boolean: 'and'
        });
        return this;
    }

    whereHas(relation: string, callback?: (query: EloquentBuilder<any>) => void, operator: string = '>=', count: number = 1): this {
        this.hasConditions.push({ relation, operator, count, callback });
        return this;
    }

    whereDoesntHave(relation: string, callback?: (query: EloquentBuilder<any>) => void): this {
        this.hasConditions.push({ relation, operator: '=', count: 0, callback });
        return this;
    }

    join(table: string, first: string, operator: string, second: string, type: 'inner' | 'left' | 'right' | 'cross' = 'inner'): this {
        this.joinClauses.push({ table, first, operator, second, type });
        return this;
    }

    leftJoin(table: string, first: string, operator: string, second: string): this {
        return this.join(table, first, operator, second, 'left');
    }

    groupBy(columns: string | string[]): this {
        if (typeof columns === 'string') {
            this.groupByColumns.push(columns);
        } else {
            this.groupByColumns.push(...columns);
        }
        return this;
    }

    having(column: string, operator: string, value: any): this {
        this.havingClauses.push({
            column,
            operator,
            value,
            boolean: 'and'
        });
        return this;
    }

    limit(limit: number): this {
        this.limitValue = limit;
        return this;
    }

    offset(offset: number): this {
        this.offsetValue = offset;
        return this;
    }

    orderBy(column: string, direction: 'asc' | 'desc' = 'asc'): this {
        this.orderByColumn = column;
        this.orderByDirection = direction;
        return this;
    }

    latest(column: string = 'created_at'): this {
        return this.orderBy(column, 'desc');
    }

    oldest(column: string = 'created_at'): this {
        return this.orderBy(column, 'asc');
    }

    async get(): Promise<T[]> {
        const data = await this.executeQuery();

        const models = data.map(item => {
            const instance = new (this.model as any)();
            instance.hydrate(item);
            return instance as T;
        });

        if (this.withRelations.size > 0) {
            await this.loadRelationships(models);
        }

        return models.map(m => (typeof (m as any).toJSON === 'function' ? (m as any).toJSON() : (m as any)));
    }

    async toArray(): Promise<any[]> {
        const models = await this.get();
        return models.map(m => (typeof (m as any).toJSON === 'function' ? (m as any).toJSON() : (m as any)));
    }

    async first(): Promise<T | null> {
        const results = await this.limit(1).get();
        return results[0] || null;
    }

    async firstOrFail(): Promise<T> {
        const row = await this.first();
        if (!row) throw new Error(`${(this.model as any).name || 'Model'} not found`);
        return row;
    }

    async paginate(perPage: number = 15, page: number = 1): Promise<QueryResult<T>> {
        const offset = (page - 1) * perPage;
        const data = await this.limit(perPage).offset(offset).get();
        const total = await this.getCount();

        return {
            data,
            pagination: {
                currentPage: page,
                perPage,
                total,
                lastPage: Math.ceil(total / perPage)
            }
        };
    }

    async count(column: string = '*'): Promise<number> {
        const result = await this.aggregate('count', column);
        return parseInt(result, 10);
    }

    async max(column: string): Promise<number> {
        return parseFloat(await this.aggregate('max', column));
    }

    async min(column: string): Promise<number> {
        return parseFloat(await this.aggregate('min', column));
    }

    async avg(column: string): Promise<number> {
        return parseFloat(await this.aggregate('avg', column));
    }

    async sum(column: string): Promise<number> {
        return parseFloat(await this.aggregate('sum', column));
    }

    async exists(): Promise<boolean> {
        return (await this.count()) > 0;
    }

    async doesntExist(): Promise<boolean> {
        return !(await this.exists());
    }

    async find(id: number | string): Promise<T | null> {
        const pk = (this.model as any).primaryKey || 'id';
        return this.where(pk, id).first();
    }

    async findOrFail(id: number | string): Promise<T> {
        const found = await this.find(id);
        if (!found) throw new Error(`${(this.model as any).name || 'Model'} not found`);
        return found as T;
    }

    async all(): Promise<T[]> {
        return this.get();
    }

    async create(attributes: Record<string, any>): Promise<T> {
        const instance = new (this.model as any)(attributes) as T;
        await (instance as any).save();
        return instance;
    }

    async createMany(rows: Array<Record<string, any>>): Promise<T[]> {
        const created: T[] = [];
        for (const r of rows) {
            created.push(await this.create(r));
        }
        return created;
    }

    async update(values: Partial<Record<string, any>>): Promise<number> {
        const tableName = (this.model as typeof Model).getTable();
        const keys = Object.keys(values || {});
        if (!keys.length) return 0;

        const setSql = keys.map(k => `${k} = ?`).join(', ');
        const where = this.buildWhereClause();
        const sql = `UPDATE ${tableName} SET ${setSql}${where.sql}`;
        const params = [...keys.map(k => (values as any)[k]), ...where.params];

        const result: any = await dbQuery<any>(sql, params);
        return (result && result.affectedRows) ? Number(result.affectedRows) : 0;
    }

    async increment(column: string, amount: number = 1): Promise<number> {
        const tableName = (this.model as typeof Model).getTable();
        const where = this.buildWhereClause();
        const sql = `UPDATE ${tableName} SET ${column} = ${column} + ?${where.sql}`;
        const params = [amount, ...where.params];
        const result: any = await dbQuery<any>(sql, params);
        return (result && result.affectedRows) ? Number(result.affectedRows) : 0;
    }

    async decrement(column: string, amount: number = 1): Promise<number> {
        const tableName = (this.model as typeof Model).getTable();
        const where = this.buildWhereClause();
        const sql = `UPDATE ${tableName} SET ${column} = ${column} - ?${where.sql}`;
        const params = [amount, ...where.params];
        const result: any = await dbQuery<any>(sql, params);
        return (result && result.affectedRows) ? Number(result.affectedRows) : 0;
    }

    async delete(): Promise<number> {
        const tableName = (this.model as typeof Model).getTable();
        const where = this.buildWhereClause();
        const supportsSoft = Boolean((this.model as any).softDeletes);

        if (supportsSoft) {
            const now = new Date();
            const sql = `UPDATE ${tableName} SET deleted_at = ?${where.sql}`;
            const params = [now, ...where.params];
            const result: any = await dbQuery<any>(sql, params);
            return (result && result.affectedRows) ? Number(result.affectedRows) : 0;
        }

        const sql = `DELETE FROM ${tableName}${where.sql}`;
        const result: any = await dbQuery<any>(sql, where.params);
        return (result && result.affectedRows) ? Number(result.affectedRows) : 0;
    }

    async insert(rows: Array<Record<string, any>>): Promise<number> {
        if (!rows || !rows.length) return 0;
        const tableName = (this.model as typeof Model).getTable();
        const cols = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
        const placeholdersRow = `(${cols.map(() => '?').join(',')})`;
        const placeholders = new Array(rows.length).fill(placeholdersRow).join(',');
        const sql = `INSERT INTO ${tableName} (${cols.join(',')}) VALUES ${placeholders}`;
        const params: any[] = [];
        rows.forEach(r => cols.forEach(c => params.push(r[c])));
        const result: any = await dbQuery<any>(sql, params);
        return (result && result.affectedRows) ? Number(result.affectedRows) : 0;
    }

    async insertGetId(row: Record<string, any>): Promise<number> {
        const tableName = (this.model as typeof Model).getTable();
        const cols = Object.keys(row);
        const placeholders = `(${cols.map(() => '?').join(',')})`;
        const sql = `INSERT INTO ${tableName} (${cols.join(',')}) VALUES ${placeholders}`;
        const params = cols.map(c => row[c]);
        const result: any = await dbQuery<any>(sql, params);
        return result.insertId;
    }

    // Chained relationship methods
    has(relation: string, operator: string = '>=', count: number = 1): this {
        return this.whereHas(relation, undefined, operator, count);
    }

    doesntHave(relation: string): this {
        return this.whereDoesntHave(relation);
    }

    withCount(relations: string | string[]): this {
        const rels = Array.isArray(relations) ? relations : [relations];
        rels.forEach(relation => {
            this.selectedColumns = this.selectedColumns || ['*'];
            this.selectedColumns.push(`${relation}_count`);
        });
        return this;
    }

    // Private methods
    private async aggregate(functionName: string, column: string): Promise<string> {
        const tableName = (this.model as typeof Model).getTable();
        const where = this.buildWhereClause();
        const sql = `SELECT ${functionName.toUpperCase()}(${column}) as agg FROM ${tableName}${where.sql}`;
        const rows = await dbQuery<any>(sql, where.params);
        return rows[0]?.agg || '0';
    }

    private buildWhereClause(): { sql: string; params: any[] } {
        if (!this.whereClauses.length) return { sql: '', params: [] };
        const parts: string[] = [];
        const params: any[] = [];
        this.whereClauses.forEach((w, idx) => {
            const boolOp = idx === 0 ? '' : (w.boolean || 'and').toUpperCase() + ' ';
            const op = (w.operator || '=').toLowerCase();

            if (op === 'nested' && Array.isArray(w.value)) {
                const nested = this.buildNestedWhere(w.value as any);
                if (nested.sql) {
                    parts.push(`${boolOp}(${nested.sql})`);
                    params.push(...nested.params);
                }
                return;
            }

            if (Array.isArray(w.value) && (op === 'in' || op === 'not in')) {
                const placeholders = w.value.map(() => '?').join(', ');
                const kw = op === 'in' ? 'IN' : 'NOT IN';
                parts.push(`${boolOp}${w.column} ${kw} (${placeholders})`);
                params.push(...w.value);
            } else if (Array.isArray(w.value) && (op === 'between' || op === 'not between')) {
                const kw = op === 'between' ? 'BETWEEN' : 'NOT BETWEEN';
                parts.push(`${boolOp}${w.column} ${kw} ? AND ?`);
                params.push(w.value[0], w.value[1]);
            } else if (w.value === null) {
                const sqlOp = op === '=' ? 'IS' : op === '!=' || op === '<>' ? 'IS NOT' : (w.operator || '=').toUpperCase();
                parts.push(`${boolOp}${w.column} ${sqlOp} NULL`);
            } else {
                parts.push(`${boolOp}${w.column} ${(w.operator || '=').toUpperCase()} ?`);
                params.push(w.value);
            }
        });

        const sql = ' WHERE ' + parts.join(' ').trim();
        return { sql, params };
    }

    private buildNestedWhere(clauses: WhereClause[]): { sql: string; params: any[] } {
        const parts: string[] = [];
        const params: any[] = [];

        clauses.forEach((w, idx) => {
            const boolOp = idx === 0 ? '' : (w.boolean || 'and').toUpperCase() + ' ';

            if (Array.isArray(w.value) && (w.operator || '').toLowerCase() === 'in') {
                const placeholders = w.value.map(() => '?').join(', ');
                parts.push(`${boolOp}${w.column} IN (${placeholders})`);
                params.push(...w.value);
            } else if (w.value === null) {
                const op = (w.operator || '=').toLowerCase();
                const sqlOp = op === '=' ? 'IS' : op === '!=' || op === '<>' ? 'IS NOT' : op.toUpperCase();
                parts.push(`${boolOp}${w.column} ${sqlOp} NULL`);
            } else {
                parts.push(`${boolOp}${w.column} ${(w.operator || '=').toUpperCase()} ?`);
                params.push(w.value);
            }
        });

        return { sql: parts.join(' ').trim(), params };
    }

    private getWhereClauses(): WhereClause[] {
        return this.whereClauses;
    }

    private async executeQuery(): Promise<any[]> {
        const tableName = (this.model as typeof Model).getTable();
        const select = this.distinctValue ? 'SELECT DISTINCT' : 'SELECT';
        const columns = this.selectedColumns && this.selectedColumns.length ? this.selectedColumns.join(',') : '*';
        const base = `${select} ${columns} FROM ${tableName}`;

        const parts: string[] = [base];
        const params: any[] = [];

        // Add joins
        this.joinClauses.forEach(join => {
            parts.push(`${join.type.toUpperCase()} JOIN ${join.table} ON ${join.first} ${join.operator} ${join.second}`);
        });

        // Add where clause
        const where = this.buildWhereClause();
        if (where.sql) {
            parts.push(where.sql);
            params.push(...where.params);
        }

        // Add group by
        if (this.groupByColumns.length > 0) {
            parts.push(`GROUP BY ${this.groupByColumns.join(', ')}`);
        }

        // Add having
        if (this.havingClauses.length > 0) {
            const havingParts = this.havingClauses.map(h => `${h.column} ${h.operator} ?`);
            parts.push(`HAVING ${havingParts.join(' AND ')}`);
            params.push(...this.havingClauses.map(h => h.value));
        }

        // Add order by
        if (this.orderByColumn) {
            parts.push(`ORDER BY ${this.orderByColumn} ${this.orderByDirection.toUpperCase()}`);
        }

        // Add limit and offset
        if (this.limitValue !== undefined) parts.push(`LIMIT ${this.limitValue}`);
        if (this.offsetValue !== undefined) parts.push(`OFFSET ${this.offsetValue}`);

        const sql = parts.join(' ');
        const rows = await dbQuery<any>(sql, params);
        return rows;
    }

    private async getCount(): Promise<number> {
        const tableName = (this.model as typeof Model).getTable();
        const where = this.buildWhereClause();
        const sql = `SELECT COUNT(*) as count FROM ${tableName}${where.sql}`.trim();
        const rows = await dbQuery<any>(sql, where.params);
        const countRow = rows[0] as any;
        return countRow ? Number(countRow.count) : 0;
    }

    private async loadRelationships(models: T[]): Promise<void> {
        for (const [relation, options] of this.withRelations) {
            await this.loadRelationship(models, relation, options);
        }
    }

    private setRelation(model: T, name: string, value: any) {
        (model as any).relationshipsLoaded = (model as any).relationshipsLoaded || {};
        (model as any).relationshipsLoaded[name] = value;
    }

    private async loadRelationship(models: T[], relation: string, options: EagerLoadOptions = {}): Promise<void> {
        if (!models.length) return;

        const parentModelClass = this.model as typeof Model & { relationships?: any };
        const rel = (parentModelClass.relationships || {})[relation];
        if (!rel) return;

        const relatedModel = rel.model as typeof Model;
        const relatedTable = (relatedModel as typeof Model).getTable();
        const relatedPK = (relatedModel as any).primaryKey as string;

        if (rel.type === 'hasOne') {
            await this.loadHasOne(models, relation, rel, relatedModel, relatedTable, relatedPK, options);
        } else if (rel.type === 'hasMany') {
            await this.loadHasMany(models, relation, rel, relatedModel, relatedTable, relatedPK, options);
        } else if (rel.type === 'belongsTo') {
            await this.loadBelongsTo(models, relation, rel, relatedModel, relatedTable, relatedPK, options);
        } else if (rel.type === 'belongsToMany') {
            await this.loadBelongsToMany(models, relation, rel, relatedModel, relatedTable, relatedPK, options);
        } else if (rel.type === 'morphOne' || rel.type === 'morphMany') {
            await this.loadMorphRelations(models, relation, rel, relatedModel, relatedTable, relatedPK, options);
        }
    }

    private async loadHasOne(models: T[], relation: string, rel: any, relatedModel: typeof Model, relatedTable: string, relatedPK: string, options: EagerLoadOptions): Promise<void> {
        const localKey = rel.localKey || (this.model as any).primaryKey || 'id';
        const foreignKey = rel.foreignKey || `${(this.model as typeof Model).getTable()}_id`;
        const localIds = Array.from(new Set(models.map(m => (m as any).getAttribute(localKey)).filter((v: any) => v !== undefined)));

        if (!localIds.length) return;

        const placeholders = localIds.map(() => '?').join(',');
        let sql = `SELECT * FROM ${relatedTable} WHERE ${foreignKey} IN (${placeholders})`;
        const params: any[] = [...localIds];

        // Apply constraints if provided
        if (options.constraints) {
            const constraintBuilder = new EloquentBuilder(relatedModel);
            options.constraints(constraintBuilder);
            const constraintWhere = constraintBuilder.buildWhereClause();
            if (constraintWhere.sql) {
                sql += constraintWhere.sql.replace('WHERE', 'AND');
                params.push(...constraintWhere.params);
            }
        }

        const rows = await dbQuery<any>(sql, params);
        const byFK = new Map<any, any>();
        rows.forEach(r => byFK.set(r[foreignKey], r));

        models.forEach(m => {
            const key = (m as any).getAttribute(localKey);
            const row = byFK.get(key) || null;
            if (row) {
                const inst = new (relatedModel as any)();
                inst.hydrate(row);
                this.setRelation(m, relation, inst);
            } else {
                this.setRelation(m, relation, null);
            }
        });
    }

    private async loadHasMany(models: T[], relation: string, rel: any, relatedModel: typeof Model, relatedTable: string, relatedPK: string, options: EagerLoadOptions): Promise<void> {
        const localKey = rel.localKey || (this.model as any).primaryKey || 'id';
        const foreignKey = rel.foreignKey || `${(this.model as typeof Model).getTable()}_id`;
        const localIds = Array.from(new Set(models.map(m => (m as any).getAttribute(localKey)).filter((v: any) => v !== undefined)));

        if (!localIds.length) {
            models.forEach(m => this.setRelation(m, relation, []));
            return;
        }

        const placeholders = localIds.map(() => '?').join(',');
        let sql = `SELECT * FROM ${relatedTable} WHERE ${foreignKey} IN (${placeholders})`;
        const params: any[] = [...localIds];

        // Apply constraints if provided
        if (options.constraints) {
            const constraintBuilder = new EloquentBuilder(relatedModel);
            options.constraints(constraintBuilder);
            const constraintWhere = constraintBuilder.buildWhereClause();
            if (constraintWhere.sql) {
                sql += constraintWhere.sql.replace('WHERE', 'AND');
                params.push(...constraintWhere.params);
            }
        }

        const rows = await dbQuery<any>(sql, params);
        const grouped = new Map<any, any[]>();
        rows.forEach(r => {
            const k = r[foreignKey];
            if (!grouped.has(k)) grouped.set(k, []);
            grouped.get(k)!.push(r);
        });

        models.forEach(m => {
            const key = (m as any).getAttribute(localKey);
            const list = (grouped.get(key) || []).map(row => {
                const inst = new (relatedModel as any)();
                inst.hydrate(row);
                return inst;
            });
            this.setRelation(m, relation, list);
        });
    }

    private async loadBelongsTo(models: T[], relation: string, rel: any, relatedModel: typeof Model, relatedTable: string, relatedPK: string, options: EagerLoadOptions): Promise<void> {
        const foreignKey = rel.foreignKey || `${relation}_id`;
        const ownerKey = rel.ownerKey || relatedPK || 'id';
        const foreignIds = Array.from(new Set(models.map(m => (m as any).getAttribute(foreignKey)).filter((v: any) => v !== undefined && v !== null)));

        if (!foreignIds.length) {
            models.forEach(m => this.setRelation(m, relation, null));
            return;
        }

        const placeholders = foreignIds.map(() => '?').join(',');
        let sql = `SELECT * FROM ${relatedTable} WHERE ${ownerKey} IN (${placeholders})`;
        const params: any[] = [...foreignIds];

        // Apply constraints if provided
        if (options.constraints) {
            const constraintBuilder = new EloquentBuilder(relatedModel);
            options.constraints(constraintBuilder);
            const constraintWhere = constraintBuilder.buildWhereClause();
            if (constraintWhere.sql) {
                sql += constraintWhere.sql.replace('WHERE', 'AND');
                params.push(...constraintWhere.params);
            }
        }

        const rows = await dbQuery<any>(sql, params);
        const byOwner = new Map<any, any>();
        rows.forEach(r => byOwner.set(r[ownerKey], r));

        models.forEach(m => {
            const fk = (m as any).getAttribute(foreignKey);
            const row = byOwner.get(fk) || null;
            if (row) {
                const inst = new (relatedModel as any)();
                inst.hydrate(row);
                this.setRelation(m, relation, inst);
            } else {
                this.setRelation(m, relation, null);
            }
        });
    }

    private async loadBelongsToMany(models: T[], relation: string, rel: any, relatedModel: typeof Model, relatedTable: string, relatedPK: string, options: EagerLoadOptions): Promise<void> {
        const pivotTable = rel.table;
        const parentPK = (this.model as any).primaryKey || 'id';
        const foreignPivotKey = rel.foreignKey || `${(this.model as typeof Model).getTable()}_id`;
        const relatedPivotKey = rel.relatedKey || `${relatedTable}_id`;
        const parentIds = Array.from(new Set(models.map(m => (m as any).getAttribute(parentPK)).filter((v: any) => v !== undefined && v !== null)));

        if (!parentIds.length) {
            models.forEach(m => this.setRelation(m, relation, []));
            return;
        }

        const parentPlaceholders = parentIds.map(() => '?').join(',');

        // Fetch pivot rows
        let pivotSql = `SELECT ${foreignPivotKey} as parent_id, ${relatedPivotKey} as related_id FROM ${pivotTable} WHERE ${foreignPivotKey} IN (${parentPlaceholders})`;
        const pivotParams = [...parentIds];

        // Apply pivot constraints if provided
        if (options.constraints) {
            const constraintBuilder = new EloquentBuilder(relatedModel);
            options.constraints(constraintBuilder);
            const constraintWhere = constraintBuilder.buildWhereClause();
            if (constraintWhere.sql) {
                pivotSql += constraintWhere.sql.replace('WHERE', 'AND');
                pivotParams.push(...constraintWhere.params);
            }
        }

        const pivotRows = await dbQuery<any>(pivotSql, pivotParams);

        if (!pivotRows.length) {
            models.forEach(m => this.setRelation(m, relation, []));
            return;
        }

        const relatedIds = Array.from(new Set(pivotRows.map((r: any) => r.related_id)));
        const relatedPlaceholders = relatedIds.map(() => '?').join(',');
        const relatedRows = await dbQuery<any>(`SELECT * FROM ${relatedTable} WHERE ${relatedPK} IN (${relatedPlaceholders})`, relatedIds);

        const relatedMap = new Map<any, any>();
        relatedRows.forEach(r => relatedMap.set(r[relatedPK], r));

        const grouped = new Map<any, any[]>();
        pivotRows.forEach((p: any) => {
            const relRow = relatedMap.get(p.related_id);
            if (!grouped.has(p.parent_id)) grouped.set(p.parent_id, []);
            if (relRow) {
                const inst = new (relatedModel as any)();
                inst.hydrate(relRow);
                grouped.get(p.parent_id)!.push(inst);
            }
        });

        models.forEach(m => {
            const pid = (m as any).getAttribute(parentPK);
            const list = grouped.get(pid) || [];
            this.setRelation(m, relation, list);
        });
    }

    private async loadMorphRelations(models: T[], relation: string, rel: any, relatedModel: typeof Model, relatedTable: string, relatedPK: string, options: EagerLoadOptions): Promise<void> {
        // Implementation for morph relationships
        // This is a simplified version - you can expand this based on your needs
        const morphType = rel.morphName || (this.model as typeof Model).getTable();
        const foreignKey = rel.foreignKey || `${morphType}_id`;
        const morphTypeKey = rel.morphType || `${morphType}_type`;

        const localIds = Array.from(new Set(models.map(m => (m as any).getAttribute('id')).filter((v: any) => v !== undefined)));

        if (!localIds.length) {
            models.forEach(m => this.setRelation(m, relation, rel.type === 'morphOne' ? null : []));
            return;
        }

        const placeholders = localIds.map(() => '?').join(',');
        let sql = `SELECT * FROM ${relatedTable} WHERE ${foreignKey} IN (${placeholders}) AND ${morphTypeKey} = ?`;
        const params: any[] = [...localIds, morphType];

        if (options.constraints) {
            const constraintBuilder = new EloquentBuilder(relatedModel);
            options.constraints(constraintBuilder);
            const constraintWhere = constraintBuilder.buildWhereClause();
            if (constraintWhere.sql) {
                sql += constraintWhere.sql.replace('WHERE', 'AND');
                params.push(...constraintWhere.params);
            }
        }

        const rows = await dbQuery<any>(sql, params);

        if (rel.type === 'morphOne') {
            const byFK = new Map<any, any>();
            rows.forEach(r => byFK.set(r[foreignKey], r));

            models.forEach(m => {
                const key = (m as any).getAttribute('id');
                const row = byFK.get(key) || null;
                if (row) {
                    const inst = new (relatedModel as any)();
                    inst.hydrate(row);
                    this.setRelation(m, relation, inst);
                } else {
                    this.setRelation(m, relation, null);
                }
            });
        } else { // morphMany
            const grouped = new Map<any, any[]>();
            rows.forEach(r => {
                const k = r[foreignKey];
                if (!grouped.has(k)) grouped.set(k, []);
                grouped.get(k)!.push(r);
            });

            models.forEach(m => {
                const key = (m as any).getAttribute('id');
                const list = (grouped.get(key) || []).map(row => {
                    const inst = new (relatedModel as any)();
                    inst.hydrate(row);
                    return inst;
                });
                this.setRelation(m, relation, list);
            });
        }
    }
}
