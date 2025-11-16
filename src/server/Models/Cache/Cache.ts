// filepath: /home/venom/PROJECTS/OPENSOURCE/RENTIVO-BACKEND/src/server/Models/Cache/Cache.ts
import { Model } from '@/eloquent/Model';

export class Cache extends Model {
  static table = 'cache_store';
  static primaryKey = 'k';
  static autoIncrement = false;
  static fillable = ['k', 'v', 'expires_at'];
  static hidden: string[] = [];

  constructor(attributes: any = {}) {
    super(attributes);
  }
}

export default Cache;
