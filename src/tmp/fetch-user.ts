import path from 'path';
// load env early
import dotenv from 'dotenv';
import User from "@/server/Models/User/User";
dotenv.config({ path: path.resolve(__dirname, '../../.env') });



async function run() {
  try {
    const useMock = String(process.env.MOCK_USER || '').toLowerCase();
    if (useMock === '1' || useMock === 'true') {
      console.log('Using mock user (no DB)');
      const mock = new User({
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
        active_status: 1,
        avatar: 'avatar.png'
      });
      // Relationship NOT loaded -> should include roles: []
      console.log('\nMock user (no relationships loaded):');
      console.log(JSON.stringify(mock.toJSON(), null, 2));

      // Simulate loaded roles by setting relation manually (example lightweight role object)
      mock.setLoadedRelation('roles', [ { id: 99, name: 'Demo Role', slug: 'demo', description: null } ]);
      console.log('\nMock user (roles loaded):');
      console.log(JSON.stringify(mock.toJSON(), null, 2));
      return;
    }

    console.log('Attempting to fetch user id=1 from DB (with roles)...');
    const user = await User.query().with(['roles', 'roles.permissions']).get();
    if (!user) {
      console.log('No user found with id=1');
      return;
    }
    console.log('\nFetched user with roles (json):');
    console.log(JSON.stringify(user, null, 2));
  } catch (err) {
    console.error('Error fetching user:', err);
    process.exitCode = 1;
  }
}

run();
