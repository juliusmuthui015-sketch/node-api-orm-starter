// relationships.ts
import { Model } from './Model';
import { EloquentBuilder } from './EloquentBuilder';
import { query as dbQuery, getDbType, collection as mongoCollection } from '@/config/db.config';
import { ObjectId } from 'mongodb';

// Helper: coerce 24-hex strings to ObjectId when writing *_id fields in Mongo
const toObjectIdIfHex = (v: any) => {
  if (v === null || v === undefined) return v;
  if (v instanceof ObjectId) return v;
  const s = String(v);
  if (/^[0-9a-fA-F]{24}$/.test(s)) {
    try {
      return new ObjectId(s);
    } catch {
      /*noop*/
    }
  }
  return v;
};
const coerceFK = (field: string, value: any) =>
  /_id$/i.test(field) ? toObjectIdIfHex(value) : value;

export abstract class Relation<T extends Model> {
  protected builder: EloquentBuilder<T>;
  protected parent: Model;
  protected related: typeof Model;

  constructor(related: typeof Model, parent: Model) {
    this.related = related;
    this.parent = parent;
    this.builder = new EloquentBuilder<T>(related as any);
  }

  abstract getResults(): Promise<T | T[] | null>;

  // Common relation methods
  where(column: string, operator?: any, value?: any): this {
    this.builder.where(column, operator, value);
    return this;
  }

  query(): EloquentBuilder<T> {
    return this.getQuery();
  }

  orWhere(column: string, operator?: any, value?: any): this {
    this.builder.orWhere(column, operator, value);
    return this;
  }

  whereIn(column: string, values: any[]): this {
    this.builder.whereIn(column, values);
    return this;
  }

  whereNotIn(column: string, values: any[]): this {
    this.builder.whereNotIn(column, values);
    return this;
  }

  whereNull(column: string): this {
    this.builder.whereNull(column);
    return this;
  }

  whereNotNull(column: string): this {
    this.builder.whereNotNull(column);
    return this;
  }

  orderBy(column: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.builder.orderBy(column, direction);
    return this;
  }

  latest(column: string = 'created_at'): this {
    this.builder.latest(column);
    return this;
  }

  oldest(column: string = 'created_at'): this {
    this.builder.oldest(column);
    return this;
  }

  limit(limit: number): this {
    this.builder.limit(limit);
    return this;
  }

  offset(offset: number): this {
    this.builder.offset(offset);
    return this;
  }

  with(relations: string | string[] | Record<string, any>): this {
    this.builder.with(relations);
    return this;
  }

  select(columns: string[] | string): this {
    this.builder.select(columns);
    return this;
  }

  async count(): Promise<number> {
    return this.builder.count();
  }

  async exists(): Promise<boolean> {
    return this.builder.exists();
  }

  async doesntExist(): Promise<boolean> {
    return this.builder.doesntExist();
  }

  async first(): Promise<T | null> {
    return this.builder.first();
  }

  getQuery(): EloquentBuilder<T> {
    return this.builder;
  }
}

export class HasOne<T extends Model> extends Relation<T> {
  constructor(
    protected relatedModel: typeof Model,
    protected foreignKey: string,
    protected localKey: string = 'id',
    parent: Model,
  ) {
    super(relatedModel, parent);
  }

  async getResults(): Promise<T | null> {
    const localValue = (this.parent as any).getAttribute(this.localKey);
    if (localValue === undefined || localValue === null) return null;

    this.builder.where(this.foreignKey, localValue);
    return await this.builder.first();
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

    return await this.builder.where(this.foreignKey, localValue).update(attributes);
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
      await this.builder.where(this.foreignKey, localValue).update({ [this.foreignKey]: null });
    } else {
      const foreignValue = (model as any).getAttribute(
        (this.relatedModel as any).primaryKey || 'id',
      );
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
    parent: Model,
  ) {
    super(relatedModel, parent);
  }

