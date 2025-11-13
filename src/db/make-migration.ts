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

let template = '';
if (alter && table) {
  template = `// Migration: ${name}\n// Alter table ${table}\nmodule.exports.up = async function(schema, query) {\n  // Use schema.alterTable to perform ALTER TABLE statements\n  return schema.alterTable('${table}', table => {\n    // add a column:\n    // table.string('nickname', 64).nullable();\n    // add an index (single or composite):\n    // table.index(['nickname', 'other_col']);\n    // add a foreign key:\n    // table.foreignKey('other_id', 'other_table', 'id', { onDelete: 'CASCADE' });\n\n    // drop a column:\n    // table.dropColumn('old_column');\n\n    // rename a column:\n    // table.renameColumn('old_name', 'new_name');\n\n    // change a column (old name, callback that returns new Column definition):\n    // table.changeColumn('age', col => col.integer('age').default(18));\n  });\n};\n\nmodule.exports.down = async function(schema, query) {\n  // Provide reverse operations for rollback if possible. Example: remove added columns or recreate dropped columns.\n  return schema.alterTable('${table}', table => {\n    // reverse operations here\n  });\n};\n`;
} else {
  const tbl = table || name.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  template = `// Migration: ${name}\nmodule.exports.up = async function(schema, query) {\n  return schema.createTable('${tbl}', table => {\n    table.increments('id');\n    table.string('name', 191).notNullable();\n    table.string('slug', 191).nullable();\n    // composite index example:\n    table.index(['name','slug']);\n    // unique composite index example:\n    table.uniqueIndex(['name','slug'], '${tbl}_name_slug_unique');\n    // foreign key example (if references another table):\n    // table.integer('other_id').notNullable();\n    // table.foreignKey('other_id', 'other_table', 'id', { onDelete: 'CASCADE' });\n    table.timestamps();\n  });\n};\n\nmodule.exports.down = async function(schema, query) {\n  // Drop the table on rollback\n  return schema.dropTable('${tbl}');\n};\n`;
}

fs.writeFileSync(filePath, template);
console.log('Created migration:', filePath);
