// EloquentBuilder.ts
import { Model } from './Model';
import { WhereClause, QueryResult, JoinClause, EagerLoadOptions } from './types';
import { query as dbQuery, getDbType, collection as mongoCollection } from '@/config/db.config';
import { ObjectId } from 'mongodb';

export class EloquentBuilder<T extends Model> {
  private model: typeof Model;
  private withRelations: Map<string, EagerLoadOptions> = new Map();
  private nestedRelations: Map<string, Set<string>> = new Map();
  // New: store full path options and a tree for arbitrary depth
  private relationPathOptions: Map<string, EagerLoadOptions> = new Map();
  private relationTree: Record<string, any> = {};
  private whereClauses: WhereClause[] = [];
  private havingClauses: WhereClause[] = [];
  private joinClauses: JoinClause[] = [];
  private limitValue?: number;
  private offsetValue?: number;
  private orderByColumn?: string;
  private orderByDirection: 'asc' | 'desc' = 'asc';
  private groupByColumns: string[] = [];
  private hasConditions: {
    relation: string;
    operator?: string;
    count?: number;
    callback?: (query: EloquentBuilder<any>) => void;
  }[] = [];
  private selectedColumns?: string[];
  private distinctValue: boolean = false;
  // Soft delete scope flags
  private includeTrashed: boolean = false; // when true, do not auto add deleted_at IS NULL
  private appliedSoftDeleteFilter: boolean = false; // ensure we only append once
  private onlyTrashedFlag: boolean = false; // new: query only soft-deleted rows
  // Used to qualify bare column names when generating SQL (helps avoid ambiguity)
  private columnQualifier?: string;

  constructor(model: typeof Model) {
    this.model = model;
  }

  public getRelationTree(): Record<string, any> {
    return this.relationTree;
  }

  // Chain to include soft deleted rows
  public withTrashed(): this {
    this.includeTrashed = true;
    this.onlyTrashedFlag = false; // reset
    return this;
  }

  // Alias for possible misspelling
  public withThrashed(): this {
    return this.withTrashed();
  }

  // Chain to enforce exclusion of trashed (explicit call optional since default)
  public withoutTrashed(): this {
    this.includeTrashed = false;
    this.onlyTrashedFlag = false; // reset
    return this;
  }

  // Alias for possible misspelling
  public withoutThrashed(): this {
    return this.withoutTrashed();
  }

  public onlyTrashed(): this {
    // remove any previously added deleted_at conditions so we can set our own
    this.whereClauses = this.whereClauses.filter(w => w.column !== 'deleted_at');
    this.includeTrashed = true; // prevent auto-injection of deleted_at = null
    this.onlyTrashedFlag = true;
    // add condition to select only soft deleted rows
    this.whereClauses.push({ column: 'deleted_at', operator: '!=', value: null, boolean: 'and' });
    return this;
  }

  // Alias for possible misspelling
  public onlyThrashed(): this {
    return this.onlyTrashed();
  }

