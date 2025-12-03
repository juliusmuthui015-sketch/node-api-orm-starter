// tmp/eloquent-attributes-smoke.ts
// Smoke test for Laravel-like accessors, mutators, appends, and relation().query().count()
import path from 'path';
import dotenv from 'dotenv';
import { Model } from '@/eloquent/Model';
import {initDatabase} from "@/config/db.config";

dotenv.config({ path: path.resolve(__dirname, '../../.env') });


class DemoPost extends Model {
  static table = 'posts';
  static primaryKey = 'id';
  static fillable = ['id', 'user_id', 'title'];
}

class DemoUser extends Model {
  static table = 'users';
  static primaryKey = 'id';
  static fillable = ['id', 'first_name', 'last_name', 'password'];
  static hidden = ['password'];
  static appends = ['full_name', 'post_count', 'bio'];

  // Accessor: compute a full name from parts using direct attribute access
  getFullNameAttribute(_raw?: any) {
    const f = this.getField('first_name') || '';
    const l = this.getField('last_name') || '';
    return `${String(f).trim()} ${String(l).trim()}`.trim();
  }

  // Async accessor example (e.g., pretend to fetch something)
  async getBioAttribute(_raw?: any) {
    const f = this.getField('first_name') || '';
    const l = this.getField('last_name') || '';
    const name = `${String(f).trim()} ${String(l).trim()}`.trim();
    // fake async
    await Promise.resolve();
    return `Bio of ${name}`;
  }

  // Keep accessors synchronous; avoid DB here to prevent Promise -> {}
  async  getPostCountAttribute(_raw?: any) {
    return await this.posts().query().count();
  }

  // Mutator: fake-hash the password before storing
  setPasswordAttribute(value: any) {
    if (value === undefined || value === null) return value;
    return `hashed:${value}`;
  }

  // Simple relation for relation().query() API
  posts() {
    return this.hasMany(DemoPost, 'user_id', 'id');
  }
}

async function run() {
  const skipDb = String(process.env.MOCK_DB || '0').toLowerCase() === '1' ||
                 String(process.env.MOCK_DB || '1').toLowerCase() === 'true';
  if (!skipDb) {
    await initDatabase();
  }
  console.log('--- Accessor/Mutator/Appends smoke ---');
  const u = new DemoUser({ id: 1, first_name: 'john', last_name: 'doe', password: 'secret' });

  // Mutator ran on set -> attribute value transformed
  console.log('password (mutated, direct read):', u.password); // direct read (hidden only affects toJSON)

  // Accessor via dynamic get
  console.log('full_name (accessor):', u.full_name);

  // Appends + hidden in toJSON
  console.log('serialized (should include full_name, exclude password):');
  console.log(JSON.stringify(u.toJSON(), null, 2));

  // Async serialization (should include bio from async accessor)
  const asyncJson = await u.toJSONAsync();
  console.log('serialized async (should include bio):');
  console.log(JSON.stringify(asyncJson, null, 2));

  console.log('\n--- Relation query() smoke ---');
  if (skipDb) {
    const rel = u.posts();
    const builder = rel.query();
    const hasCount = typeof (builder as any).count === 'function';
    console.log('relation().query() returns builder with count():', hasCount);
    console.log('(DB call skipped; set MOCK_DB=0 to actually hit the database)');
  } else {
    try {
      const total = await u.posts().query().count();
      console.log('posts().query().count() ->', total);
      // If you want to show a real count in JSON:
      u.setAttribute('post_count', total);
      console.log('serialized with real post_count:');
      console.log(JSON.stringify(u.toJSON(), null, 2));
    } catch (err) {
      console.error('DB count failed. Ensure DB config and posts/users tables exist. Error:', err);
    }
  }
}

run().catch((e) => {
  console.error('Smoke failed:', e);
  process.exitCode = 1;
});
