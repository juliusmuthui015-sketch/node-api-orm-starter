import { Model, use } from '@/eloquent/Model';
import Role from './Role';
import FileModel from '@/app/Models/File/File';
import UserProfile from '@/app/Models/User/UserProfile';
import { EUserType } from '@/app/Enums';
import { RolesUsers } from '@/app/Models/User/RolesUsers';
import { Cacheable, Sortable, Timestamps } from '@/eloquent/Traits/built-ins';
import { SoftDeletes } from '@/eloquent/Traits/SoftDeletes';

@use(Sortable, SoftDeletes, Timestamps, Cacheable)
export class User extends Model {
  // static table = 'users';
  static primaryKey = 'id';
  static fillable = [
    'name',
    'email',
    'email_verified_at',
    'password',
    'active',
    'last_login',
    'last_seen_at',
    'last_login_ip',
    'default_role_id',
    'remember_token',
    'created_at',
    'updated_at',
    'deleted_at',
    'active_status',
    'status',
    'avatar',
    'dark_mode',
    'messenger_color',
    'phone_number', // removed legacy landlord_id
  ];
  static hidden = ['password', 'remember_token'];
  static casts = {
    // id: 'int',
    active_status: 'int',
    dark_mode: 'int',
    created_at: 'datetime',
    updated_at: 'datetime',
    deleted_at: 'datetime',
    last_login: 'datetime',
    last_seen_at: 'datetime',
  } as any;

  // static relationships = {
  //     roles: {
  //         type: 'belongsToMany',
  //         model: Role,
  //         table: ['roles', 'users'].sort().join('_') // roles_users
  //     }
  // } as any;

  roles() {
    return this.belongsToMany(Role, RolesUsers.getTable(), 'users_id', 'roles_id');
  }
  profile() {
    return this.hasOne(UserProfile, 'user_id', 'id');
  }

  files() {
    return this.hasMany(FileModel, 'user_id');
  }

  isAdmin() {
    return this.getUserType(EUserType.ADMIN);
  }

  isAgent() {
    return this.getUserType(EUserType.AGENT);
  }

  isLandlord() {
    return this.getUserType(EUserType.LANDLORD);
  }

  isTenant() {
    return this.getUserType(EUserType.TENANT);
  }

  isCaretaker() {
    return this.getUserType(EUserType.CARETAKER);
  }

  private getUserType(type: EUserType) {
    if (typeof this.profile == 'function') {
      return this.profile().where('type', type).exists();
    }

    return (this as any)?.profile?.type == type;
  }

  // defaults for new instances
  constructor(attributes: any = {}) {
    super({ avatar: 'avatar.png', active_status: 0, dark_mode: 0, ...attributes });
  }

  isActive() {
      const status = this.getAttribute("status")
      return (typeof status) == "undefined"  || status && (status == "active" || status == null)
  }
}

export default User;
