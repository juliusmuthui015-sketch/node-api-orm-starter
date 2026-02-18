import MockSeeder from './MockSeeder';

// Wrapper to integrate with run-seeders.ts (which passes DB ctx to 1-arg seeders)
// Read counts from environment variables when invoked via `npm run db:seed -- --class=MockDataSeeder`
// Supported ENV:
//  MOCK_USERS, MOCK_PROPERTIES, MOCK_UNIT_TYPES_PER_PROPERTY, MOCK_UNITS_PER_PROPERTY

export default async function MockDataSeeder(_ctx?: any) {
  const users = process.env.MOCK_USERS ? Number(process.env.MOCK_USERS) : undefined;
  const properties = process.env.MOCK_PROPERTIES ? Number(process.env.MOCK_PROPERTIES) : undefined;
  const unitTypesPerProperty = process.env.MOCK_UNIT_TYPES_PER_PROPERTY
    ? Number(process.env.MOCK_UNIT_TYPES_PER_PROPERTY)
    : undefined;
  const unitsPerProperty = process.env.MOCK_UNITS_PER_PROPERTY
    ? Number(process.env.MOCK_UNITS_PER_PROPERTY)
    : undefined;

  return MockSeeder({ users, properties, unitTypesPerProperty, unitsPerProperty });
}

// Allow running directly
if (require.main === module) {
  MockDataSeeder().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