  async getResults(): Promise<T[]> {
    const localValue = (this.parent as any).getAttribute(this.localKey);
    if (localValue === undefined || localValue === null) return [];

    this.builder.where(this.foreignKey, localValue);
    return await this.builder.get();
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

  // Collection management
  async attach(model: T | number | string): Promise<void> {
    const dbType = getDbType();
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
    if (dbType === 'mongodb') {
      const c = mongoCollection((this.relatedModel as typeof Model).getTable());
      const pk = (this.relatedModel as any).primaryKey || 'id';
      let filter: any;
      if (pk === 'id') {
        const s = String(relatedId);
        try {
          filter = { _id: new (require('mongodb').ObjectId)(s) };
        } catch {
          filter = { _id: s };
        }
      } else {
        filter = { [pk]: relatedId } as any;
      }
      const fkValue = coerceFK(this.foreignKey, foreignValue);
      await c.updateOne(filter, { $set: { [this.foreignKey]: fkValue } });
      return;
    }
    await dbQuery(
      `UPDATE ${(this.relatedModel as typeof Model).getTable()} SET ${this.foreignKey} = ? WHERE ${(this.relatedModel as any).primaryKey || 'id'} = ?`,
      [foreignValue, relatedId],
    );
  }

  async detach(model?: T | number | string): Promise<number> {
    const foreignValue = (this.parent as any).getAttribute(this.localKey);
    const dbType = getDbType();

    if (model === undefined) {
      // Detach all
      if (dbType === 'mongodb') {
        const c = mongoCollection((this.relatedModel as typeof Model).getTable());
        const res = await c.updateMany(
          { [this.foreignKey]: coerceFK(this.foreignKey, foreignValue) } as any,
          { $set: { [this.foreignKey]: null } },
        );
        return Number(res.modifiedCount || 0);
      }
      return await this.builder
        .where(this.foreignKey, foreignValue)
        .update({ [this.foreignKey]: null });
    }

    let relatedId: number | string;

    if (typeof model === 'number' || typeof model === 'string') {
      relatedId = model;
    } else {
      relatedId = (model as any).getAttribute((this.relatedModel as any).primaryKey || 'id');
    }

    if (dbType === 'mongodb') {
      const c = mongoCollection((this.relatedModel as typeof Model).getTable());
      const pk = (this.relatedModel as any).primaryKey || 'id';
      let filter: any;
      if (pk === 'id') {
        const s = String(relatedId);
        try {
          filter = {
            _id: new (require('mongodb').ObjectId)(s),
            [this.foreignKey]: coerceFK(this.foreignKey, foreignValue),
          };
        } catch {
          filter = { _id: s, [this.foreignKey]: coerceFK(this.foreignKey, foreignValue) };
        }
      } else {
        filter = {
          [pk]: relatedId,
          [this.foreignKey]: coerceFK(this.foreignKey, foreignValue),
        } as any;
      }
      const res = await c.updateOne(filter, { $set: { [this.foreignKey]: null } });
      return Number(res.modifiedCount || 0);
    }
    return await dbQuery(
      `UPDATE ${(this.relatedModel as typeof Model).getTable()} SET ${this.foreignKey} = NULL WHERE ${(this.relatedModel as any).primaryKey || 'id'} = ? AND ${this.foreignKey} = ?`,
      [relatedId, foreignValue],
    ).then((result: any) => result.affectedRows || 0);
  }

  async sync(
    models: (T | number | string)[],
    detaching: boolean = true,
  ): Promise<{ attached: any[]; detached: any[]; updated: any[] }> {
    const foreignValue = (this.parent as any).getAttribute(this.localKey);
    const current = await this.getResults();
    const currentIds = new Set(
      current.map((item) =>
        (item as any).getAttribute((this.relatedModel as any).primaryKey || 'id'),
      ),
    );

    const newIds = new Set();
    const modelsToSync: T[] = [];

    // Process new models/ids
    for (const model of models) {
      let relatedId: number | string;
      let modelInstance: T;

      if (typeof model === 'number' || typeof model === 'string') {
        relatedId = model;
        modelInstance = (await (this.relatedModel as any).find(relatedId)) as T;
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
    parent: Model,
  ) {
    super(relatedModel, parent);
  }

  async getResults(): Promise<T | null> {
    const foreignValue = (this.parent as any).getAttribute(this.foreignKey);
    if (foreignValue === undefined || foreignValue === null) return null;

    this.builder.where(this.ownerKey, foreignValue);
    return await this.builder.first();
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
    parent: Model,
  ) {
    super(relatedModel, parent);
  }

  async getResults(): Promise<T[]> {
    const parentId = (this.parent as any).getAttribute(this.parentPrimaryKey);
    if (parentId === undefined || parentId === null) return [];

    if (getDbType() === 'mongodb') {
      const pc = mongoCollection(this.pivotTable);
      const pidStr = String(parentId);
      const pidNum = parseInt(pidStr, 10);
      const parentMatch: any[] = isNaN(pidNum) ? [pidStr] : [pidStr, pidNum];
      const pivotFilter: any = { [this.foreignPivotKey]: { $in: parentMatch } };
      this.pivotWheres.forEach((w) => {
        const op = (w.operator || '=').toLowerCase();
        const m =
          op === '!=' || op === '<>'
            ? '$ne'
            : op === 'in'
              ? '$in'
              : op === 'not in'
                ? '$nin'
                : '$eq';
        Object.assign(pivotFilter, { [w.column]: { [m]: w.value } });
      });
      const pivots = await pc.find(pivotFilter).toArray();
      if (!pivots.length) return [];
      const relatedIds = pivots.map((r: any) => String(r[this.relatedPivotKey]));
      const rc = mongoCollection((this.relatedModel as typeof Model).getTable());
      const useObjectId = this.relatedPrimaryKey === 'id';
      const filter: any = useObjectId
        ? {
            _id: {
              $in: relatedIds.map((v: any) => {
                try {
                  return new ObjectId(String(v));
                } catch {
                  return v;
                }
              }),
            },
          }
        : { [this.relatedPrimaryKey]: { $in: relatedIds } };
      const docs = await rc.find(filter).toArray();
      // map _id to id for ORM
      docs.forEach((d) => {
        if (d && d._id && !('id' in d)) d.id = String(d._id);
      });
      const pivotMap = new Map(pivots.map((r: any) => [String(r[this.relatedPivotKey]), r]));
      return docs.map((row) => {
        const instance = new (this.relatedModel as any)(row) as T;
        const key = String((row as any)[this.relatedPrimaryKey]);
        const pivotData = pivotMap.get(key);
        if (pivotData) (instance as any).pivot = this.createPivot(pivotData);
        return instance;
      });
    }

    // Get related IDs from pivot with additional pivot conditions
    let pivotSql = `SELECT ${this.relatedPivotKey} AS related_id`;

    // Add pivot columns if specified
    if (this.pivotColumns.length > 0) {
      pivotSql += `, ${this.pivotColumns.join(', ')}`;
    }

    pivotSql += ` FROM ${this.pivotTable} WHERE ${this.foreignPivotKey} = ?`;
    const pivotParams: any[] = [parentId];

    // Add pivot where conditions
    this.pivotWheres.forEach((where) => {
      pivotSql += ` AND ${where.column} ${where.operator} ?`;
      pivotParams.push(where.value);
    });

    const pivotRows = await dbQuery<any>(pivotSql, pivotParams);
    const relatedIds = pivotRows.map((r: any) => r.related_id);

    if (!relatedIds.length) return [];

    const placeholders = relatedIds.map(() => '?').join(',');
    const rows = await dbQuery<any>(
      `SELECT * FROM ${(this.relatedModel as typeof Model).getTable()} WHERE ${this.relatedPrimaryKey} IN (${placeholders})`,
      relatedIds,
    );

    // Attach pivot data to related models
    const pivotMap = new Map(pivotRows.map((r: any) => [r.related_id, r]));

    return rows.map((row) => {
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

  async attach(
    relatedId: number | string | Record<string, any> | (number | string | Record<string, any>)[],
    extra: Record<string, any> = {},
  ): Promise<void> {
    const parentId = (this.parent as any).getAttribute(this.parentPrimaryKey);
    if (parentId === undefined || parentId === null) return;

    const attachments = Array.isArray(relatedId) ? relatedId : [relatedId];
    const isMongo = getDbType() === 'mongodb';

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

      if (isMongo) {
        const pc = mongoCollection(this.pivotTable);
        const pid = coerceFK(this.foreignPivotKey, parentId);
        const rid = coerceFK(this.relatedPivotKey, actualRelatedId);
        await pc.updateOne(
          { [this.foreignPivotKey]: pid, [this.relatedPivotKey]: rid } as any,
          { $set: { ...pivotData, [this.foreignPivotKey]: pid, [this.relatedPivotKey]: rid } },
          { upsert: true },
        );
        continue;
      }

      const columns = [this.foreignPivotKey, this.relatedPivotKey, ...Object.keys(pivotData)];
      const placeholders = columns.map(() => '?').join(',');
      const values = [parentId, actualRelatedId, ...Object.values(pivotData)];

      if (Object.keys(pivotData).length === 0) {
        // simple insert for two-column pivot without extra data — ignore duplicates
        await dbQuery(
          `INSERT IGNORE INTO ${this.pivotTable} (${columns.join(',')}) VALUES (${placeholders})`,
          values,
        );
      } else {
        // upsert with provided pivot data
        const updateClause = Object.keys(pivotData)
          .map((k) => `${k} = ?`)
          .join(', ');
        await dbQuery(
          `INSERT INTO ${this.pivotTable} (${columns.join(',')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`,
          [...values, ...Object.values(pivotData)],
        );
      }
    }
  }

  async detach(relatedIds?: (number | string)[]): Promise<number> {
    const parentId = (this.parent as any).getAttribute(this.parentPrimaryKey);
    if (parentId === undefined || parentId === null) return 0;
    const isMongo = getDbType() === 'mongodb';

    if (isMongo) {
      const pc = mongoCollection(this.pivotTable);
      const parentForms: any[] = (() => {
        const s = String(parentId);
        const list: any[] = [coerceFK(this.foreignPivotKey, parentId), s];
        const n = parseInt(s, 10);
        if (!isNaN(n)) list.push(n);
        if (/^[0-9a-fA-F]{24}$/.test(s)) {
          try {
            list.push(new ObjectId(s));
          } catch {}
        }
        return Array.from(new Set(list.map((x) => (x instanceof ObjectId ? x : String(x))))).map(
          (x) => (typeof x === 'string' && /^[0-9a-fA-F]{24}$/.test(x) ? new ObjectId(x) : x),
        );
      })();
      if (relatedIds && relatedIds.length > 0) {
        const relForms = Array.from(
          new Set(
            relatedIds.flatMap((id) => {
              const s = String(id);
              const arr: any[] = [coerceFK(this.relatedPivotKey, id), s];
              const n = parseInt(s, 10);
              if (!isNaN(n)) arr.push(n);
              if (/^[0-9a-fA-F]{24}$/.test(s)) {
                try {
                  arr.push(new ObjectId(s));
                } catch {}
              }
              return arr;
            }),
          ),
        );
        const res = await pc.deleteMany({
          [this.foreignPivotKey]: { $in: parentForms },
          [this.relatedPivotKey]: { $in: relForms },
        } as any);
        return Number(res.deletedCount || 0);
      }
      const res = await pc.deleteMany({ [this.foreignPivotKey]: { $in: parentForms } } as any);
      return Number(res.deletedCount || 0);
    }

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

  async sync(
    relatedIds: (number | string | Record<string, any>)[],
    detaching: boolean = true,
  ): Promise<{ attached: any[]; detached: any[]; updated: any[] }> {
    const parentId = (this.parent as any).getAttribute(this.parentPrimaryKey);
    if (parentId === undefined || parentId === null) {
      return { attached: [], detached: [], updated: [] };
    }

    const isMongo = getDbType() === 'mongodb';

    // Get current related IDs
    let currentIdsSet = new Set<any>();
    if (isMongo) {
      const pc = mongoCollection(this.pivotTable);
      const pidVal = coerceFK(this.foreignPivotKey, parentId);
      const rows = await pc
        .find({ [this.foreignPivotKey]: pidVal } as any)
        .project({ [this.relatedPivotKey]: 1, _id: 0 })
        .toArray();
      currentIdsSet = new Set(rows.map((r: any) => String(r[this.relatedPivotKey])));
    } else {
      const currentPivotRows = await dbQuery<any>(
        `SELECT ${this.relatedPivotKey} FROM ${this.pivotTable} WHERE ${this.foreignPivotKey} = ?`,
        [parentId],
      );
      currentIdsSet = new Set(currentPivotRows.map((r: any) => r[this.relatedPivotKey]));
    }

    const newIds = new Set<any>();
    const attached: any[] = [];
    const detached: any[] = [];
    const updated: any[] = [];

    for (const related of relatedIds) {
      let actualId: any;
      let extraData: Record<string, any> = {};

      if (typeof related === 'number' || typeof related === 'string') {
        actualId = related;
      } else {
        actualId = related[this.relatedPrimaryKey];
        extraData = { ...related };
        delete extraData[this.relatedPrimaryKey];
      }

      newIds.add(String(actualId));

      if (currentIdsSet.has(String(actualId))) {
        if (Object.keys(extraData).length > 0) {
          if (isMongo) {
            const pidVal = coerceFK(this.foreignPivotKey, parentId);
            const ridVal = coerceFK(this.relatedPivotKey, actualId);
            await mongoCollection(this.pivotTable).updateOne(
              { [this.foreignPivotKey]: pidVal, [this.relatedPivotKey]: ridVal } as any,
              { $set: extraData },
            );
          } else {
            const setSql = Object.keys(extraData)
              .map((k) => `${k} = ?`)
              .join(', ');
            await dbQuery(
              `UPDATE ${this.pivotTable} SET ${setSql} WHERE ${this.foreignPivotKey} = ? AND ${this.relatedPivotKey} = ?`,
              [...Object.values(extraData), parentId, actualId],
            );
          }
          updated.push(actualId);
        }
      } else {
        await this.attach({ [this.relatedPrimaryKey]: actualId, ...extraData } as any);
        attached.push(actualId);
      }
    }

    if (detaching) {
      for (const currentId of currentIdsSet) {
        if (!newIds.has(String(currentId))) {
          await this.detach([currentId]);
          detached.push(currentId);
        }
      }
    }

    return { attached, detached, updated };
  }

  async toggle(relatedIds: (number | string)[]): Promise<{ attached: any[]; detached: any[] }> {
    const parentId = (this.parent as any).getAttribute(this.parentPrimaryKey);
    if (parentId === undefined || parentId === null) {
      return { attached: [], detached: [] };
    }
    const isMongo = getDbType() === 'mongodb';

    // Check which IDs are currently attached
    const toCheck = relatedIds;
    let currentRows: any[] = [];
    if (isMongo) {
      const pc = mongoCollection(this.pivotTable);
      const pidVal = coerceFK(this.foreignPivotKey, parentId);
      const relList = Array.from(
        new Set(
          toCheck.flatMap((id) => {
            const s = String(id);
            const arr: any[] = [coerceFK(this.relatedPivotKey, id), s];
            const n = parseInt(s, 10);
            if (!isNaN(n)) arr.push(n);
            if (/^[0-9a-fA-F]{24}$/.test(s)) {
              try {
                arr.push(new ObjectId(s));
              } catch {}
            }
            return arr;
          }),
        ),
      );
      currentRows = await pc
        .find({ [this.foreignPivotKey]: pidVal, [this.relatedPivotKey]: { $in: relList } } as any)
        .project({ [this.relatedPivotKey]: 1, _id: 0 })
        .toArray();
    } else {
      const placeholders = relatedIds.map(() => '?').join(',');
      currentRows = await dbQuery<any>(
        `SELECT ${this.relatedPivotKey} FROM ${this.pivotTable} 
       WHERE ${this.foreignPivotKey} = ? AND ${this.relatedPivotKey} IN (${placeholders})`,
        [parentId, ...relatedIds],
      );
    }

    const currentIds = new Set(currentRows.map((r: any) => String(r[this.relatedPivotKey])));

    const toAttach = relatedIds.filter((id) => !currentIds.has(String(id)));
    const toDetach = relatedIds.filter((id) => currentIds.has(String(id)));

    if (toAttach.length > 0) {
      await this.attach(toAttach);
    }

    if (toDetach.length > 0) {
      await this.detach(toDetach);
    }

    return {
      attached: toAttach,
      detached: toDetach,
    };
  }

  async updateExistingPivot(
    relatedId: number | string,
    attributes: Record<string, any>,
  ): Promise<number> {
    const parentId = (this.parent as any).getAttribute(this.parentPrimaryKey);
    if (parentId === undefined || parentId === null) return 0;
    const isMongo = getDbType() === 'mongodb';

    if (isMongo) {
      const pidStr = String(parentId);
      const ridStr = String(relatedId);
      const res = await mongoCollection(this.pivotTable).updateOne(
        { [this.foreignPivotKey]: pidStr, [this.relatedPivotKey]: ridStr } as any,
        { $set: attributes },
      );
      return Number(res.modifiedCount || 0);
    }

    const setSql = Object.keys(attributes)
      .map((k) => `${k} = ?`)
      .join(', ');
    const result: any = await dbQuery(
      `UPDATE ${this.pivotTable} SET ${setSql} WHERE ${this.foreignPivotKey} = ? AND ${this.relatedPivotKey} = ?`,
      [...Object.values(attributes), parentId, relatedId],
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
    private relatedPivotKey: string,
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

    if (getDbType() === 'mongodb') {
      const res = await mongoCollection(this.pivotTable).updateOne(
        { [this.foreignPivotKey]: foreignValue, [this.relatedPivotKey]: relatedValue } as any,
        { $set: updateData },
      );
      return Number(res.modifiedCount || 0) > 0;
    }

    const setSql = Object.keys(updateData)
      .map((k) => `${k} = ?`)
      .join(', ');
    const values = [...Object.values(updateData), foreignValue, relatedValue];

    const result: any = await dbQuery(
      `UPDATE ${this.pivotTable} SET ${setSql} WHERE ${this.foreignPivotKey} = ? AND ${this.relatedPivotKey} = ?`,
      values,
    );

    return result.affectedRows > 0;
  }

  async delete(): Promise<boolean> {
    const foreignValue = this.attributes[this.foreignPivotKey];
    const relatedValue = this.attributes[this.relatedPivotKey];

    if (!foreignValue || !relatedValue) return false;

    if (getDbType() === 'mongodb') {
      const res = await mongoCollection(this.pivotTable).deleteOne({
        [this.foreignPivotKey]: foreignValue,
        [this.relatedPivotKey]: relatedValue,
      } as any);
      if (Number(res.deletedCount || 0) > 0) {
        this.exists = false;
        return true;
      }
      return false;
    }

    const result: any = await dbQuery(
      `DELETE FROM ${this.pivotTable} WHERE ${this.foreignPivotKey} = ? AND ${this.relatedPivotKey} = ?`,
      [foreignValue, relatedValue],
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
    parent: Model,
  ) {
    super(relatedModel, foreignKey, localKey, parent);
    this.morphType = morphType;
  }

  async getResults(): Promise<T | null> {
    const localValue = (this.parent as any).getAttribute(this.localKey);
    if (localValue === undefined || localValue === null) return null;

    this.builder
      .where(this.foreignKey, localValue)
      .where(`${this.morphType}_type`, this.parent.constructor.name);

    return await this.builder.first();
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
    parent: Model,
  ) {
    super(relatedModel, foreignKey, localKey, parent);
    this.morphType = morphType;
  }

  async getResults(): Promise<T[]> {
    const localValue = (this.parent as any).getAttribute(this.localKey);
    if (localValue === undefined || localValue === null) return [];

    this.builder
      .where(this.foreignKey, localValue)
      .where(`${this.morphType}_type`, this.parent.constructor.name);

    return await this.builder.get();
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
    private morphMap?: Record<string, typeof Model>,
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
    this.builder = new EloquentBuilder<T>(modelClass as any);

    this.builder.where((modelClass as any).primaryKey || 'id', id);
    return await this.builder.first();
  }
}