  with(relations: string | string[] | Record<string, any>): this {
    const addPathToTree = (path: string) => {
      const segments = path.split('.');
      let cursor = this.relationTree;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!cursor[seg]) cursor[seg] = {};
        cursor = cursor[seg];
      }
    };
    const ensureTopLevel = (top: string, options: EagerLoadOptions) => {
      if (!this.withRelations.has(top)) {
        this.withRelations.set(top, options);
      }
    };
    const registerNestedPairs = (segments: string[]) => {
      for (let i = 0; i < segments.length - 1; i++) {
        const parent = segments[i];
        const child = segments[i + 1];
        if (!this.nestedRelations.has(parent)) this.nestedRelations.set(parent, new Set());
        this.nestedRelations.get(parent)!.add(child);
      }
    };
    const addRel = (rel: string, options: EagerLoadOptions = {}) => {
      this.relationPathOptions.set(rel, options);
      addPathToTree(rel);
      const segments = rel.split('.');
      ensureTopLevel(segments[0], {}); // Always load top-most
      if (segments.length > 1) {
        registerNestedPairs(segments);
      } else {
        // top-level specific options
        if (!this.withRelations.has(rel)) this.withRelations.set(rel, options);
      }
    };

    if (typeof relations === 'string') {
      addRel(relations, {});
    } else if (Array.isArray(relations)) {
      relations.forEach(r => addRel(r, {}));
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
        addRel(key, options);
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

  where(
    column: string | ((builder: EloquentBuilder<T>) => void),
    operator?: any,
    value?: any
  ): this {
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
          boolean: 'and',
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
      boolean: 'and',
    });

    return this;
  }

  orWhere(
    column: string | ((builder: EloquentBuilder<T>) => void),
    operator?: any,
    value?: any
  ): this {
    if (typeof column === 'function') {
      const nestedBuilder = new EloquentBuilder<T>(this.model as any);
      column(nestedBuilder);
      const nestedWhere = nestedBuilder.getWhereClauses();
      if (nestedWhere.length > 0) {
        this.whereClauses.push({
          column: '',
          operator: 'nested',
          value: nestedWhere,
          boolean: 'or',
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
      boolean: 'or',
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
      boolean: 'and',
    });
    return this;
  }

  whereNotBetween(column: string, range: [any, any]): this {
    this.whereClauses.push({
      column,
      operator: 'NOT BETWEEN',
      value: range,
      boolean: 'and',
    });
    return this;
  }

  whereHas(
    relation: string,
    callback?: (query: EloquentBuilder<any>) => void,
    operator: string = '>=',
    count: number = 1
  ): this {
    this.hasConditions.push({ relation, operator, count, callback });
    return this;
  }

  whereDoesntHave(relation: string, callback?: (query: EloquentBuilder<any>) => void): this {
    this.hasConditions.push({ relation, operator: '=', count: 0, callback });
    return this;
  }

  join(
    table: string,
    first: string,
    operator: string,
    second: string,
    type: 'inner' | 'left' | 'right' | 'cross' = 'inner'
  ): this {
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
      boolean: 'and',
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
      // Load top-level relations first
      await this.loadRelationships(models);
      // Recursively load nested relations using relationTree (covers any depth)
      await this.loadRelationTree(models, this.relationTree, '');
    }

    // Return the actual Model instances, NOT their JSON representation
    return models;
  }

  async toArray(): Promise<any[]> {
    const models = await this.get();
    // Convert to JSON with proper nested relationship handling
    return models.map(m => {
      if (typeof (m as any).toJSON === 'function') {
        // Pass the relation tree to toJSON for proper nested serialization
        return (m as any).toJSON({
          relationTree: this.relationTree,
          maxDepth: 10, // You can make this configurable
        });
      }
      return m;
    });
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
    // Coerce to safe positive integers
    const pp = Number.isFinite(Number(perPage)) ? Math.max(1, Math.floor(Number(perPage))) : 15;
    const pg = Number.isFinite(Number(page)) ? Math.max(1, Math.floor(Number(page))) : 1;
    const offset = (pg - 1) * pp;
    const data = await this.limit(pp).offset(offset).get();
    const total = await this.getCount();

    return {
      data,
      pagination: {
        currentPage: pg,
        perPage: pp,
        total,
        lastPage: Math.max(1, Math.ceil(total / pp)),
      },
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
    if (getDbType() === 'mongodb') {
      return this.updateMongo(values);
    }
    const tableName = (this.model as typeof Model).getTable();
    const keys = Object.keys(values || {});
    if (!keys.length) return 0;

    const setSql = keys.map(k => `${k} = ?`).join(', ');
    const where = this.buildWhereClause();
    const sql = `UPDATE ${tableName} SET ${setSql}${where.sql}`;
    const params = [...keys.map(k => (values as any)[k]), ...where.params];

    const result: any = await dbQuery<any>(sql, params);
    return result && result.affectedRows ? Number(result.affectedRows) : 0;
  }

  async increment(column: string, amount: number = 1): Promise<number> {
    if (getDbType() === 'mongodb') return this.updateMongo({ [column]: { $inc: amount } } as any);
    const tableName = (this.model as typeof Model).getTable();
    const where = this.buildWhereClause();
    const sql = `UPDATE ${tableName} SET ${column} = ${column} + ?${where.sql}`;
    const params = [amount, ...where.params];
    const result: any = await dbQuery<any>(sql, params);
    return result && result.affectedRows ? Number(result.affectedRows) : 0;
  }

  async decrement(column: string, amount: number = 1): Promise<number> {
    if (getDbType() === 'mongodb') return this.updateMongo({ [column]: { $dec: amount } } as any); // treat as custom
    const tableName = (this.model as typeof Model).getTable();
    const where = this.buildWhereClause();
    const sql = `UPDATE ${tableName} SET ${column} = ${column} - ?${where.sql}`;
    const params = [amount, ...where.params];
    const result: any = await dbQuery<any>(sql, params);
    return result && result.affectedRows ? Number(result.affectedRows) : 0;
  }

  async delete(): Promise<number> {
    if (getDbType() === 'mongodb') return this.deleteMongo();
    const tableName = (this.model as typeof Model).getTable();
    const where = this.buildWhereClause();
    const supportsSoft = Boolean((this.model as any).softDeletes);

    if (supportsSoft) {
      const now = new Date();
      const sql = `UPDATE ${tableName} SET deleted_at = ?${where.sql}`;
      const params = [now, ...where.params];
      const result: any = await dbQuery<any>(sql, params);
      return result && result.affectedRows ? Number(result.affectedRows) : 0;
    }

    const sql = `DELETE FROM ${tableName}${where.sql}`;
    const result: any = await dbQuery<any>(sql, where.params);
    return result && result.affectedRows ? Number(result.affectedRows) : 0;
  }

  async insert(rows: Array<Record<string, any>>): Promise<number> {
    if (getDbType() === 'mongodb') return this.insertMongoMany(rows);
    if (!rows || !rows.length) return 0;
    const tableName = (this.model as typeof Model).getTable();
    const cols = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
    const placeholdersRow = `(${cols.map(() => '?').join(',')})`;
    const placeholders = new Array(rows.length).fill(placeholdersRow).join(',');
    const sql = `INSERT INTO ${tableName} (${cols.join(',')}) VALUES ${placeholders}`;
    const params: any[] = [];
    rows.forEach(r => cols.forEach(c => params.push(r[c])));
    const result: any = await dbQuery<any>(sql, params);
    return result && result.affectedRows ? Number(result.affectedRows) : 0;
  }

  async insertGetId(row: Record<string, any>): Promise<number> {
    if (getDbType() === 'mongodb') {
      const c = mongoCollection((this.model as typeof Model).getTable());
      const doc = { ...row } as any;
      if ('id' in doc && doc.id && !doc._id) {
        try {
          doc._id = new ObjectId(String(doc.id));
        } catch {
          doc._id = doc.id;
        }
        delete doc.id;
      }
      const res = await c.insertOne(doc);
      // return fake numeric id length for compatibility; Model.save will set id properly
      return res.insertedId as any as number;
    }
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
    if (getDbType() === 'mongodb') {
      return this.aggregateMongo(functionName, column);
    }
    const tableName = (this.model as typeof Model).getTable();
    const prev = this.columnQualifier;
    this.columnQualifier = tableName; // qualify unqualified columns
    const where = this.buildWhereClause();
    this.columnQualifier = prev;
    const sql = `SELECT ${functionName.toUpperCase()}(${column}) as agg FROM ${tableName}${where.sql}`;
    const rows = await dbQuery<any>(sql, where.params);
    return rows[0]?.agg || '0';
  }

  private buildWhereClause(): { sql: string; params: any[] } {
    // Inject soft delete constraint automatically (SQL) if model supports it and not including trashed and not querying only trashed
    if (
      !this.appliedSoftDeleteFilter &&
      (this.model as any).softDeletes &&
      !this.includeTrashed &&
      !this.onlyTrashedFlag &&
      !this.whereClauses.some(w => w.column === 'deleted_at')
    ) {
      this.whereClauses.push({ column: 'deleted_at', operator: '=', value: null, boolean: 'and' });
      this.appliedSoftDeleteFilter = true;
    }
    if (!this.whereClauses.length) return { sql: '', params: [] };
    const parts: string[] = [];
    const params: any[] = [];

    const qualify = (name: string): string => {
      const n = (name || '').trim();
      if (!n) return n;
      if (n.includes('.')) return n;
      if (this.columnQualifier) return `${this.columnQualifier}.${n}`;
      return n;
    };

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

      const col = qualify(w.column);

      if (Array.isArray(w.value) && (op === 'in' || op === 'not in')) {
        const placeholders = w.value.map(() => '?').join(', ');
        const kw = op === 'in' ? 'IN' : 'NOT IN';
        parts.push(`${boolOp}${col} ${kw} (${placeholders})`);
        params.push(...w.value);
      } else if (Array.isArray(w.value) && (op === 'between' || op === 'not between')) {
        const kw = op === 'between' ? 'BETWEEN' : 'NOT BETWEEN';
        parts.push(`${boolOp}${col} ${kw} ? AND ?`);
        params.push(w.value[0], w.value[1]);
      } else if (w.value === null) {
        const sqlOp =
          op === '='
            ? 'IS'
            : op === '!=' || op === '<>'
              ? 'IS NOT'
              : (w.operator || '=').toUpperCase();
        parts.push(`${boolOp}${col} ${sqlOp} NULL`);
      } else {
        parts.push(`${boolOp}${col} ${(w.operator || '=').toUpperCase()} ?`);
        params.push(w.value);
      }
    });

    const sql = ' WHERE ' + parts.join(' ').trim();
    return { sql, params };
  }

  private buildNestedWhere(clauses: WhereClause[]): { sql: string; params: any[] } {
    const parts: string[] = [];
    const params: any[] = [];

    const qualify = (name: string): string => {
      const n = (name || '').trim();
      if (!n) return n;
      if (n.includes('.')) return n;
      if (this.columnQualifier) return `${this.columnQualifier}.${n}`;
      return n;
    };

    clauses.forEach((w, idx) => {
      const boolOp = idx === 0 ? '' : (w.boolean || 'and').toUpperCase() + ' ';

      if (Array.isArray(w.value) && (w.operator || '').toLowerCase() === 'in') {
        const placeholders = w.value.map(() => '?').join(', ');
        parts.push(`${boolOp}${qualify(w.column)} IN (${placeholders})`);
        params.push(...w.value);
      } else if (w.value === null) {
        const op = (w.operator || '=').toLowerCase();
        const sqlOp = op === '=' ? 'IS' : op === '!=' || op === '<>' ? 'IS NOT' : op.toUpperCase();
        parts.push(`${boolOp}${qualify(w.column)} ${sqlOp} NULL`);
      } else {
        parts.push(`${boolOp}${qualify(w.column)} ${(w.operator || '=').toUpperCase()} ?`);
        params.push(w.value);
      }
    });

    return { sql: parts.join(' ').trim(), params };
  }

  private getWhereClauses(): WhereClause[] {
    return this.whereClauses;
  }

  private buildHasConditionsSQL(baseTable: string, forBuilder?: EloquentBuilder<any>): { sql: string; params: any[] } {
    const builder = forBuilder || this;
    if (!builder.hasConditions.length) return { sql: '', params: [] };
    const instance = new (builder.model as any)();
    const clauses: string[] = [];
    const params: any[] = [];
    const parentPK = (builder.model as any).primaryKey || 'id';

    builder.hasConditions.forEach(cond => {
      const relMeta = (instance as any).getRelationship(cond.relation);
      if (!relMeta) return; // skip silently
      const relatedModel = relMeta.model as typeof Model;
      const relatedTable = (relatedModel as any).getTable();
      const relatedPK = (relatedModel as any).primaryKey || 'id';
      const operator = cond.operator || '>=';
      const count = cond.count ?? 1;

      let constraintsSql = '';
      const constraintParams: any[] = [];

      const softDeleteFragment = (relatedModel as any).softDeletes ? ' AND deleted_at IS NULL' : '';

      let subquery = '';
      if (relMeta.type === 'hasOne' || relMeta.type === 'hasMany' || relMeta.type === 'morphOne' || relMeta.type === 'morphMany') {
        const foreignKey = relMeta.foreignKey || `${baseTable}_id`;
        if (cond.callback) {
          const cb = new EloquentBuilder(relatedModel) as any;
          cb.columnQualifier = relatedTable;
          cond.callback(cb);
          const where = cb.buildWhereClause();
          if (where.sql) {
            constraintsSql += where.sql.replace(/^\s*WHERE\s*/i, ' AND ');
            constraintParams.push(...where.params);
          }
          // nested whereHas inside callback
          const nestedHas = this.buildHasConditionsSQL(relatedTable, cb);
          if (nestedHas.sql) {
            constraintsSql += ' ' + nestedHas.sql;
            constraintParams.push(...nestedHas.params);
          }
        }
        subquery = `SELECT COUNT(*) FROM ${relatedTable} WHERE ${foreignKey} = ${baseTable}.${parentPK}${softDeleteFragment}${constraintsSql}`;
      } else if (relMeta.type === 'belongsTo') {
        const foreignKey = relMeta.foreignKey || `${cond.relation}_id`; // on parent
        const ownerKey = relMeta.ownerKey || relatedPK;
        if (cond.callback) {
          const cb = new EloquentBuilder(relatedModel) as any;
          cb.columnQualifier = relatedTable;
          cond.callback(cb);
          const where = cb.buildWhereClause();
          if (where.sql) {
            constraintsSql += where.sql.replace(/^\s*WHERE\s*/i, ' AND ');
            constraintParams.push(...where.params);
          }
          const nestedHas = this.buildHasConditionsSQL(relatedTable, cb);
          if (nestedHas.sql) {
            constraintsSql += ' ' + nestedHas.sql;
            constraintParams.push(...nestedHas.params);
          }
        }
        subquery = `SELECT COUNT(*) FROM ${relatedTable} WHERE ${relatedTable}.${ownerKey} = ${baseTable}.${foreignKey}${softDeleteFragment}${constraintsSql}`;
      } else if (relMeta.type === 'belongsToMany') {
        const pivot = relMeta.table;
        const foreignPivotKey = relMeta.foreignKey || `${baseTable}_id`;
        const relatedPivotKey = relMeta.relatedKey || `${relatedTable}_id`;
        if (cond.callback) {
          const cb = new EloquentBuilder(relatedModel) as any;
          // Qualify related table with alias 'r'
          cb.columnQualifier = 'r';
          cond.callback(cb);
          const where = cb.buildWhereClause();
          if (where.sql) {
            constraintsSql += where.sql.replace(/^\s*WHERE\s*/i, ' AND ');
            constraintParams.push(...where.params);
          }
          const nestedHas = this.buildHasConditionsSQL('r', cb);
          if (nestedHas.sql) {
            constraintsSql += ' ' + nestedHas.sql;
            constraintParams.push(...nestedHas.params);
          }
        }
        subquery = `SELECT COUNT(*) FROM ${pivot} p JOIN ${relatedTable} r ON r.${relatedPK} = p.${relatedPivotKey} WHERE p.${foreignPivotKey} = ${baseTable}.${parentPK}${(relatedModel as any).softDeletes ? ' AND r.deleted_at IS NULL' : ''}${constraintsSql}`;
      } else {
        return; // unsupported
      }
      clauses.push(`((${subquery}) ${operator} ?)`);
      // Ensure params align with placeholders: subquery constraints first, then comparator value
      params.push(...constraintParams, count);
    });

    if (!clauses.length) return { sql: '', params: [] };
    return { sql: clauses.map(c => `AND ${c}`).join(' '), params };
  }

  private async applyHasConditionsMongo(docs: any[]): Promise<any[]> {
    if (!this.hasConditions.length || !docs.length) return docs;
    const instance = new (this.model as any)();
    const parentPK = (this.model as any).primaryKey || 'id';

    const kept: any[] = [];
    for (const doc of docs) {
      let allOk = true;
      for (const cond of this.hasConditions) {
        const relMeta = (instance as any).getRelationship(cond.relation);
        if (!relMeta) { allOk = false; break; }
        const relatedModel = relMeta.model as typeof Model;
        const relatedTable = (relatedModel as any).getTable();
        const relatedPK = (relatedModel as any).primaryKey || 'id';
        const operator = cond.operator || '>=';
        const expected = cond.count ?? 1;

        let actual = 0;

        // Helper: apply nested has on related docs collection
        const applyNestedHasForRelatedDocs = async (docsArr: any[], cb?: EloquentBuilder<any>): Promise<number> => {
          if (!cb || !cb.hasConditions || cb.hasConditions.length === 0) return docsArr.length;
          const filtered: any[] = [];
          for (const rd of docsArr) {
            let okAll = true;
            for (const nestedCond of cb.hasConditions) {
              const relMeta2 = (new (relatedModel as any)() as any).getRelationship(nestedCond.relation);
              if (!relMeta2) { okAll = false; break; }
              const nestedModel = relMeta2.model as typeof Model;
              const nestedTable = (nestedModel as any).getTable();
              const nestedPK = (nestedModel as any).primaryKey || 'id';
              const op = nestedCond.operator || '>=';
              const exp = nestedCond.count ?? 1;
              let innerActual = 0;
              if (relMeta2.type === 'hasOne' || relMeta2.type === 'hasMany' || relMeta2.type === 'morphOne' || relMeta2.type === 'morphMany') {
                const fk = relMeta2.foreignKey || `${relatedTable}_id`;
                const c2 = mongoCollection(nestedTable);
                const nestedBuilder = nestedCond.callback ? new EloquentBuilder(nestedModel) : null;
                if (nestedBuilder && nestedCond.callback) nestedCond.callback(nestedBuilder as any);
                const baseFilter2: any = { [fk]: rd[relatedPK] };
                if ((nestedModel as any).softDeletes) baseFilter2.deleted_at = null;
                if (nestedBuilder) {
                  const extra2 = (nestedBuilder as any).buildMongoFilter();
                  const filters2 = Object.keys(extra2).length ? { $and: [baseFilter2, extra2] } : baseFilter2;
                  innerActual = await c2.countDocuments(filters2 as any);
                } else {
                  innerActual = await c2.countDocuments(baseFilter2 as any);
                }
              } else if (relMeta2.type === 'belongsTo') {
                const fk2 = relMeta2.foreignKey || `${nestedCond.relation}_id`;
                const ownerKey2 = relMeta2.ownerKey || nestedPK;
                const fkVal2 = rd[fk2];
                if (fkVal2 === undefined || fkVal2 === null) innerActual = 0; else {
                  const c2 = mongoCollection(nestedTable);
                  const baseFilter2: any = { [ownerKey2]: fkVal2 };
                  if ((nestedModel as any).softDeletes) baseFilter2.deleted_at = null;
                  if (nestedCond.callback) {
                    const nestedBuilder = new EloquentBuilder(nestedModel);
                    nestedCond.callback(nestedBuilder as any);
                    const extra2 = (nestedBuilder as any).buildMongoFilter();
                    const filters2 = Object.keys(extra2).length ? { $and: [baseFilter2, extra2] } : baseFilter2;
                    innerActual = await c2.countDocuments(filters2 as any);
                  } else innerActual = await c2.countDocuments(baseFilter2 as any);
                }
              } else if (relMeta2.type === 'belongsToMany') {
                const pivot2 = relMeta2.table;
                const foreignPivotKey2 = relMeta2.foreignKey || `${(relatedModel as any).getTable()}_id`;
                const relatedPivotKey2 = relMeta2.relatedKey || `${nestedTable}_id`;
                const pc2 = mongoCollection(pivot2);
                const pivots2 = await pc2.find({ [foreignPivotKey2]: rd[relatedPK] }).toArray();
                if (!pivots2.length) innerActual = 0; else {
                  const relatedIds2 = Array.from(new Set(pivots2.map(p => p[relatedPivotKey2])));
                  if (!relatedIds2.length) innerActual = 0; else {
                    const rc2 = mongoCollection(nestedTable);
                    let filter2: any = { [nestedPK]: { $in: relatedIds2 } };
                    if ((nestedModel as any).softDeletes) filter2.deleted_at = null;
                    if (nestedCond.callback) {
                      const nestedBuilder = new EloquentBuilder(nestedModel);
                      nestedCond.callback(nestedBuilder as any);
                      const extra2 = (nestedBuilder as any).buildMongoFilter();
                      if (Object.keys(extra2).length) filter2 = { $and: [filter2, extra2] };
                    }
                    innerActual = await rc2.countDocuments(filter2 as any);
                  }
                }
              } else { okAll = false; break; }

              let okInner = false;
              switch (op) {
                case '>': okInner = innerActual > exp; break;
                case '>=': okInner = innerActual >= exp; break;
                case '<': okInner = innerActual < exp; break;
                case '<=': okInner = innerActual <= exp; break;
                case '=': case '==': okInner = innerActual === exp; break;
                case '!=': case '<>': okInner = innerActual !== exp; break;
                default: okInner = innerActual >= exp; break;
              }
              if (!okInner) { okAll = false; break; }
            }
            if (okAll) filtered.push(rd);
          }
          return filtered.length;
        };

        if (relMeta.type === 'hasOne' || relMeta.type === 'hasMany' || relMeta.type === 'morphOne' || relMeta.type === 'morphMany') {
          const foreignKey = relMeta.foreignKey || `${(this.model as any).getTable()}_id`;
          const c = mongoCollection(relatedTable);
          const constraintBuilder = cond.callback ? new EloquentBuilder(relatedModel) : null;
          if (constraintBuilder && cond.callback) cond.callback(constraintBuilder as any);
          const baseFilter: any = { [foreignKey]: doc[parentPK] };
          if ((relatedModel as any).softDeletes) baseFilter.deleted_at = null;
          if (constraintBuilder) {
            const extra = (constraintBuilder as any).buildMongoFilter();
            const filters = Object.keys(extra).length ? { $and: [baseFilter, extra] } : baseFilter;
            if (constraintBuilder.hasConditions && constraintBuilder.hasConditions.length) {
              const arr = await c.find(filters as any).toArray();
              actual = await applyNestedHasForRelatedDocs(arr, constraintBuilder as any);
            } else {
              actual = await c.countDocuments(filters as any);
            }
          } else {
            actual = await c.countDocuments(baseFilter as any);
          }
        } else if (relMeta.type === 'belongsTo') {
          const foreignKey = relMeta.foreignKey || `${cond.relation}_id`;
          const ownerKey = relMeta.ownerKey || relatedPK;
          const fkVal = doc[foreignKey];
          if (fkVal === undefined || fkVal === null) actual = 0; else {
            const c = mongoCollection(relatedTable);
            const baseFilter: any = { [ownerKey]: fkVal };
            if ((relatedModel as any).softDeletes) baseFilter.deleted_at = null;
            if (cond.callback) {
              const constraintBuilder = new EloquentBuilder(relatedModel);
              cond.callback(constraintBuilder as any);
              const extra = (constraintBuilder as any).buildMongoFilter();
              const filters = Object.keys(extra).length ? { $and: [baseFilter, extra] } : baseFilter;
              if (constraintBuilder.hasConditions && constraintBuilder.hasConditions.length) {
                const arr = await c.find(filters as any).toArray();
                actual = await applyNestedHasForRelatedDocs(arr, constraintBuilder as any);
              } else {
                actual = await c.countDocuments(filters as any);
              }
            } else actual = await c.countDocuments(baseFilter as any);
          }
        } else if (relMeta.type === 'belongsToMany') {
          const pivot = relMeta.table;
          const foreignPivotKey = relMeta.foreignKey || `${(this.model as any).getTable()}_id`;
          const relatedPivotKey = relMeta.relatedKey || `${relatedTable}_id`;
          const pc = mongoCollection(pivot);
          const pivots = await pc.find({ [foreignPivotKey]: doc[parentPK] }).toArray();
          if (!pivots.length) actual = 0; else {
            const relatedIds = Array.from(new Set(pivots.map(p => p[relatedPivotKey])));
            if (!relatedIds.length) actual = 0; else {
              const rc = mongoCollection(relatedTable);
              let filter: any = { [relatedPK]: { $in: relatedIds } };
              if ((relatedModel as any).softDeletes) filter.deleted_at = null;
              if (cond.callback) {
                const constraintBuilder = new EloquentBuilder(relatedModel);
                cond.callback(constraintBuilder as any);
                const extra = (constraintBuilder as any).buildMongoFilter();
                if (Object.keys(extra).length) filter = { $and: [filter, extra] };
                if (constraintBuilder.hasConditions && constraintBuilder.hasConditions.length) {
                  const arr = await rc.find(filter as any).toArray();
                  actual = await applyNestedHasForRelatedDocs(arr, constraintBuilder as any);
                } else {
                  actual = await rc.countDocuments(filter as any);
                }
              } else {
                actual = await rc.countDocuments(filter as any);
              }
            }
          }
        }

        let ok = false;
        switch (operator) {
          case '>': ok = actual > expected; break;
          case '>=': ok = actual >= expected; break;
          case '<': ok = actual < expected; break;
          case '<=': ok = actual <= expected; break;
          case '=': case '==': ok = actual === expected; break;
          case '!=': case '<>': ok = actual !== expected; break;
          default: ok = actual >= expected; break;
        }
        if (!ok) { allOk = false; break; }
      }
      if (allOk) kept.push(doc);
    }
    return kept;
  }

  private async executeQuery(): Promise<any[]> {
    if (getDbType() === 'mongodb') return this.executeQueryMongo();
    const tableName = (this.model as typeof Model).getTable();
    const select = this.distinctValue ? 'SELECT DISTINCT' : 'SELECT';
    const columns =
      this.selectedColumns && this.selectedColumns.length ? this.selectedColumns.join(',') : '*';
    const base = `${select} ${columns} FROM ${tableName}`;

    const parts: string[] = [base];
    const params: any[] = [];

    // Add joins
    this.joinClauses.forEach(join => {
      parts.push(
        `${join.type.toUpperCase()} JOIN ${join.table} ON ${join.first} ${join.operator} ${join.second}`
      );
    });

    // Add where clause (qualify with base table to avoid ambiguity)
    const prev = this.columnQualifier;
    this.columnQualifier = tableName;
    const where = this.buildWhereClause();
    this.columnQualifier = prev;
    if (where.sql) {
      parts.push(where.sql);
      params.push(...where.params);
    }

    // Add has conditions (translated to subqueries)
    const hasSql = this.buildHasConditionsSQL(tableName);
    if (hasSql.sql) {
      if (!where.sql) {
        // need a WHERE prefix
        parts.push('WHERE 1=1');
      }
      parts.push(hasSql.sql);
      params.push(...hasSql.params);
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
    if (getDbType() === 'mongodb') return this.countMongo();
    const tableName = (this.model as typeof Model).getTable();
    const prev = this.columnQualifier;
    this.columnQualifier = tableName;
    const where = this.buildWhereClause();
    this.columnQualifier = prev;
    const hasSql = this.buildHasConditionsSQL(tableName);
    const parts: string[] = [`SELECT COUNT(*) as count FROM ${tableName}`];
    const params: any[] = [];
    if (where.sql) {
      parts.push(where.sql);
      params.push(...where.params);
    }
    if (hasSql.sql) {
      if (!where.sql) parts.push('WHERE 1=1');
      parts.push(hasSql.sql);
      params.push(...hasSql.params);
    }
    const sql = parts.join(' ').trim();
    const rows = await dbQuery<any>(sql, params);
    const countRow = rows[0] as any;
    return countRow ? Number(countRow.count) : 0;
  }

  private async loadRelationships(models: T[]): Promise<void> {
    for (const [relation, options] of this.withRelations) {
      await this.loadRelationship(models, relation, options);
    }
  }

  // Replace old single-level nested loader with recursive tree loader
  private async loadRelationTree(
    currentModels: any[],
    tree: Record<string, any>,
    parentPath: string
  ): Promise<void> {
    if (!currentModels.length) return;
    for (const relName of Object.keys(tree)) {
      const currentPath = parentPath ? `${parentPath}.${relName}` : relName;
      const options = this.relationPathOptions.get(currentPath) || {};
      // Determine if relation is top-level or deeper
      if (parentPath === '') {
        // Already loaded top-level in loadRelationships; skip duplicate load unless options provided that weren't applied
        if (options.constraints || options.columns) {
          // Re-load with constraints if user passed options specifically for full path
          await this.loadRelationship(currentModels, relName, options);
        }
      } else {
        // Need to load relation on nested model instances
        // Build a temporary builder for nested model type
        const sampleModel = currentModels.find(
          m => typeof m?.getRelationship === 'function' && m.getRelationship(relName)
        );
        if (!sampleModel) continue;
        const tmpBuilder = new EloquentBuilder(sampleModel.constructor as typeof Model);
        await tmpBuilder.loadRelationship(currentModels as any, relName, options);
      }
      // Gather child instances to recurse
      const childContainer: any[] = [];
      currentModels.forEach(m => {
        const loaded = (m as any).relationshipsLoaded?.[relName];
        if (!loaded) return;
        if (Array.isArray(loaded)) childContainer.push(...loaded);
        else childContainer.push(loaded);
      });
      // Recurse into subtree
      const subtree = tree[relName];
      if (subtree && Object.keys(subtree).length > 0 && childContainer.length > 0) {
        await this.loadRelationTree(childContainer, subtree, currentPath);
      }
    }
  }

  private setRelation(model: T, name: string, value: any) {
    (model as any).relationshipsLoaded = (model as any).relationshipsLoaded || {};
    (model as any).relationshipsLoaded[name] = value;
  }

  // Make loadRelationship public so nested loader can instantiate a new builder and reuse logic
  public async loadRelationship(
    models: T[],
    relation: string,
    options: EagerLoadOptions = {}
  ): Promise<void> {
    if (!models.length) return;
    const sampleModel = models[0];
    const rel = (sampleModel as any).getRelationship(relation);
    if (!rel) {
      console.warn(
        `Relationship "${relation}" not found for model ${(sampleModel as any).constructor?.name || 'Unknown'}`
      );
      return;
    }
    const relatedModel = rel.model as typeof Model;
    const relatedTable = (relatedModel as typeof Model).getTable();
    const relatedPK = (relatedModel as any).primaryKey as string;

    if (rel.type === 'hasOne') {
      if (getDbType() === 'mongodb')
        await this.loadHasOneMongo(
          models,
          relation,
          rel,
          relatedModel,
          relatedTable,
          relatedPK,
          options
        );
      else
        await this.loadHasOne(
          models,
          relation,
          rel,
          relatedModel,
          relatedTable,
          relatedPK,
          options
        );
    } else if (rel.type === 'hasMany') {
      if (getDbType() === 'mongodb')
        await this.loadHasManyMongo(
          models,
          relation,
          rel,
          relatedModel,
          relatedTable,
          relatedPK,
          options
        );
      else
        await this.loadHasMany(
          models,
          relation,
          rel,
          relatedModel,
          relatedTable,
          relatedPK,
          options
        );
    } else if (rel.type === 'belongsTo') {
      if (getDbType() === 'mongodb')
        await this.loadBelongsToMongo(
          models,
          relation,
          rel,
          relatedModel,
          relatedTable,
          relatedPK,
          options
        );
      else
        await this.loadBelongsTo(
          models,
          relation,
          rel,
          relatedModel,
          relatedTable,
          relatedPK,
          options
        );
    } else if (rel.type === 'belongsToMany') {
      if (getDbType() === 'mongodb')
        await this.loadBelongsToManyMongo(
          models,
          relation,
          rel,
          relatedModel,
          relatedTable,
          relatedPK,
          options
        );
      else
        await this.loadBelongsToMany(
          models,
          relation,
          rel,
          relatedModel,
          relatedTable,
          relatedPK,
          options
        );
    } else if (rel.type === 'morphOne' || rel.type === 'morphMany') {
      if (getDbType() === 'mongodb')
        await this.loadMorphRelationsMongo(
          models,
          relation,
          rel,
          relatedModel,
          relatedTable,
          relatedPK,
          options
        );
      else
        await this.loadMorphRelations(
          models,
          relation,
          rel,
          relatedModel,
          relatedTable,
          relatedPK,
          options
        );
    }
  }

  private async loadHasOne(
    models: T[],
    relation: string,
    rel: any,
    relatedModel: typeof Model,
    relatedTable: string,
    relatedPK: string,
    options: EagerLoadOptions
  ): Promise<void> {
    const localKey = rel.localKey || (this.model as any).primaryKey || 'id';
    const foreignKey = rel.foreignKey || `${(this.model as typeof Model).getTable()}_id`;
    const localIds = Array.from(
      new Set(
        models.map(m => (m as any).getAttribute(localKey)).filter((v: any) => v !== undefined)
      )
    );

    if (!localIds.length) return;

    const placeholders = localIds.map(() => '?').join(',');
    let sql = `SELECT * FROM ${relatedTable} WHERE ${foreignKey} IN (${placeholders})`;
    // Soft delete constraint when related model supports it and not overriding
    if ((relatedModel as any).softDeletes && !options.constraints) {
      sql += ' AND deleted_at IS NULL';
    }
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

  private async loadHasMany(
    models: T[],
    relation: string,
    rel: any,
    relatedModel: typeof Model,
    relatedTable: string,
    relatedPK: string,
    options: EagerLoadOptions
  ): Promise<void> {
    const localKey = rel.localKey || (this.model as any).primaryKey || 'id';
    const foreignKey = rel.foreignKey || `${(this.model as typeof Model).getTable()}_id`;
    const localIds = Array.from(
      new Set(
        models.map(m => (m as any).getAttribute(localKey)).filter((v: any) => v !== undefined)
      )
    );

    if (!localIds.length) {
      models.forEach(m => this.setRelation(m, relation, []));
      return;
    }

    const placeholders = localIds.map(() => '?').join(',');
    let sql = `SELECT * FROM ${relatedTable} WHERE ${foreignKey} IN (${placeholders})`;
    if ((relatedModel as any).softDeletes && !options.constraints) {
      sql += ' AND deleted_at IS NULL';
    }
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
    const grouped = new Map<any, any>();
    rows.forEach(r => {
      const k = r[foreignKey];
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k)!.push(r);
    });

    models.forEach(m => {
      const key = (m as any).getAttribute(localKey);
      const list = (grouped.get(key) || []).map((row: any) => {
        const inst = new (relatedModel as any)();
        inst.hydrate(row);
        return inst;
      });
      this.setRelation(m, relation, list);
    });
  }

  private async loadBelongsTo(
    models: T[],
    relation: string,
    rel: any,
    relatedModel: typeof Model,
    relatedTable: string,
    relatedPK: string,
    options: EagerLoadOptions
  ): Promise<void> {
    const foreignKey = rel.foreignKey || `${relation}_id`;
    const ownerKey = rel.ownerKey || relatedPK || 'id';
    const foreignIds = Array.from(
      new Set(
        models
          .map(m => (m as any).getAttribute(foreignKey))
          .filter((v: any) => v !== undefined && v !== null)
      )
    );

    if (!foreignIds.length) {
      models.forEach(m => this.setRelation(m, relation, null));
      return;
    }

    const placeholders = foreignIds.map(() => '?').join(',');
    let sql = `SELECT * FROM ${relatedTable} WHERE ${ownerKey} IN (${placeholders})`;
    if ((relatedModel as any).softDeletes && !options.constraints) {
      sql += ' AND deleted_at IS NULL';
    }
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

  private async loadBelongsToMany(
    models: T[],
    relation: string,
    rel: any,
    relatedModel: typeof Model,
    relatedTable: string,
    relatedPK: string,
    options: EagerLoadOptions
  ): Promise<void> {
    // SQL implementation (no Mongo calls). Mongo handled separately in loadBelongsToManyMongo.
    const pivotTable = rel.table;
    const parentPK = (this.model as any).primaryKey || 'id';
    const foreignPivotKey = rel.foreignKey || `${(this.model as any).getTable()}_id`;
    const relatedPivotKey = rel.relatedKey || `${relatedTable}_id`;
    const parentIds = Array.from(
      new Set(
        models
          .map(m => (m as any).getAttribute(parentPK))
          .filter((v: any) => v !== undefined && v !== null)
      )
    );
    if (!parentIds.length) {
      models.forEach(m => this.setRelation(m, relation, []));
      return;
    }

    const parentPlaceholders = parentIds.map(() => '?').join(',');
    let pivotSql = `SELECT ${foreignPivotKey} AS parent_id, ${relatedPivotKey} AS related_id FROM ${pivotTable} WHERE ${foreignPivotKey} IN (${parentPlaceholders})`;
    const pivotParams: any[] = [...parentIds];

    // Apply constraints to related rows after pivot fetch (not to pivot query itself)
    const pivotRows = await dbQuery<any>(pivotSql, pivotParams);
    if (!pivotRows.length) {
      models.forEach(m => this.setRelation(m, relation, []));
      return;
    }

    const relatedIds = Array.from(new Set(pivotRows.map((r: any) => r.related_id)));
    const relatedPlaceholders = relatedIds.map(() => '?').join(',');
    let relatedSql = `SELECT * FROM ${relatedTable} WHERE ${relatedPK} IN (${relatedPlaceholders})`;
    if ((relatedModel as any).softDeletes && !options.constraints) {
      relatedSql += ' AND deleted_at IS NULL';
    }
    const relatedParams: any[] = [...relatedIds];

    // Constraints: use builder to build WHERE on related table
    if (options.constraints) {
      const constraintBuilder = new EloquentBuilder(relatedModel);
      options.constraints(constraintBuilder);
      const constraintWhere = (constraintBuilder as any).buildWhereClause();
      if (constraintWhere.sql) {
        // constraintWhere.sql already starts with ' WHERE', so replace with AND for existing WHERE
        relatedSql += constraintWhere.sql.replace('WHERE', 'AND');
        relatedParams.push(...constraintWhere.params);
      }
    }

    const relatedRows = await dbQuery<any>(relatedSql, relatedParams);
    const relatedMap = new Map<any, any>();
    relatedRows.forEach(r => relatedMap.set(r[relatedPK], r));

    const grouped = new Map<any, any[]>();
    pivotRows.forEach(p => {
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

  private async loadBelongsToManyMongo(
    models: T[],
    relation: string,
    rel: any,
    relatedModel: typeof Model,
    relatedTable: string,
    relatedPK: string,
    options: EagerLoadOptions
  ): Promise<void> {
    const pivotTable = rel.table;
    const parentPK = (this.model as any).primaryKey || 'id';
    const foreignPivotKey = rel.foreignKey || `${(this.model as any).getTable()}_id`;
    const relatedPivotKey = rel.relatedKey || `${relatedTable}_id`;
    const parentRaw = models
      .map(m => (m as any).getAttribute(parentPK))
      .filter((v: any) => v !== undefined && v !== null);
    if (!parentRaw.length) {
      models.forEach(m => this.setRelation(m, relation, []));
      return;
    }
    const parentMatch =
      parentPK === 'id'
        ? Array.from(new Set(parentRaw.flatMap(v => this.expandIdForms(v))))
        : Array.from(new Set(parentRaw));
    const pc = mongoCollection(pivotTable);
    const pivots = await pc.find({ [foreignPivotKey]: { $in: parentMatch } }).toArray();
    if (!pivots.length) {
      models.forEach(m => this.setRelation(m, relation, []));
      return;
    }
    // Gather related ids, allow string/number forms
    const relatedTokens = Array.from(new Set(pivots.map((p: any) => String(p[relatedPivotKey]))));
    const rc = mongoCollection(relatedTable);
    let rows: any[] = [];
    if (relatedPK === 'id') {
      const oidList: ObjectId[] = [];
      const shortTokens: string[] = [];
      relatedTokens.forEach(s => {
        if (/^[0-9a-fA-F]{24}$/.test(s)) {
          try {
            oidList.push(new ObjectId(s));
          } catch {}
        }
        if (/^[0-9a-fA-F]{1,8}$/.test(s)) {
          shortTokens.push(s);
        }
      });
      const or: any[] = [];
      if (oidList.length) or.push({ _id: { $in: oidList } });
      if (shortTokens.length) {
        const tokenSet = Array.from(new Set(shortTokens));
        const prefixExprs = tokenSet.map(t => ({
          $expr: { $eq: [{ $substrBytes: [{ $toString: '$_id' }, 0, t.length] }, t] },
        }));
        or.push(...prefixExprs);
      }
      rows = await rc.find(or.length ? { $or: or } : {}).toArray();
    } else {
      rows = await rc.find({ [relatedPK]: { $in: relatedTokens } as any }).toArray();
    }
    const rmap = new Map<any, any>();
    rows.forEach(r => {
      if (r && r._id && !('id' in r)) r.id = String(r._id);
      const idStr = String(r._id);
      const token = idStr.slice(0, 8);
      rmap.set(idStr, r);
      rmap.set(token, r);
    });
    const grouped = new Map<any, any[]>();
    pivots.forEach((p: any) => {
      const pidVal = p[foreignPivotKey];
      const pidStr = String(pidVal);
      const ridStr = String(p[relatedPivotKey]);
      const relRow = rmap.get(ridStr) || rmap.get(String(ridStr));
      if (relRow) {
        if (!grouped.has(pidVal)) grouped.set(pidVal, []);
        grouped.get(pidVal)!.push(relRow);
        // also index by string form of parent id for lookup flexibility
        if (!grouped.has(pidStr)) grouped.set(pidStr, []);
        grouped.get(pidStr)!.push(relRow);
      }
    });
    models.forEach(m => {
      const pid = (m as any).getAttribute(parentPK);
      const forms = parentPK === 'id' ? this.expandIdForms(pid) : [pid];
      const seen = new Set<string>();
      const collected: any[] = [];
      forms.forEach(f => {
        const fStr = String(f);
        const arr = grouped.get(f) || grouped.get(fStr) || [];
        for (const r of arr) {
          const sid = r._id ? String(r._id) : JSON.stringify(r);
          if (!seen.has(sid)) {
            seen.add(sid);
            collected.push(r);
          }
        }
      });
      const list = collected.map(row => {
        const inst = new (relatedModel as any)();
        inst.hydrate(row);
        return inst;
      });
      this.setRelation(m, relation, list);
    });
  }

  private async loadMorphRelations(
    models: T[],
    relation: string,
    rel: any,
    relatedModel: typeof Model,
    relatedTable: string,
    relatedPK: string,
    options: EagerLoadOptions
  ): Promise<void> {
    // Implementation for morph relationships
    // This is a simplified version - you can expand this based on your needs
    const morphType = rel.morphName || (this.model as typeof Model).getTable();
    const foreignKey = rel.foreignKey || `${morphType}_id`;
    const morphTypeKey = rel.morphType || `${morphType}_type`;

    const localIds = Array.from(
      new Set(models.map(m => (m as any).getAttribute('id')).filter((v: any) => v !== undefined))
    );

    if (!localIds.length) {
      models.forEach(m => this.setRelation(m, relation, rel.type === 'morphOne' ? null : []));
      return;
    }

    const placeholders = localIds.map(() => '?').join(',');
    let sql = `SELECT * FROM ${relatedTable} WHERE ${foreignKey} IN (${placeholders}) AND ${morphTypeKey} = ?`;
    if ((relatedModel as any).softDeletes && !options.constraints) {
      sql += ' AND deleted_at IS NULL';
    }
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
    } else {
      // morphMany
      const grouped = new Map<any, any[]>();
      rows.forEach(r => {
        const k = r[foreignKey];
        if (r && r._id && !('id' in r)) r.id = String(r._id);
        if (!grouped.has(k)) grouped.set(k, []);
        grouped.get(k)!.push(r);
        const ks = String(k);
        if (!grouped.has(ks)) grouped.set(ks, []);
        grouped.get(ks)!.push(r);
      });
      models.forEach(m => {
        const key = (m as any).getAttribute('id');
        const keys = this.expandIdForms(key).map(v => String(v));
        const acc: any[] = [];
        keys.forEach(k => {
          const arr = grouped.get(k) || [];
          if (arr.length) acc.push(...arr);
        });
        const uniq = Array.from(
          new Set(acc.map(x => (x._id ? String(x._id) : JSON.stringify(x))))
        ).map(id => acc.find(x => (x._id ? String(x._id) : JSON.stringify(x)) === id));
        const list = uniq.map(row => {
          const inst = new (relatedModel as any)();
          inst.hydrate(row!);
          return inst;
        });
        this.setRelation(m, relation, list);
      });
    }
  }

  // ------- Mongo helpers -------
  private normalizeField(field: string): string {
    const pk = (this.model as any).primaryKey || 'id';
    if (field === pk && pk === 'id') return '_id';
    return field;
  }

  private coerceId(val: any) {
    if (val === null || val === undefined) return val;
    try {
      return new ObjectId(String(val));
    } catch {
      return val;
    }
  }

  // NEW: detect *_id like fields (including primary id)
  private isIdLikeField(field: string): boolean {
    const f = this.normalizeField(field);
    return f === '_id' || /_id$/i.test(f);
  }

  // NEW: coerce values to ObjectId when targeting *_id fields
  private coerceForField(field: string, val: any): any {
    if (val === null || val === undefined) return val;
    if (!this.isIdLikeField(field)) return val;
    if (val instanceof ObjectId) return val;
    const s = String(val);
    if (/^[0-9a-fA-F]{24}$/.test(s)) {
      try {
        return new ObjectId(s);
      } catch {
        return val;
      }
    }
    return val;
  }

  // Expand possible stored forms for an id-like value used in non-_id fields
  // e.g., '69199330e91394e0bc375674' -> ['69199330e91394e0bc375674', ObjectId(...), '69199330', 69199330]
  private expandIdForms(val: any): any[] {
    const out: any[] = [];
    const s = String(val);
    // original
    out.push(val);
    // string
    out.push(s);
    // numeric if digits
    if (/^\d+$/.test(s)) {
      const n = Number(s);
      if (!Number.isNaN(n)) out.push(n);
    }
    // objectId
    try {
      out.push(new ObjectId(s));
    } catch {
      /*noop*/
    }
    // first8 from 24-hex
    if (/^[0-9a-fA-F]{24}$/.test(s)) {
      const first8 = s.slice(0, 8);
      out.push(first8);
      const n2 = Number(first8);
      if (!Number.isNaN(n2)) out.push(n2);
    }
    return Array.from(new Set(out));
  }

  private buildMongoFilter(): any {
    // Inject soft delete filter (Mongo) if supported and not including trashed and not onlyTrashed
    if (
      !this.appliedSoftDeleteFilter &&
      (this.model as any).softDeletes &&
      !this.includeTrashed &&
      !this.onlyTrashedFlag &&
      !this.whereClauses.some(w => w.column === 'deleted_at')
    ) {
      this.whereClauses.push({ column: 'deleted_at', operator: '=', value: null, boolean: 'and' });
      this.appliedSoftDeleteFilter = true;
    }
    if (!this.whereClauses.length) return {};
    const andParts: any[] = [];
    const orParts: any[] = [];

    const toFilter = (w: WhereClause): any => {
      const op = (w.operator || '=').toLowerCase();
      const col = this.normalizeField(w.column);
      if (op === 'nested' && Array.isArray(w.value)) {
        const nestedClauses = w.value as WhereClause[];
        const nestedBuilder = new EloquentBuilder<T>(this.model as any);
        (nestedBuilder as any).whereClauses = nestedClauses;
        return nestedBuilder.buildMongoFilter();
      }
      if (Array.isArray(w.value) && (op === 'in' || op === 'not in')) {
        const arr = w.value.map(v =>
          this.isIdLikeField(w.column)
            ? this.coerceForField(w.column, v)
            : col === '_id'
              ? this.coerceId(v)
              : v
        );
        return { [col]: op === 'in' ? { $in: arr } : { $nin: arr } };
      }
      if (Array.isArray(w.value) && (op === 'between' || op === 'not between')) {
        const [a, b] = w.value;
        if (op === 'between') return { [col]: { $gte: a, $lte: b } };
        return { $or: [{ [col]: { $lt: a } }, { [col]: { $gt: b } }] };
      }
      if (w.value === null) {
        if (op === '=') return { [col]: null };
        if (op === '!=' || op === '<>') return { [col]: { $ne: null } };
      }
      // simple ops
      let v = this.isIdLikeField(w.column)
        ? this.coerceForField(w.column, w.value)
        : col === '_id'
          ? this.coerceId(w.value)
          : w.value;
      switch (op) {
        case '=':
          return { [col]: v };
        case '!=':
        case '<>':
          return { [col]: { $ne: v } };
        case '>':
          return { [col]: { $gt: v } };
        case '>=':
          return { [col]: { $gte: v } };
        case '<':
          return { [col]: { $lt: v } };
        case '<=':
          return { [col]: { $lte: v } };
        case 'like':
          return { [col]: { $regex: String(v).replace(/%/g, '.*'), $options: 'i' } };
        default:
          return { [col]: v };
      }
    };

    for (const w of this.whereClauses) {
      const f = toFilter(w);
      if (!f || Object.keys(f).length === 0) continue;
      if ((w.boolean || 'and') === 'or') orParts.push(f);
      else andParts.push(f);
    }

    if (orParts.length && andParts.length) return { $and: [{ $and: andParts }, { $or: orParts }] };
    if (orParts.length) return { $or: orParts };
    if (andParts.length) return { $and: andParts };
    return {};
  }

  private async executeQueryMongo(): Promise<any[]> {
    const tableName = (this.model as typeof Model).getTable();
    const c = mongoCollection(tableName);
    const filter = this.buildMongoFilter();
    const proj =
      this.selectedColumns && this.selectedColumns.length && this.selectedColumns[0] !== '*'
        ? Object.fromEntries(this.selectedColumns.map(k => [this.normalizeField(k), 1]))
        : undefined;
    let cursor = c.find(filter, proj ? { projection: proj } : undefined);
    if (this.orderByColumn) {
      cursor = cursor.sort({
        [this.normalizeField(this.orderByColumn)]: this.orderByDirection === 'asc' ? 1 : -1,
      });
    }
    if (this.offsetValue !== undefined) cursor = cursor.skip(this.offsetValue);
    if (this.limitValue !== undefined) cursor = cursor.limit(this.limitValue);
    let docs = await cursor.toArray();
    docs = docs.map(d => {
      if (d && d._id && !('id' in d)) d.id = String(d._id);
      return d;
    });
    // Post-filter by whereHas/whereDoesntHave conditions for Mongo
    if (this.hasConditions.length) {
      docs = await this.applyHasConditionsMongo(docs);
    }
    return docs;
  }

  private async updateMongo(values: Partial<Record<string, any>>): Promise<number> {
    const tableName = (this.model as typeof Model).getTable();
    const c = mongoCollection(tableName);
    const filter = this.buildMongoFilter();
    let updateDoc: any;
    if (
      Object.values(values).some(
        v => v && typeof v === 'object' && ('$inc' in (v as any) || '$dec' in (v as any))
      )
    ) {
      // support increment-like doc
      updateDoc = {};
      for (const [k, v] of Object.entries(values)) {
        if (v && typeof v === 'object' && (v as any).$inc !== undefined) {
          updateDoc.$inc = updateDoc.$inc || {};
          (updateDoc.$inc as any)[this.normalizeField(k)] = (v as any).$inc;
        } else if (v && typeof v === 'object' && (v as any).$dec !== undefined) {
          updateDoc.$inc = updateDoc.$inc || {};
          (updateDoc.$inc as any)[this.normalizeField(k)] = -(v as any).$dec;
        } else {
          updateDoc.$set = updateDoc.$set || {};
          (updateDoc.$set as any)[this.normalizeField(k)] = this.coerceForField(k, v as any);
        }
      }
    } else {
      updateDoc = {
        $set: Object.fromEntries(
          Object.entries(values).map(([k, v]) => [
            this.normalizeField(k),
            this.coerceForField(k, v),
          ])
        ),
      };
    }
    const res = await c.updateMany(filter, updateDoc);
    return Number(res.modifiedCount || 0);
  }

  private async deleteMongo(): Promise<number> {
    const tableName = (this.model as typeof Model).getTable();
    const c = mongoCollection(tableName);
    const filter = this.buildMongoFilter();
    const supportsSoft = Boolean((this.model as any).softDeletes);
    if (supportsSoft) {
      const res = await c.updateMany(filter, { $set: { deleted_at: new Date() } });
      return Number(res.modifiedCount || 0);
    }
    const res = await c.deleteMany(filter);
    return Number(res.deletedCount || 0);
  }

  private async insertMongoMany(rows: Array<Record<string, any>>): Promise<number> {
    const tableName = (this.model as typeof Model).getTable();
    const c = mongoCollection(tableName);
    const docs = rows.map(r => {
      const d: any = { ...r };
      if ('id' in d && d.id && !d._id) {
        try {
          d._id = new ObjectId(String(d.id));
        } catch {
          d._id = d.id;
        }
        delete d.id;
      }
      // normalize any *_id fields to ObjectId when possible
      Object.keys(d).forEach(k => {
        if (/_id$/i.test(k) && d[k] !== undefined && d[k] !== null) {
          const v = d[k];
          if (!(v instanceof ObjectId)) {
            const s = String(v);
            if (/^[0-9a-fA-F]{24}$/.test(s)) {
              try {
                d[k] = new ObjectId(s);
              } catch {
                /* ignore */
              }
            }
          }
        }
      });
      return d;
    });
    const res = await c.insertMany(docs);
    return Object.keys(res.insertedIds || {}).length;
  }

  private async countMongo(): Promise<number> {
    const tableName = (this.model as typeof Model).getTable();
    const c = mongoCollection(tableName);
    const filter = this.buildMongoFilter();
    if (!this.hasConditions.length) {
      return await c.countDocuments(filter);
    }
    // When whereHas/whereDoesntHave exist, fetch minimal docs and post-filter
    let docs = await c.find(filter, { projection: { _id: 1 } }).toArray();
    docs = docs.map(d => {
      if (d && d._id && !('id' in d)) d.id = String(d._id);
      return d;
    });
    const kept = await this.applyHasConditionsMongo(docs);
    return kept.length;
  }

  private async aggregateMongo(fn: string, column: string): Promise<string> {
    const tableName = (this.model as typeof Model).getTable();
    const c = mongoCollection(tableName);
    const filter = this.buildMongoFilter();
    const field = this.normalizeField(column);
    const pipeline: any[] = [{ $match: filter }];
    const map: any = {
      count: { $sum: 1 },
      sum: { $sum: `$${field}` },
      avg: { $avg: `$${field}` },
      max: { $max: `$${field}` },
      min: { $min: `$${field}` },
    };
    const key = fn.toLowerCase();
    if (key === 'count') return String(await c.countDocuments(filter));
    pipeline.push({ $group: { _id: null, agg: map[key] } });
    const res = await c.aggregate(pipeline).toArray();
    return String(res[0]?.agg ?? 0);
  }

  // Mongo relation loaders
  private async loadHasOneMongo(
    models: T[],
    relation: string,
    rel: any,
    relatedModel: typeof Model,
    relatedTable: string,
    relatedPK: string,
    options: EagerLoadOptions
  ): Promise<void> {
    const localKey = rel.localKey || (this.model as any).primaryKey || 'id';
    const foreignKey = rel.foreignKey || `${(this.model as typeof Model).getTable()}_id`;
    const localsRaw = models
      .map(m => (m as any).getAttribute(localKey))
      .filter((v: any) => v !== undefined && v !== null);
    if (!localsRaw.length) return;
    let matchVals: any[] = Array.from(new Set(localsRaw));
    // If comparing id to non-_id foreign key, expand forms to handle first8/number cases
    if (localKey === 'id') {
      matchVals = Array.from(new Set(localsRaw.flatMap(v => this.expandIdForms(v))));
    }
    const c = mongoCollection(relatedTable);
    const rows = await c.find({ [foreignKey]: { $in: matchVals } }).toArray();
    const byFK = new Map<any, any>();
    rows.forEach(r => {
      if (r && r._id && !('id' in r)) r.id = String(r._id);
      byFK.set(r[foreignKey], r);
    });
    // Also map stringified values for robustness
    rows.forEach(r => {
      byFK.set(String(r[foreignKey]), r);
    });
    models.forEach(m => {
      const key = (m as any).getAttribute(localKey);
      const candidates = this.expandIdForms(key)
        .map(v => byFK.get(v) || byFK.get(String(v)))
        .filter(Boolean);
      const row = candidates[0] || null;
      if (row) {
        const inst = new (relatedModel as any)();
        inst.hydrate(row);
        this.setRelation(m, relation, inst);
      } else this.setRelation(m, relation, null);
    });
  }

  private async loadHasManyMongo(
    models: T[],
    relation: string,
    rel: any,
    relatedModel: typeof Model,
    relatedTable: string,
    relatedPK: string,
    options: EagerLoadOptions
  ): Promise<void> {
    const localKey = rel.localKey || (this.model as any).primaryKey || 'id';
    const foreignKey = rel.foreignKey || `${(this.model as typeof Model).getTable()}_id`;
    const localsRaw = models
      .map(m => (m as any).getAttribute(localKey))
      .filter((v: any) => v !== undefined && v !== null);
    if (!localsRaw.length) {
      models.forEach(m => this.setRelation(m, relation, []));
      return;
    }
    let matchVals: any[] = Array.from(new Set(localsRaw));
    if (localKey === 'id')
      matchVals = Array.from(new Set(localsRaw.flatMap(v => this.expandIdForms(v))));
    const c = mongoCollection(relatedTable);
    const rows = await c.find({ [foreignKey]: { $in: matchVals } }).toArray();
    const grouped = new Map<any, any>();
    rows.forEach(r => {
      if (r && r._id && !('id' in r)) r.id = String(r._id);
      const k = r[foreignKey];
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k)!.push(r);
      // also index by string key
      const ks = String(k);
      if (!grouped.has(ks)) grouped.set(ks, []);
      grouped.get(ks)!.push(r);
    });
    models.forEach(m => {
      const key = (m as any).getAttribute(localKey);
      const keys = this.expandIdForms(key).map(v => String(v));
      const acc: any[] = [];
      keys.forEach(k => {
        const arr = grouped.get(k) || grouped.get(key) || [];
        if (arr.length) acc.push(...arr);
      });
      const uniq = Array.from(
        new Set(acc.map(x => (x._id ? String(x._id) : JSON.stringify(x))))
      ).map(id => acc.find(x => (x._id ? String(x._id) : JSON.stringify(x)) === id));
      const list = uniq.map(row => {
        const inst = new (relatedModel as any)();
        inst.hydrate(row!);
        return inst;
      });
      this.setRelation(m, relation, list);
    });
  }

  private async loadBelongsToMongo(
    models: T[],
    relation: string,
    rel: any,
    relatedModel: typeof Model,
    relatedTable: string,
    relatedPK: string,
    options: EagerLoadOptions
  ): Promise<void> {
    const foreignKey = rel.foreignKey || `${relation}_id`;
    const ownerKey = rel.ownerKey || relatedPK || 'id';
    const foreignIdsRaw = models
      .map(m => (m as any).getAttribute(foreignKey))
      .filter((v: any) => v !== undefined && v !== null);
    if (!foreignIdsRaw.length) {
      models.forEach(m => this.setRelation(m, relation, null));
      return;
    }
    const c = mongoCollection(relatedTable);
    let rows: any[] = [];
    if (ownerKey === 'id') {
      // Separate clearly valid ObjectIds and short ids (first8 digits stored)
      const asStrings = foreignIdsRaw.map((v: any) => String(v));
      const oidList: ObjectId[] = [];
      const shortTokens: string[] = [];
      asStrings.forEach(s => {
        if (/^[0-9a-fA-F]{24}$/.test(s)) {
          try {
            oidList.push(new ObjectId(s));
          } catch {}
        }
        // accept any token length up to 8 for prefix match
        if (/^[0-9a-fA-F]{1,8}$/.test(s)) {
          shortTokens.push(s);
        }
      });
      const or: any[] = [];
      if (oidList.length) or.push({ _id: { $in: oidList } });
      if (shortTokens.length) {
        const tokenSet = Array.from(new Set(shortTokens));
        const prefixExprs = tokenSet.map(t => ({
          $expr: { $eq: [{ $substrBytes: [{ $toString: '$_id' }, 0, t.length] }, t] },
        }));
        or.push(...prefixExprs);
      }
      rows = await c.find(or.length ? { $or: or } : {}).toArray();
    } else {
      const ids = Array.from(new Set(foreignIdsRaw));
      rows = await c.find({ [ownerKey]: { $in: ids } as any }).toArray();
    }
    const map = new Map<any, any>();
    rows.forEach(r => {
      if (r && r._id && !('id' in r)) r.id = String(r._id);
      map.set(String(r._id), r);
    });
    // also map by first8 token to support numeric/digit matching
    rows.forEach(r => {
      const token = String(r._id).slice(0, 8);
      map.set(token, r);
    });
    models.forEach(m => {
      const fk = (m as any).getAttribute(foreignKey);
      const candidates = this.expandIdForms(fk)
        .map(v => map.get(String(v)))
        .filter(Boolean);
      const row = candidates[0] || null;
      if (row) {
        const inst = new (relatedModel as any)();
        inst.hydrate(row);
        this.setRelation(m, relation, inst);
      } else this.setRelation(m, relation, null);
    });
  }

  private async loadBelongsToManyMongo_(
    models: T[],
    relation: string,
    rel: any,
    relatedModel: typeof Model,
    relatedTable: string,
    relatedPK: string,
    options: EagerLoadOptions
  ): Promise<void> {
    const pivotTable = rel.table;
    const parentPK = (this.model as any).primaryKey || 'id';
    const foreignPivotKey = rel.foreignKey || `${(this.model as any).getTable()}_id`;
    const relatedPivotKey = rel.relatedKey || `${relatedTable}_id`;
    const parentRaw = models
      .map(m => (m as any).getAttribute(parentPK))
      .filter((v: any) => v !== undefined && v !== null);
    if (!parentRaw.length) {
      models.forEach(m => this.setRelation(m, relation, []));
      return;
    }
    const parentMatch =
      parentPK === 'id'
        ? Array.from(new Set(parentRaw.flatMap(v => this.expandIdForms(v))))
        : Array.from(new Set(parentRaw));
    const pc = mongoCollection(pivotTable);
    const pivots = await pc.find({ [foreignPivotKey]: { $in: parentMatch } }).toArray();
    if (!pivots.length) {
      models.forEach(m => this.setRelation(m, relation, []));
      return;
    }
    // Gather related ids, allow string/number forms
    const relatedTokens = Array.from(new Set(pivots.map((p: any) => String(p[relatedPivotKey]))));
    const rc = mongoCollection(relatedTable);
    let rows: any[] = [];
    if (relatedPK === 'id') {
      const oidList: ObjectId[] = [];
      const shortTokens: string[] = [];
      relatedTokens.forEach(s => {
        if (/^[0-9a-fA-F]{24}$/.test(s)) {
          try {
            oidList.push(new ObjectId(s));
          } catch {}
        }
        if (/^[0-9a-fA-F]{1,8}$/.test(s)) {
          shortTokens.push(s);
        }
      });
      const or: any[] = [];
      if (oidList.length) or.push({ _id: { $in: oidList } });
      if (shortTokens.length) {
        const tokenSet = Array.from(new Set(shortTokens));
        const prefixExprs = tokenSet.map(t => ({
          $expr: { $eq: [{ $substrBytes: [{ $toString: '$_id' }, 0, t.length] }, t] },
        }));
        or.push(...prefixExprs);
      }
      rows = await rc.find(or.length ? { $or: or } : {}).toArray();
    } else {
      rows = await rc.find({ [relatedPK]: { $in: relatedTokens } as any }).toArray();
    }
    const rmap = new Map<any, any>();
    rows.forEach(r => {
      if (r && r._id && !('id' in r)) r.id = String(r._id);
      const idStr = String(r._id);
      const token = idStr.slice(0, 8);
      rmap.set(idStr, r);
      rmap.set(token, r);
    });
    const grouped = new Map<any, any[]>();
    pivots.forEach((p: any) => {
      const pidVal = p[foreignPivotKey];
      const pidStr = String(pidVal);
      const ridStr = String(p[relatedPivotKey]);
      const relRow = rmap.get(ridStr) || rmap.get(String(ridStr));
      if (relRow) {
        if (!grouped.has(pidVal)) grouped.set(pidVal, []);
        grouped.get(pidVal)!.push(relRow);
        // also index by string form of parent id for lookup flexibility
        if (!grouped.has(pidStr)) grouped.set(pidStr, []);
        grouped.get(pidStr)!.push(relRow);
      }
    });
    models.forEach(m => {
      const pid = (m as any).getAttribute(parentPK);
      const forms = parentPK === 'id' ? this.expandIdForms(pid) : [pid];
      const seen = new Set<string>();
      const collected: any[] = [];
      forms.forEach(f => {
        const fStr = String(f);
        const arr = grouped.get(f) || grouped.get(fStr) || [];
        for (const r of arr) {
          const sid = r._id ? String(r._id) : JSON.stringify(r);
          if (!seen.has(sid)) {
            seen.add(sid);
            collected.push(r);
          }
        }
      });
      const list = collected.map(row => {
        const inst = new (relatedModel as any)();
        inst.hydrate(row);
        return inst;
      });
      this.setRelation(m, relation, list);
    });
  }

  private async loadMorphRelationsMongo(
    models: T[],
    relation: string,
    rel: any,
    relatedModel: typeof Model,
    relatedTable: string,
    relatedPK: string,
    options: EagerLoadOptions
  ): Promise<void> {
    const morphType = rel.morphName || (this.model as typeof Model).getTable();
    const foreignKey = rel.foreignKey || `${morphType}_id`;
    const morphTypeKey = rel.morphType || `${morphType}_type`;
    const localsRaw = models
      .map(m => (m as any).getAttribute('id'))
      .filter((v: any) => v !== undefined);
    if (!localsRaw.length) {
      models.forEach(m => this.setRelation(m, relation, rel.type === 'morphOne' ? null : []));
      return;
    }
    const matchVals = Array.from(new Set(localsRaw.flatMap(v => this.expandIdForms(v))));
    const c = mongoCollection(relatedTable);
    const rows = await c
      .find({ [foreignKey]: { $in: matchVals }, [morphTypeKey]: morphType } as any)
      .toArray();
    if (rel.type === 'morphOne') {
      const byFK = new Map<any, any>();
      rows.forEach(r => {
        if (r && r._id && !('id' in r)) r.id = String(r._id);
        byFK.set(r[foreignKey], r);
        byFK.set(String(r[foreignKey]), r);
      });
      models.forEach(m => {
        const key = (m as any).getAttribute('id');
        const cand = this.expandIdForms(key);
        const row = cand.map(v => byFK.get(v) || byFK.get(String(v))).find(Boolean) || null;
        if (row) {
          const inst = new (relatedModel as any)();
          inst.hydrate(row);
          this.setRelation(m, relation, inst);
        } else this.setRelation(m, relation, null);
      });
    } else {
      const grouped = new Map<any, any>();
      rows.forEach(r => {
        const k = r[foreignKey];
        if (r && r._id && !('id' in r)) r.id = String(r._id);
        if (!grouped.has(k)) grouped.set(k, []);
        grouped.get(k)!.push(r);
        const ks = String(k);
        if (!grouped.has(ks)) grouped.set(ks, []);
        grouped.get(ks)!.push(r);
      });
      models.forEach(m => {
        const key = (m as any).getAttribute('id');
        const keys = this.expandIdForms(key).map(v => String(v));
        const acc: any[] = [];
        keys.forEach(k => {
          const arr = grouped.get(k) || [];
          if (arr.length) acc.push(...arr);
        });
        const uniq = Array.from(
          new Set(acc.map(x => (x._id ? String(x._id) : JSON.stringify(x))))
        ).map(id => acc.find(x => (x._id ? String(x._id) : JSON.stringify(x)) === id));
        const list = uniq.map(row => {
          const inst = new (relatedModel as any)();
          inst.hydrate(row!);
          return inst;
        });
        this.setRelation(m, relation, list);
      });
    }
  }
}
