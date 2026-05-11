/**
 * whereHas / orWhereHas / whereDoesntHave tests
 *
 * Tests SQL subquery generation for relationship existence conditions,
 * including callbacks, operators, chaining, and nested has conditions.
 */

// ─── DB mock ─────────────────────────────────────────────────────────────────
const mockExecuteQuery = jest.fn();

jest.mock("@/config/db.config", () => ({
  getDbType: () => "mysql",
  query: mockExecuteQuery,
  collection: jest.fn(),
}));

jest.mock("@/eloquent/DB", () => ({
  __esModule: true,
  default: {
    executeQuery: mockExecuteQuery,
    getSessionOptions: jest.fn().mockReturnValue({}),
  },
}));

// ─── Imports ─────────────────────────────────────────────────────────────────
import { Model } from "../Model";
import { EloquentBuilder } from "../EloquentBuilder";

// ─── Test models ──────────────────────────────────────────────────────────────

class PostModel extends Model {
  static table = "posts";
  static primaryKey = "id";
  static fillable = ["id", "user_id", "category_id", "title", "published"];
  static timestamps = false;
  static softDeletes = false;
  static autoIncrement = false;
  static relationships: Record<string, any> = {};

  comments() {
    return this.hasMany(CommentModel, "post_id", "id");
  }
}

class CommentModel extends Model {
  static table = "comments";
  static primaryKey = "id";
  static fillable = ["id", "post_id", "user_id", "body"];
  static timestamps = false;
  static softDeletes = false;
  static autoIncrement = false;
  static relationships: Record<string, any> = {};
}

class TagModel extends Model {
  static table = "tags";
  static primaryKey = "id";
  static fillable = ["id", "name"];
  static timestamps = false;
  static softDeletes = false;
  static autoIncrement = false;
  static relationships: Record<string, any> = {};
}

class CategoryModel extends Model {
  static table = "categories";
  static primaryKey = "id";
  static fillable = ["id", "name"];
  static timestamps = false;
  static softDeletes = false;
  static autoIncrement = false;
  static relationships: Record<string, any> = {};
}

class UserModel extends Model {
  static table = "users";
  static primaryKey = "id";
  static fillable = ["id", "name", "email", "status"];
  static timestamps = false;
  static softDeletes = false;
  static autoIncrement = false;
  static relationships: Record<string, any> = {};

  posts() {
    return this.hasMany(PostModel, "user_id", "id");
  }

  profile() {
    return this.hasOne(ProfileModel, "user_id", "id");
  }

  comments() {
    return this.hasMany(CommentModel, "user_id", "id");
  }

  tags() {
    return this.belongsToMany(TagModel, "user_tags", "user_id", "tag_id");
  }

  category() {
    return this.belongsTo(CategoryModel, "category_id", "id");
  }
}

class ProfileModel extends Model {
  static table = "user_profiles";
  static primaryKey = "id";
  static fillable = ["id", "user_id", "bio"];
  static timestamps = false;
  static softDeletes = false;
  static autoIncrement = false;
  static relationships: Record<string, any> = {};
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function lastSql(): string {
  const calls = mockExecuteQuery.mock.calls;
  return calls[calls.length - 1]?.[0] ?? "";
}

function lastParams(): any[] {
  const calls = mockExecuteQuery.mock.calls;
  return calls[calls.length - 1]?.[1] ?? [];
}

// ─── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockExecuteQuery.mockReset();
  mockExecuteQuery.mockResolvedValue([]);
});

// ─── whereHas ─────────────────────────────────────────────────────────────────

describe("whereHas", () => {
  it("generates a COUNT subquery for hasMany", async () => {
    await UserModel.query().whereHas("posts").get();
    const sql = lastSql();
    expect(sql).toContain("SELECT COUNT(*)");
    expect(sql).toContain("FROM posts");
    expect(sql).toContain("user_id = users.id");
    expect(sql).toContain(">= ?");
    expect(lastParams()).toContain(1); // default count threshold
  });

  it("generates a COUNT subquery for hasOne", async () => {
    await UserModel.query().whereHas("profile").get();
    const sql = lastSql();
    expect(sql).toContain("FROM user_profiles");
    expect(sql).toContain("user_id = users.id");
  });

  it("with custom operator and count", async () => {
    await UserModel.query().whereHas("posts", undefined, ">", 5).get();
    const sql = lastSql();
    expect(sql).toContain("> ?");
    expect(lastParams()).toContain(5);
  });

  it("callback adds extra WHERE inside subquery", async () => {
    await UserModel.query().whereHas("posts", (q) => {
      q.where("published", 1);
    }).get();
    const sql = lastSql();
    expect(sql).toContain("published = ?");
    expect(lastParams()).toContain(1);
  });

  it("callback with multiple clauses", async () => {
    await UserModel.query().whereHas("posts", (q) => {
      q.where("published", 1).where("title", "Hello");
    }).get();
    const sql = lastSql();
    expect(sql).toContain("published = ?");
    expect(sql).toContain("title = ?");
    expect(lastParams()).toContain("Hello");
  });

  it("whereHas for belongsToMany uses JOIN on pivot", async () => {
    await UserModel.query().whereHas("tags").get();
    const sql = lastSql();
    expect(sql).toContain("user_tags");
    expect(sql).toContain("tags");
  });

  it("whereHas for belongsTo generates correct subquery", async () => {
    await UserModel.query().whereHas("category").get();
    const sql = lastSql();
    expect(sql).toContain("FROM categories");
  });
});

