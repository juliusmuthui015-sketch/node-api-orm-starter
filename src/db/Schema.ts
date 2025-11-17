// Simple Laravel-like Schema builder for migrations
// Usage:
// const schema = new Schema();
// const sql = schema.createTable('users', table => {
//   table.increments('id');
//   table.string('name', 191).notNullable();
//   table.string('email', 191).notNullable().unique();
//   table.string('password', 255).notNullable();
//   table.timestamps();
//   table.softDeletes();
// });
// // sql is a CREATE TABLE ... statement

import { getDbType, getMongoDb } from '@/config/db.config';

// Common interface to support both SQL and Mongo schema builders
export interface MigrationSchema {
  createTable(name: string, callback: (table: TableBuilder) => void): any;
  alterTable(name: string, callback: (table: TableBuilder) => void): any;
  dropTable(name: string): any;
}

type DefaultValue = string | number | boolean | null;

export class Column {
  name: string;
  type: string;
  length?: number;
  enumValues?: string[];
  nullableFlag = false;
  defaultValue?: DefaultValue;
  unsignedFlag = false;
  uniqueFlag = false;
  primaryFlag = false;
  autoIncrementFlag = false;
  commentText?: string;
  decimalPlaces?: number;

  constructor(name: string, type: string, length?: number,decimalPlaces=2) {
    this.name = name;
    this.type = type;
    this.length = length;
    this.decimalPlaces = decimalPlaces;
  }

  // set enum values for ENUM columns
  enum(values: string[]) { this.enumValues = values.slice(); this.type = 'ENUM'; return this; }

  nullable() { this.nullableFlag = true; return this; }
  notNullable() { this.nullableFlag = false; return this; }
  default(val: DefaultValue) { this.defaultValue = val; return this; }
  unsigned() { this.unsignedFlag = true; return this; }
  unique() { this.uniqueFlag = true; return this; }
  primary() { this.primaryFlag = true; return this; }
  increments() { this.autoIncrementFlag = true; this.primaryFlag = true; return this; }
  comment(text: string) { this.commentText = text; return this; }

  // toSQL optionally omits the column name when `omitName` is true
  toSQL(omitName = false): string {
    let sqlType = this.type;
    if (this.enumValues && this.enumValues.length) {
      const vals = this.enumValues.map(v => `'${escapeSingle(v)}'`).join(',');
      sqlType = `ENUM(${vals})`;
    } else if (this.length !== undefined && (this.type.toLowerCase() === 'varchar' || this.type.toLowerCase() === 'char')) {
      sqlType += `(${this.length})`;
    } else if (this.length !== undefined && (this.type.toLowerCase() === 'int')) {
      sqlType += `(${this.length})`;
    } else if (this.length !== undefined && (this.type.toLowerCase() === 'decimal')) {
      sqlType += `(${this.length},${this.decimalPlaces})`;
    }

    if (this.unsignedFlag) sqlType += ' UNSIGNED';

    const namePart = omitName ? '' : `\`${this.name}\` `;
    let parts = [`${namePart}${sqlType}`.trim()];

    if (this.autoIncrementFlag) parts.push('AUTO_INCREMENT');

    if (this.primaryFlag && !this.autoIncrementFlag) parts.push('PRIMARY KEY');

    if (!this.nullableFlag) parts.push('NOT NULL');
    else parts.push('NULL');

    if (this.defaultValue !== undefined) {
      parts.push('DEFAULT ' + formatDefault(this.defaultValue));
    }

    if (this.commentText) parts.push(`COMMENT '${escapeSingle(this.commentText)}'`);

    return parts.join(' ');
  }
}

