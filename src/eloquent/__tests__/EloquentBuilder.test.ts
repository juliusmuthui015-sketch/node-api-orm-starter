/**
 * EloquentBuilder unit tests
 *
 * These tests exercise query-building logic in pure TypeScript — no real
 * database connection is needed.  We mock the DB module so the builder can be
 * tested in isolation.
 */

// ─── Minimal DB mock ─────────────────────────────────────────────────────────
jest.mock("@/config/db.config", () => ({
  getDbType: () => "mysql",
  query: jest.fn().mockResolvedValue([]),
  collection: jest.fn(),
}));

jest.mock("@/eloquent/DB", () => ({
  default: {
    executeQuery: jest.fn().mockResolvedValue([]),
    getSessionOptions: jest.fn().mockReturnValue({}),
  },
}));

// ─── Imports ─────────────────────────────────────────────────────────────────
import { EloquentBuilder } from "../EloquentBuilder";
import { Model } from "../Model";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Minimal concrete model for testing. */
class UserModel extends Model {
  static table = "users";
  static primaryKey = "id";
  static fillable = ["id", "email", "phone_number", "name", "status", "deleted_at"];
  static softDeletes = false;
}

class SoftUserModel extends Model {
  static table = "users";
  static primaryKey = "id";
  static fillable = ["id", "email", "phone_number", "name", "deleted_at"];
  static softDeletes = true;
}

function builder<T extends Model>(ModelClass: typeof Model = UserModel): EloquentBuilder<T> {
  return new EloquentBuilder<T>(ModelClass as any);
}

function sqlOf(b: EloquentBuilder<any>): string {
  return b.toSql();
}

// ─── where / orWhere ─────────────────────────────────────────────────────────

