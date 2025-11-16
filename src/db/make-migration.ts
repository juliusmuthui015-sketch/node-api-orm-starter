#!/usr/bin/env ts-node
import fs from 'fs';
import path from 'path';

function pad(n: number) { return n < 10 ? '0' + n : String(n); }
function timestamp() {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function parseArgs(argv: string[]) {
  const args: Record<string,string|boolean> = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      args[k] = v === undefined ? true : v;
    } else if (!args._) {
      args._ = a;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const name = (args._ as string) || (args.name as string);
if (!name) {
  console.error('Usage: make-migration <name> [--table=tableName] [--alter]');
  process.exit(1);
}
const table = (args.table as string) || null;
const alter = Boolean(args.alter);

const dir = path.resolve(__dirname, './migrations');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const fileName = `${timestamp()}_${name.replace(/\s+/g,'_')}.ts`;
const filePath = path.join(dir, fileName);

let template: string;
if (alter && table) {
  template = `import type { MigrationSchema, TableBuilder } from '../Schema';

type QueryFn = (sql: string, params?: any[]) => Promise<any>;

// Migration: ${name}
// Alter table ${table}
module.exports.up = async function(schema: MigrationSchema, query: QueryFn) {
  // Use schema.alterTable to perform ALTER TABLE statements
  return schema.alterTable('${table}', (table: TableBuilder) => {
    // add a column:
    // table.string('nickname', 64).nullable();
    // add an index (single or composite):
    // table.index(['nickname', 'other_col']);
    // add a foreign key:
    // table.foreignKey('other_id', 'other_table', 'id', { onDelete: 'CASCADE' });

    // drop a column:
    // table.dropColumn('old_column');

    // rename a column:
    // table.renameColumn('old_name', 'new_name');

    // change a column (old name, callback that returns new Column definition):
    // table.changeColumn('age', col => col.integer('age').default(18));
  });
};

module.exports.down = async function(schema: MigrationSchema, query: QueryFn) {
  // Provide reverse operations for rollback if possible. Example: remove added columns or recreate dropped columns.
  return schema.alterTable('${table}', (table: TableBuilder) => {
    // reverse operations here
  });
};
`;
} else {
  const tbl = table || name.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  template = `import type { MigrationSchema, TableBuilder } from '../Schema';

type QueryFn = (sql: string, params?: any[]) => Promise<any>;

// Migration: ${name}
module.exports.up = async function(schema: MigrationSchema, query: QueryFn) {
  return schema.createTable('${tbl}', (table: TableBuilder) => {
    table.increments('id');
    table.string('name', 191).notNullable();
    table.string('slug', 191).nullable();
    // composite index example:
    table.index(['name','slug']);
    // unique composite index example:
    table.uniqueIndex(['name','slug'], '${tbl}_name_slug_unique');
    // foreign key example (if references another table):
    // table.integer('other_id').notNullable();
    // table.foreignKey('other_id', 'other_table', 'id', { onDelete: 'CASCADE' });
    table.timestamps();
  });
};

module.exports.down = async function(schema: MigrationSchema, query: QueryFn) {
  // Drop the table on rollback
  return schema.dropTable('${tbl}');
};
`;
}

fs.writeFileSync(filePath, template);
console.log('Created migration:', filePath);