// ─── orWhereHas ───────────────────────────────────────────────────────────────

describe("orWhereHas", () => {
  it("appends OR to the has condition", async () => {
    await UserModel.where("status", "active").orWhereHas("posts").get();
    const sql = lastSql();
    expect(sql).toContain("status = ?");
    // OR has condition is present in generated SQL
    expect(sql).toContain("SELECT COUNT(*)");
    expect(sql).toContain("OR");
  });

  it("standalone orWhereHas includes subquery", async () => {
    await UserModel.query().orWhereHas("posts").get();
    const sql = lastSql();
    expect(sql).toContain("SELECT COUNT(*)");
  });
});

// ─── whereDoesntHave ──────────────────────────────────────────────────────────

describe("whereDoesntHave", () => {
  it("generates count = 0 subquery", async () => {
    await UserModel.query().whereDoesntHave("posts").get();
    const sql = lastSql();
    expect(sql).toContain("SELECT COUNT(*)");
    expect(sql).toContain("= ?");
    expect(lastParams()).toContain(0);
  });

  it("combines with regular where clause", async () => {
    await UserModel.where("status", "active").whereDoesntHave("posts").get();
    const sql = lastSql();
    expect(sql).toContain("status = ?");
    expect(sql).toContain("SELECT COUNT(*)");
    expect(lastParams()).toContain("active");
    expect(lastParams()).toContain(0);
  });
});

// ─── chained whereHas ─────────────────────────────────────────────────────────

describe("chained whereHas (multiple relations)", () => {
  it("two chained whereHas both appear in SQL", async () => {
    await UserModel.query().whereHas("posts").whereHas("comments").get();
    const sql = lastSql();
    // Both subqueries must be present
    const countOccurrences = (str: string, sub: string) =>
      (str.match(new RegExp(sub, "g")) || []).length;
    expect(countOccurrences(sql, "SELECT COUNT")).toBeGreaterThanOrEqual(2);
    expect(sql).toContain("FROM posts");
    expect(sql).toContain("FROM comments");
  });

  it("where + whereHas + orWhereHas", async () => {
    await UserModel.where("status", "active").whereHas("posts").orWhereHas("comments").get();
    const sql = lastSql();
    expect(sql).toContain("status = ?");
    expect(sql).toContain("FROM posts");
    expect(sql).toContain("FROM comments");
    expect(sql).toContain("OR");
  });
});

// ─── nested whereHas (callback with whereHas inside) ─────────────────────────

describe("nested whereHas inside callback", () => {
  it("whereHas with inner whereHas generates nested subquery", async () => {
    // Users who have posts that have comments
    await UserModel.query().whereHas("posts", (q) => {
      q.whereHas("comments");
    }).get();
    const sql = lastSql();
    expect(sql).toContain("SELECT COUNT(*)");
    // The outer subquery references posts; the inner one should reference comments
    expect(sql).toContain("FROM posts");
    expect(sql).toContain("FROM comments");
  });
});

// ─── chained nested queries ───────────────────────────────────────────────────

describe("chained and nested query builder", () => {
  it("multiple where + orWhere with whereHas", async () => {
    await UserModel.where("status", "active")
      .orWhere("status", "pending")
      .whereHas("posts")
      .get();

    const sql = lastSql();
    expect(sql).toContain("status = ?");
    expect(sql).toContain("OR");
    expect(sql).toContain("SELECT COUNT(*)");
  });

  it("where with closure groups + whereHas", async () => {
    await UserModel.query()
      .where((q: EloquentBuilder<any>) => {
        q.where("status", "active").orWhere("status", "pending");
      })
      .whereHas("posts")
      .get();

    const sql = lastSql();
    // Closure should produce a grouped WHERE clause
    expect(sql).toContain("(");
    expect(sql).toContain("OR");
    expect(sql).toContain("SELECT COUNT(*)");
  });

  it("whereHas with orderBy and limit still generates correct SQL", async () => {
    await UserModel.query().whereHas("posts").orderBy("name", "asc").limit(10).get();
    const sql = lastSql();
    expect(sql).toContain("SELECT COUNT(*)");
    expect(sql).toContain("ORDER BY name ASC");
    expect(sql).toContain("LIMIT 10");
  });
});