function escapeSingle(s: string) {
  return s.replace(/'/g, "''");
}

function formatDefault(v: DefaultValue) {
  if (v === null) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  // assume string
  return `'${escapeSingle(String(v))}'`;
}

export class TableBuilder {
  name: string;
  columns: Column[] = [];
  primaryKeys: string[] = [];
  uniques: string[] = [];
  engine: string = 'InnoDB';
  charset: string = 'utf8mb4';

  // index & foreign key support
  indexes: { columns: string[]; name?: string; unique?: boolean }[] = [];
  foreignKeys: { columns: string[]; refTable: string; refColumns: string[]; name?: string; onDelete?: string; onUpdate?: string }[] = [];
  // track dropped indexes/foreign keys in alter mode
  dropIndexes: string[] = [];
  dropForeignKeys: string[] = [];
  // index of last added foreign key (for chaining .onDelete/.onUpdate)
  lastForeignKeyIndex: number | null = null;
  // pending foreign being built by fluent .foreign().references().inTable() chain
  pendingForeign?: { columns: string[]; refTable?: string; refColumns?: string[]; name?: string; onDelete?: string; onUpdate?: string };

  // alter-mode specific
  drops: string[] = [];
  changes: { oldName: string, col: Column }[] = [];
  renames: { from: string, to: string }[] = [];

  mode: 'create' | 'alter' = 'create';

  constructor(name: string, mode: 'create' | 'alter' = 'create') { this.name = name; this.mode = mode; }

  column(type: string, name: string, length?: number) {
    const col = new Column(name, type, length);
    this.columns.push(col);
    return col;
  }

  // fluent foreign key builder: table.foreign('col').references('id').inTable('users').onDelete('CASCADE')
  foreign(columns: string[] | string) {
    const cols = Array.isArray(columns) ? columns : [columns];
    this.pendingForeign = { columns: cols };
    return this;
  }

  references(refColumns: string[] | string) {
    if (!this.pendingForeign) this.pendingForeign = { columns: [] };
    this.pendingForeign.refColumns = Array.isArray(refColumns) ? refColumns : [refColumns];
    return this;
  }

  inTable(tableName: string, opts: { name?: string } = {}) {
    if (!this.pendingForeign) this.pendingForeign = { columns: [] };
    this.pendingForeign.refTable = tableName;
    if (opts.name) this.pendingForeign.name = opts.name;
    // finalize pending foreign into foreignKeys list
    const pf = this.pendingForeign;
    const idx = this.foreignKeys.push({ columns: pf.columns, refTable: pf.refTable || '', refColumns: pf.refColumns || ['id'], name: pf.name, onDelete: pf.onDelete, onUpdate: pf.onUpdate }) - 1;
    this.lastForeignKeyIndex = idx;
    // clear pending
    delete this.pendingForeign;
    return this;
  }

  // enum helper
  enum(name: string, values: string[]) { const c = this.column('ENUM', name); c.enum(values); return c; }

  increments(name = 'id') { const c = this.column('INT', name); c.increments(); this.primary(name); return c; }
  integer(name: string, length?: number) { return this.column('INT', name, length); }
  tinyInteger(name: string) { return this.column('TINYINT', name); }
  boolean(name: string) { return this.column('TINYINT', name); }
  string(name: string, length = 191) { return this.column('VARCHAR', name, length); }
    decimal(name: string, length: number = 10, decimalPlaces: number = 2) { return this.column('DECIMAL', name, length); }
  char(name: string, length = 191) { return this.column('CHAR', name, length); }
  text(name: string) { return this.column('TEXT', name); }
  longText(name: string) { return this.column('LONGTEXT', name); }
  // JSON column helper (length accepted for API compatibility but ignored in SQL)
  json(name: string, _length?: number) { return this.column('JSON', name); }
  datetime(name: string) { return this.column('DATETIME', name); }
  timestamp(name: string) { const c = this.column('TIMESTAMP', name); c.nullable(); return c; }

  timestamps() { this.datetime('created_at').nullable(); this.datetime('updated_at').nullable(); return this; }
  softDeletes() { this.datetime('deleted_at').nullable(); return this; }

  unique(name: string) { this.uniques.push(name); return this; }
  primary(name: string) { this.primaryKeys.push(name); return this; }

  // index helpers
  index(columns: string[] | string, name?: string) {
    const cols = Array.isArray(columns) ? columns : [columns];
    this.indexes.push({ columns: cols, name, unique: false });
    return this;
  }

  uniqueIndex(columns: string[] | string, name?: string) {
    const cols = Array.isArray(columns) ? columns : [columns];
    this.indexes.push({ columns: cols, name, unique: true });
    return this;
  }

  // drop an index in alter mode
  dropIndex(name: string) { this.dropIndexes.push(name); return this; }

  // drop a foreign key constraint by name in alter mode
  dropForeignKey(name: string) { this.dropForeignKeys.push(name); return this; }

  // foreign key helper: columns (single or array), referenced table and referenced columns
  foreignKey(columns: string[] | string, refTable: string, refColumns: string[] | string, opts: { name?: string, onDelete?: string, onUpdate?: string } = {}) {
    const cols = Array.isArray(columns) ? columns : [columns];
    const refs = Array.isArray(refColumns) ? refColumns : [refColumns];
    const idx = this.foreignKeys.push({ columns: cols, refTable, refColumns: refs, name: opts.name, onDelete: opts.onDelete, onUpdate: opts.onUpdate }) - 1;
    this.lastForeignKeyIndex = idx;
    return this;
  }

  // chainable helpers to set onDelete/onUpdate for the most recently added or currently pending foreign key
  onDelete(action: string) {
    if (this.pendingForeign) {
      this.pendingForeign.onDelete = action;
    } else if (this.lastForeignKeyIndex !== null) {
      this.foreignKeys[this.lastForeignKeyIndex].onDelete = action;
    }
    return this;
  }
  onUpdate(action: string) {
    if (this.pendingForeign) {
      this.pendingForeign.onUpdate = action;
    } else if (this.lastForeignKeyIndex !== null) {
      this.foreignKeys[this.lastForeignKeyIndex].onUpdate = action;
    }
    return this;
  }

  // alter-mode helpers
  dropColumn(name: string) { this.drops.push(name); return this; }
  renameColumn(from: string, to: string) { this.renames.push({ from, to }); return this; }
  // change column: provide old name and a callback that defines the new column
  changeColumn(oldName: string, cb: (col: Column) => Column) {
    // create a temporary column using the oldName as placeholder; callback can change name
    const tmp = new Column(oldName, 'VARCHAR');
    const newCol = cb(tmp) || tmp;
    this.changes.push({ oldName, col: newCol });
    return this;
  }

  toSQL(): string {
    const colSql = this.columns.map(c => c.toSQL());

    const pk = this.primaryKeys.length ? `, PRIMARY KEY (${this.primaryKeys.map(n => `\`${n}\``).join(', ')})` : '';
    const uqs = this.uniques.map(n => `, UNIQUE KEY (\`${n}\`)`).join('');

    // index and foreign key SQL for create mode
    const idxSqlCreate = this.indexes.map(ix => {
      const name = ix.name || `${this.name}_${ix.columns.join('_')}${ix.unique ? '_uniq' : '_idx'}`;
      const cols = ix.columns.map(c => `\`${c}\``).join(', ');
      return ix.unique ? `, UNIQUE KEY \`${name}\` (${cols})` : `, KEY \`${name}\` (${cols})`;
    }).join('');

    const fkSqlCreate = this.foreignKeys.map(fk => {
      const name = fk.name || `${this.name}_${fk.columns.join('_')}_fk`;
      const cols = fk.columns.map(c => `\`${c}\``).join(', ');
      const refs = fk.refColumns.map(c => `\`${c}\``).join(', ');
      const onDelete = fk.onDelete ? ` ON DELETE ${fk.onDelete}` : '';
      const onUpdate = fk.onUpdate ? ` ON UPDATE ${fk.onUpdate}` : '';
      return `, CONSTRAINT \`${name}\` FOREIGN KEY (${cols}) REFERENCES \`${fk.refTable}\` (${refs})${onDelete}${onUpdate}`;
    }).join('');

    if (this.mode === 'create') {
      return `CREATE TABLE IF NOT EXISTS \`${this.name}\` (\n  ${colSql.join(',\n  ')}${pk}${uqs}${idxSqlCreate}${fkSqlCreate}\n) ENGINE=${this.engine} DEFAULT CHARSET=${this.charset};`;
    }

    // alter mode: produce one or more ALTER TABLE statements
    const parts: string[] = [];
    // additions
    for (const c of this.columns) {
      parts.push(`ALTER TABLE \`${this.name}\` ADD COLUMN ${c.toSQL()};`);
    }
    // indexes in alter mode
    for (const ix of this.indexes) {
      const name = ix.name || `${this.name}_${ix.columns.join('_')}${ix.unique ? '_uniq' : '_idx'}`;
      const cols = ix.columns.map(c => `\`${c}\``).join(', ');
      parts.push(ix.unique ? `ALTER TABLE \`${this.name}\` ADD UNIQUE \`${name}\` (${cols});` : `ALTER TABLE \`${this.name}\` ADD INDEX \`${name}\` (${cols});`);
    }

    // drop indexes in alter mode
    for (const idxName of this.dropIndexes) {
      parts.push(`ALTER TABLE \`${this.name}\` DROP INDEX \`${idxName}\`;`);
    }

    // foreign keys in alter mode
    for (const fk of this.foreignKeys) {
      const name = fk.name || `${this.name}_${fk.columns.join('_')}_fk`;
      const cols = fk.columns.map(c => `\`${c}\``).join(', ');
      const refs = fk.refColumns.map(c => `\`${c}\``).join(', ');
      const onDelete = fk.onDelete ? ` ON DELETE ${fk.onDelete}` : '';
      const onUpdate = fk.onUpdate ? ` ON UPDATE ${fk.onUpdate}` : '';
      parts.push(`ALTER TABLE \`${this.name}\` ADD CONSTRAINT \`${name}\` FOREIGN KEY (${cols}) REFERENCES \`${fk.refTable}\` (${refs})${onDelete}${onUpdate};`);
    }

    // drop foreign keys (by constraint name)
    for (const fkName of this.dropForeignKeys) {
      parts.push(`ALTER TABLE \`${this.name}\` DROP FOREIGN KEY \`${fkName}\`;`);
    }

    // drops
    for (const d of this.drops) {
      parts.push(`ALTER TABLE \`${this.name}\` DROP COLUMN \`${d}\`;`);
    }
    // renames
    for (const r of this.renames) {
      // MySQL 8 supports RENAME COLUMN
      parts.push(`ALTER TABLE \`${this.name}\` RENAME COLUMN \`${r.from}\` TO \`${r.to}\`;`);
    }
    // changes
    for (const ch of this.changes) {
      // CHANGE old_name `<new definition including new name and type>`
      parts.push(`ALTER TABLE \`${this.name}\` CHANGE \`${ch.oldName}\` ${ch.col.toSQL()};`);
    }

    return parts.join('\n');
  }
}

