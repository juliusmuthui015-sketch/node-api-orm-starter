import {Model} from "@/eloquent/Model";
import Role from './Role';
import UserProfile from "@/server/Models/User/UserProfile";

export class User extends Model {
    // static table = 'users';
    static primaryKey = 'id';
    static fillable = [
        'name','email','email_verified_at','password','active','last_login','last_seen_at',
        'last_login_ip','default_role_id','remember_token','created_at','updated_at','deleted_at',
        'active_status','avatar','dark_mode','messenger_color', 'phone_number'
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
        last_seen_at: 'datetime'
    } as any;

    // static relationships = {
    //     roles: {
    //         type: 'belongsToMany',
    //         model: Role,
    //         table: ['roles', 'users'].sort().join('_') // roles_users
    //     }
    // } as any;

    roles(){
        return this.belongsToMany(Role, 'roles_users', 'users_id', 'roles_id')
    }

    profile(){
        return this.hasOne(UserProfile, 'user_id', 'id');
    }
    // defaults for new instances
    constructor(attributes: any = {}) {
        super({ avatar: 'avatar.png', active_status: 0, dark_mode: 0, ...attributes });
    }
}

export default User;
