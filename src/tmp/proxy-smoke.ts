import { Model } from '@/eloquent/Model';

class User extends Model {
  static table = 'users';
  static primaryKey = 'id';
  static fillable = ['id','email','name'];
}

(async () => {
  const u = new User({ id: 1, email: 'a@b.com', name: 'Alice' });
  // dot-get
  console.log('email:', u.email);
  // dot-set
  u.email = 'c@d.com';
  console.log('updated email:', u.email);
  // simulate eager-loaded relation
  u.setLoadedRelation('profile', { bio: 'hello' });
  console.log('profile.bio:', u.profile?.bio);
  console.log('json:', JSON.stringify(u));
})();
