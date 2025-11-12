import path from 'path';
// load env early
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import User from '../server/Models/User';

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
      console.log('User:', mock.toJSON());
      return;
    }

    console.log('Attempting to fetch user id=1 from DB...');
    const user = await User.query().get();
    if (!user) {
      console.log('No user found with id=1');
      return;
    }
    console.log('Fetched user:', user);
  } catch (err) {
    console.error('Error fetching user:', err);
    process.exitCode = 1;
  }
}

run();