describe("where / orWhere", () => {
  it("produces AND clause for consecutive where() calls", () => {
    const sql = sqlOf(builder().where("email", "a@b.com").where("name", "Alice"));
    expect(sql).toContain("email = ?");
    expect(sql).toContain("AND users.name = ?");
  });

  it("produces OR clause for orWhere()", () => {
    const sql = sqlOf(builder().where("email", "a@b.com").orWhere("phone_number", "0700"));
    expect(sql).toContain("OR users.phone_number = ?");
  });

  it("wraps existing OR clauses in parentheses when soft-delete is active", () => {
    const sql = sqlOf(
      builder<any>(SoftUserModel).where("email", "a@b.com").orWhere("phone_number", "0700"),
    );
    // The soft-delete constraint must come before the nested group
    expect(sql).toMatch(/deleted_at IS NULL AND \(/i);
    // Both conditions must be inside a grouped block
    expect(sql).toContain("email = ?");
    expect(sql).toContain("OR users.phone_number = ?");
  });

  it("does NOT double-wrap when only AND clauses exist", () => {
    const sql = sqlOf(
      builder<any>(SoftUserModel).where("email", "a@b.com").where("name", "Alice"),
    );
    // No extra nesting
    expect(sql).not.toMatch(/\(\s*email/);
    expect(sql).toContain("deleted_at IS NULL");
  });

  it("supports nested where() callbacks for grouping", () => {
    const sql = sqlOf(
      builder()
        .where("status", "active")
        .where((q) => {
          q.where("email", "a@b.com").orWhere("phone_number", "0700");
        }),
    );
    expect(sql).toContain("status = ?");
    expect(sql).toMatch(/\(.*email = \?.*OR.*phone_number = \?.*\)/s);
  });

  it("supports three-argument where(column, operator, value)", () => {
    const sql = sqlOf(builder().where("id", ">", 5));
    expect(sql).toContain("id > ?");
  });
});

// ─── orWhereNull / orWhereNotNull ────────────────────────────────────────────

describe("orWhereNull / orWhereNotNull", () => {
  it("adds OR IS NULL clause", () => {
    const sql = sqlOf(builder().where("email", "x").orWhereNull("deleted_at"));
    expect(sql).toContain("OR users.deleted_at IS NULL");
  });

  it("adds OR IS NOT NULL clause", () => {
    const sql = sqlOf(builder().where("email", "x").orWhereNotNull("deleted_at"));
    expect(sql).toContain("OR users.deleted_at IS NOT NULL");
  });
});

// ─── orWhereIn / orWhereNotIn ────────────────────────────────────────────────

describe("orWhereIn / orWhereNotIn", () => {
  it("adds OR IN clause", () => {
    const sql = sqlOf(builder().where("name", "a").orWhereIn("status", ["active", "pending"]));
    expect(sql).toContain("OR users.status IN (?, ?)");
  });

  it("adds OR NOT IN clause", () => {
    const sql = sqlOf(builder().where("name", "a").orWhereNotIn("status", ["deleted"]));
    expect(sql).toContain("OR users.status NOT IN (?)");
  });
});

// ─── orWhereBetween / orWhereNotBetween ──────────────────────────────────────

describe("orWhereBetween / orWhereNotBetween", () => {
  it("adds OR BETWEEN clause", () => {
    const sql = sqlOf(builder().where("name", "x").orWhereBetween("id", [1, 10]));
    expect(sql).toContain("OR users.id BETWEEN ? AND ?");
  });

  it("adds OR NOT BETWEEN clause", () => {
    const sql = sqlOf(builder().where("name", "x").orWhereNotBetween("id", [1, 10]));
    expect(sql).toContain("OR users.id NOT BETWEEN ? AND ?");
  });
});

// ─── LIKE helpers ─────────────────────────────────────────────────────────────

describe("whereLike / orWhereLike / whereNotLike", () => {
  it("adds LIKE clause", () => {
    const sql = sqlOf(builder().whereLike("name", "%alice%"));
    expect(sql).toContain("name LIKE ?");
  });

  it("adds NOT LIKE clause", () => {
    const sql = sqlOf(builder().whereNotLike("name", "%spam%"));
    expect(sql).toContain("name NOT LIKE ?");
  });

  it("adds OR LIKE clause", () => {
    const sql = sqlOf(builder().where("email", "x").orWhereLike("name", "%ali%"));
    expect(sql).toContain("OR users.name LIKE ?");
  });
});

// ─── whereRaw / orWhereRaw ────────────────────────────────────────────────────

describe("whereRaw / orWhereRaw", () => {
  it("embeds raw SQL in WHERE", () => {
    const sql = sqlOf(builder().whereRaw("YEAR(created_at) = ?", [2024]));
    expect(sql).toContain("YEAR(created_at) = ?");
  });

  it("embeds raw OR SQL", () => {
    const sql = sqlOf(
      builder().where("email", "x").orWhereRaw("phone_number LIKE ?", ["%07%"]),
    );
    expect(sql).toContain("OR phone_number LIKE ?");
  });
});

// ─── when / unless / tap ─────────────────────────────────────────────────────

describe("when / unless / tap", () => {
  it("applies callback when condition is truthy", () => {
    const sql = sqlOf(builder().when(true, (q) => q.where("status", "active")));
    expect(sql).toContain("status = ?");
  });

  it("skips callback when condition is falsy", () => {
    const sql = sqlOf(builder().when(false, (q) => q.where("status", "active")));
    expect(sql).not.toContain("status");
  });

  it("applies else callback when condition is falsy", () => {
    const sql = sqlOf(
      builder().when(
        false,
        (q) => q.where("status", "active"),
        (q) => q.where("status", "pending"),
      ),
    );
    expect(sql).toContain("status = ?");
  });

  it("unless applies callback only when condition is falsy", () => {
    const sql = sqlOf(builder().unless(false, (q) => q.where("deleted_at", null)));
    expect(sql).toContain("deleted_at IS NULL");
  });

  it("tap does not alter the query", () => {
    let seen = false;
    const b = builder().where("email", "x");
    const sql = sqlOf(b.tap(() => (seen = true)));
    expect(seen).toBe(true);
    expect(sql).toContain("email = ?");
  });
});

// ─── clone ────────────────────────────────────────────────────────────────────

describe("clone", () => {
  it("cloned builder is independent of the original", () => {
    const original = builder().where("email", "x");
    const copy = original.clone().where("name", "Alice");
    expect(sqlOf(original)).not.toContain("name");
    expect(sqlOf(copy)).toContain("name = ?");
  });
});

// ─── toSql ────────────────────────────────────────────────────────────────────

describe("toSql", () => {
  it("returns a SELECT statement with table name", () => {
    const sql = sqlOf(builder());
    expect(sql).toMatch(/^SELECT \* FROM users$/);
  });

  it("includes LIMIT and ORDER BY", () => {
    const sql = sqlOf(builder().orderBy("name", "asc").limit(10).offset(5));
    expect(sql).toContain("ORDER BY name ASC");
    expect(sql).toContain("LIMIT 10");
    expect(sql).toContain("OFFSET 5");
  });

  it("includes DISTINCT", () => {
    const sql = sqlOf(builder().distinct().select("email"));
    expect(sql).toContain("SELECT DISTINCT email FROM users");
  });
});

// ─── orderBy helpers ─────────────────────────────────────────────────────────

describe("latest / oldest", () => {
  it("latest() orders by created_at DESC", () => {
    const sql = sqlOf(builder().latest());
    expect(sql).toContain("ORDER BY created_at DESC");
  });

  it("oldest() orders by created_at ASC", () => {
    const sql = sqlOf(builder().oldest());
    expect(sql).toContain("ORDER BY created_at ASC");
  });
});

// ─── join helpers ─────────────────────────────────────────────────────────────

describe("join variants", () => {
  it("inner join", () => {
    const sql = sqlOf(builder().join("roles", "users.id", "=", "roles.user_id"));
    expect(sql).toContain("INNER JOIN roles ON users.id = roles.user_id");
  });

  it("left join", () => {
    const sql = sqlOf(builder().leftJoin("roles", "users.id", "=", "roles.user_id"));
    expect(sql).toContain("LEFT JOIN roles ON users.id = roles.user_id");
  });

  it("right join", () => {
    const sql = sqlOf(builder().rightJoin("roles", "users.id", "=", "roles.user_id"));
    expect(sql).toContain("RIGHT JOIN roles ON users.id = roles.user_id");
  });

  it("cross join", () => {
    const sql = sqlOf(builder().crossJoin("sizes"));
    expect(sql).toContain("CROSS JOIN sizes");
  });
});

// ─── select / distinct / groupBy ──────────────────────────────────────────────

describe("select / groupBy / having", () => {
  it("limits selected columns", () => {
    const sql = sqlOf(builder().select(["id", "email"]));
    expect(sql).toContain("SELECT id,email FROM users");
  });

  it("groupBy", () => {
    const sql = sqlOf(builder().groupBy("status"));
    expect(sql).toContain("GROUP BY status");
  });
});

// ─── whereBetween ─────────────────────────────────────────────────────────────

describe("whereBetween / whereNotBetween", () => {
  it("BETWEEN", () => {
    const sql = sqlOf(builder().whereBetween("id", [1, 100]));
    expect(sql).toContain("id BETWEEN ? AND ?");
  });

  it("NOT BETWEEN", () => {
    const sql = sqlOf(builder().whereNotBetween("id", [1, 100]));
    expect(sql).toContain("id NOT BETWEEN ? AND ?");
  });
});

// ─── whereIn / whereNotIn ─────────────────────────────────────────────────────

describe("whereIn / whereNotIn", () => {
  it("IN clause", () => {
    const sql = sqlOf(builder().whereIn("id", [1, 2, 3]));
    expect(sql).toContain("id IN (?, ?, ?)");
  });

  it("NOT IN clause", () => {
    const sql = sqlOf(builder().whereNotIn("id", [4, 5]));
    expect(sql).toContain("id NOT IN (?, ?)");
  });
});

// ─── soft-delete scoping ──────────────────────────────────────────────────────

describe("soft-delete scoping", () => {
  it("injects deleted_at IS NULL automatically", () => {
    const sql = sqlOf(builder<any>(SoftUserModel).where("email", "x"));
    expect(sql).toContain("deleted_at IS NULL");
  });

  it("does NOT inject when includeTrashed is true", () => {
    const sql = sqlOf(builder<any>(SoftUserModel).withTrashed().where("email", "x"));
    expect(sql).not.toContain("deleted_at IS NULL");
  });

  it("onlyTrashed filters to soft-deleted rows only", () => {
    const sql = sqlOf(builder<any>(SoftUserModel).onlyTrashed());
    expect(sql).toContain("deleted_at IS NOT NULL");
  });
});

// ─── addSelect ────────────────────────────────────────────────────────────────

describe("addSelect", () => {
  it("appends columns to existing select", () => {
    const sql = sqlOf(builder().select("email").addSelect("name"));
    expect(sql).toContain("email");
    expect(sql).toContain("name");
  });
});
