// Smoke test for local/global scopes and Laravel-style scope methods
import { Model } from "@/eloquent/Model";
import { EloquentBuilder } from "@/eloquent/EloquentBuilder";

class ScopeUser extends Model {
  static table = "users";
  static fillable = ["name", "email", "status", "role", "followers_count"];

  // Local scopes
  static localScopes = {
    active: (b: EloquentBuilder<any>) => b.where("status", "active"),
    role: (b: EloquentBuilder<any>, role: string) => b.where("role", role),
    verified: (b: EloquentBuilder<any>) => b.where("email_verified_at", "!=", null),
  };

  // Global scopes
  static globalScopes = {
    defaultOrder: (b: EloquentBuilder<any>) => b.orderBy("name", "asc"),
    excludeBanned: (b: EloquentBuilder<any>) => b.where("status", "!=", "banned"),
  };

  // Laravel-style named scopes
  static scopePopular(b: EloquentBuilder<any>, minFollowers: number = 100) {
    return b.where("followers_count", ">=", minFollowers);
  }
}

async function run() {
  // No need to call boot(); query() ensures traits/scopes initialized
  const b1 = ScopeUser.scope("active");
  console.log("applied scopes after active:", (b1 as any).getAppliedScopes?.());

  const b2 = ScopeUser.scope("active").scope("role", "admin");
  console.log("applied scopes after active+role:", (b2 as any).getAppliedScopes?.());

  const b3 = ScopeUser.scope("popular", 500);
  console.log("applied scopes after popular:", (b3 as any).getAppliedScopes?.());

  // Without global scope should still return a builder
  const b4 = ScopeUser.withoutGlobalScope("excludeBanned");
  console.log("withoutGlobalScope builder exists:", !!b4);

  // Chain multiple local scopes
  const b5 = ScopeUser.scope("active").scope("verified");
  console.log("applied scopes after active+verified:", (b5 as any).getAppliedScopes?.());
}

run().catch((e) => console.error("scopes-smoke error:", e));

