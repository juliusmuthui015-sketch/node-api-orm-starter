# Database Seeders

Seeders allow you to populate your database with initial data.

## Running Seeders

```bash
pnpm run db:seed
pnpm run db:seed -- --class=CategorySeeder
pnpm run db:fresh -- --seed
```

## Creating a Seeder

```typescript
// src/database/seeders/CategorySeeder.ts
import { initDatabase } from '@/config/db.config';
import Category from '@/app/Models/Category';

export default async function CategorySeeder() {
    await initDatabase();
    
    const categories = [
        { name: 'Technology', slug: 'technology' },
        { name: 'Business', slug: 'business' },
    ];
    
    for (const cat of categories) {
        const existing = await Category.where('slug', cat.slug).first();
        if (!existing) {
            await Category.create({
                ...cat,
                created_at: new Date(),
                updated_at: new Date(),
            });
        }
    }
    
    console.log('✓ Categories seeded');
}

if (require.main === module) {
    CategorySeeder().catch(console.error);
}
```

## DatabaseSeeder

```typescript
// src/database/seeders/DatabaseSeeder.ts
import seedDefault from './seed';

export default async function DatabaseSeeder() {
    console.log('Running DatabaseSeeder...');
    await seedDefault();
    console.log('DatabaseSeeder complete');
}

if (require.main === module) {
    DatabaseSeeder().catch(console.error);
}
```

## Default Users

After seeding:
- **Admin**: `admin@example.com` / `password`
- **User**: `user@example.com` / `password`

