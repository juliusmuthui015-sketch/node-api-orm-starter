import {Model} from "../../eloquent/Model";

export class User extends Model {
    // static table = 'users';
    static primaryKey = 'id';
    static fillable = [
        'name','email','email_verified_at','password','active','last_login','last_seen_at',
        'last_login_ip','default_role_id','remember_token','created_at','updated_at','deleted_at',
        'active_status','avatar','dark_mode','messenger_color'
    ];
    static hidden = ['password', 'remember_token'];
    static casts = {
        id: 'int',
        active_status: 'int',
        dark_mode: 'int',
        created_at: 'datetime',
        updated_at: 'datetime',
        deleted_at: 'datetime',
        last_login: 'datetime',
        last_seen_at: 'datetime'
    } as any;

    // defaults for new instances
    constructor(attributes: any = {}) {
        super({ avatar: 'avatar.png', active_status: 0, dark_mode: 0, ...attributes });
    }
}

export default User;