export default class Schema implements MigrationSchema {
  createTable(name: string, callback: (table: TableBuilder) => void) {
    const tb = new TableBuilder(name, 'create');
    callback(tb);
    return tb.toSQL();
  }

  alterTable(name: string, callback: (table: TableBuilder) => void) {
    const tb = new TableBuilder(name, 'alter');
    callback(tb);
    return tb.toSQL();
  }

  dropTable(name: string) {
    return `DROP TABLE IF EXISTS \`${name}\`;`;
  }
}

// MongoSchema: records operations and applies them using MongoDB
export class MongoSchema implements MigrationSchema {
  private ops: Array<{ type: 'create'|'alter'|'drop', table: string, tb?: TableBuilder }>= [];

  createTable(name: string, callback: (table: TableBuilder) => void) {
    const tb = new TableBuilder(name, 'create');
    callback(tb);
    this.ops.push({ type: 'create', table: name, tb });
    return undefined as any; // runner will call apply()
  }

  alterTable(name: string, callback: (table: TableBuilder) => void) {
    const tb = new TableBuilder(name, 'alter');
    callback(tb);
    this.ops.push({ type: 'alter', table: name, tb });
    return undefined as any;
  }

  dropTable(name: string) {
    this.ops.push({ type: 'drop', table: name });
    return undefined as any;
  }

