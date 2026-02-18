import { initDatabase } from '@/config/db.config';
import Property from "@app/Models/property/Property";
import UnitType from "@app/Models/property/UnitType";
import Unit from "@app/Models/property/Unit";

export type MockOptions = {
  users?: number;
  properties?: number;
  unitTypesPerProperty?: number;
  unitsPerProperty?: number;
};

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sentence(words = 6) {
  const pool = [
    'modern',
    'spacious',
    'cozy',
    'bright',
    'quiet',
    'central',
    'luxury',
    'affordable',
    'stylish',
    'comfortable',
    'renovated',
    'charming',
  ];
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(pick(pool));
  const s = out.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

function streetAddress() {
  const streets = [
    'Maple St',
    'Oak Ave',
    'Pine Rd',
    'Cedar Blvd',
    'Elm St',
    'Lakeview Dr',
    'Sunset Ave',
  ];
  return `${randInt(10, 9999)} ${pick(streets)}`;
}

function propertyName() {
  const prefixes = ['Green', 'Sunset', 'Lakeview', 'Grand', 'Riverside', 'Cedar', 'Maple', 'Park'];
  const suffixes = ['Residences', 'Apartments', 'Homes', 'Heights', 'Place', 'Gardens', 'Commons'];
  return `${pick(prefixes)} ${pick(suffixes)}`;
}

export default async function MockSeeder(opts: MockOptions = {}) {
  await initDatabase();
  const now = new Date();
  const usersCount = Number(opts.users ?? 5);
  const propertiesCount = Number(opts.properties ?? 3);
  const unitTypesPerProperty = Number(opts.unitTypesPerProperty ?? 2);
  const unitsPerProperty = Number(opts.unitsPerProperty ?? 6);

  // Ensure a baseline admin/owner exists
  let owner = await User.where('email', 'admin@example.com').first();
  if (!owner) {
    owner = await User.create({
      name: 'Owner',
      email: `owner${Date.now()}@example.com`,
      password: 'password',
      active_status: 1,
      created_at: now,
      updated_at: now,
    });
  }

  // Create additional test users
  const userIds: number[] = [owner.id as any];
  for (let i = 0; i < usersCount; i++) {
    const u = await User.create({
      name: `User ${i + 1}`,
      email: `user${Date.now()}_${i}@example.com`,
      password: 'password',
      active_status: 1,
      created_at: now,
      updated_at: now,
    });
    userIds.push(u.id as any);
  }

  const PROPERTY_TYPES = ['apartment', 'house', 'commercial', 'land', 'residential'];

  // Create properties
  const propertyIds: number[] = [];
  for (let i = 0; i < propertiesCount; i++) {
    const uId = pick(userIds);
    const name = propertyName();
    const totalFloors = randInt(3, 12);
    const totalUnits = unitsPerProperty;
    const p = await Property.create({
      name,
      address: streetAddress(),
      user_id: uId,
      property_type: pick(PROPERTY_TYPES),
      total_floors: totalFloors,
      total_units: totalUnits,
      description: sentence(8),
      images: '[]', // string column in migration
      amenities: ['parking', 'wifi'], // json column
      created_by: uId,
      updated_by: uId,
      created_at: now,
      updated_at: now,
    } as any);
    propertyIds.push(p.id as any);

    // Create unit types for this property
    const unitTypeIds: number[] = [];
    for (let t = 0; t < unitTypesPerProperty; t++) {
      const bedrooms = randInt(1, 4);
      const bathrooms = bedrooms === 1 ? 1 : pick([1, 1.5, 2, 2.5]);
      const base_rent = randInt(400, 2500);
      const type = await UnitType.create({
        property_id: p.id,
        type_name: `${bedrooms}BR/${bathrooms}BA`,
        bedrooms,
        bathrooms,
        base_rent,
        created_by: uId,
        updated_by: uId,
        created_at: now,
        updated_at: now,
      } as any);
      unitTypeIds.push(type.id as any);
    }

    // Create units for this property and assign a unit type
    for (let k = 0; k < unitsPerProperty; k++) {
      const unitTypeId = pick(unitTypeIds);
      const unit_number = `${pick(['A', 'B', 'C', 'D', 'E', 'F'])}-${randInt(1, 50)}`;
      const floor = randInt(0, Math.max(1, totalFloors - 1));
      const monthly_rent = randInt(500, 3000);
      const security_deposit = randInt(200, 1200);
      await Unit.create({
        unit_number,
        floor,
        unit_type: unitTypeId,
        size_sqft: randInt(250, 2000),
        monthly_rent,
        security_deposit,
        status: pick(['vacant', 'occupied', 'maintenance']),
        power_meter_number: `PWR-${randInt(10000, 99999)}`,
        water_meter_number: `WTR-${randInt(10000, 99999)}`,
        property_id: p.id,
        images: [], // json column
        created_by: uId,
        updated_by: uId,
        created_at: now,
        updated_at: now,
      } as any);
    }
  }

  console.log('Mock seed complete:', {
    users_created: usersCount,
    properties_created: propertiesCount,
    unit_types_per_property: unitTypesPerProperty,
    units_per_property: unitsPerProperty,
  });
}

if (require.main === module) {
  MockSeeder({}).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
