import type { MigrationSchema, TableBuilder } from '../Schema';
import {EUserType} from "@/server/enums";
import {UserProfile} from "@/server/Models/User";

type QueryFn = (sql: string, params?: any[]) => Promise<any>;

// Migration: user_profile
module.exports.up = async function(schema: MigrationSchema, query: QueryFn) {
  return schema.createTable(UserProfile.getTable(), (table: TableBuilder) => {
    table.increments('id');
    table.enum('gender', ['male', 'female', 'other']).notNullable();
    table.enum('type', [EUserType.CARETAKER, EUserType.TENANT, EUserType.ADMIN, EUserType.AGENT, EUserType.LANDLORD]).default(EUserType.TENANT).notNullable();
    table.string('id_number').nullable();
    table.string('city').nullable();
    table.string('country').nullable();
    table.string('address').nullable();
    table.string('zip_code').nullable();
    table.integer('user_id').notNullable();
    table.datetime('date_of_birth').nullable();
    table.foreign('user_id').references('id').inTable('users').onDelete('cascade');
    table.timestamps();
    table.softDeletes();
  });
};

module.exports.down = async function(schema: MigrationSchema, query: QueryFn) {
  // Drop the table on rollback
  return schema.dropTable(UserProfile.getTable());
};