  async apply(): Promise<void> {
    if (getDbType() !== 'mongodb') return;
    const db = getMongoDb();
    for (const op of this.ops) {
      if (op.type === 'create' && op.tb) {
        // create collection if not exists
        const exists = await db.listCollections({ name: op.table }).hasNext();
        if (!exists) {
          await db.createCollection(op.table);
        }
        // indexes
        const c = db.collection(op.table);
        // primary key: nothing to do; Mongo always has _id
        // unique indexes
        for (const uq of (op.tb.uniques || [])) {
          try { await c.createIndex({ [uq]: 1 }, { unique: true, name: `${op.table}_${uq}_uniq` }); } catch (_) {}
        }
        // other indexes
        for (const ix of (op.tb.indexes || [])) {
          const name = ix.name || `${op.table}_${ix.columns.join('_')}${ix.unique ? '_uniq' : '_idx'}`;
          const spec: any = {};
          ix.columns.forEach(col => spec[col] = 1);
          try { await c.createIndex(spec, { unique: Boolean(ix.unique), name }); } catch (_) {}
        }
      } else if (op.type === 'alter' && op.tb) {
        const c = db.collection(op.table);
        // add indexes
        for (const ix of (op.tb.indexes || [])) {
          const name = ix.name || `${op.table}_${ix.columns.join('_')}${ix.unique ? '_uniq' : '_idx'}`;
          const spec: any = {};
          ix.columns.forEach(col => spec[col] = 1);
          try { await c.createIndex(spec, { unique: Boolean(ix.unique), name }); } catch (_) {}
        }
        // drop indexes
        for (const dropName of (op.tb.dropIndexes || [])) {
          try { await c.dropIndex(dropName); } catch (_) {}
        }
        // drop foreign keys no-op
        // drop columns and change/rename columns are not supported here — no-op in Mongo
      } else if (op.type === 'drop') {
        try { await db.collection(op.table).drop(); } catch (_) {}
      }
    }
    // clear ops after applying
    this.ops = [];
  }
}
