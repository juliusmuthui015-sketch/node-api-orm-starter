/**
 * Model unit tests — SQL (MySQL)
 *
 * Covers: static query methods, instance save/delete/restore,
 * soft-delete scopes, batch update/delete, aggregate functions,
 * pluck/value/sole, local and global scopes, and model events.
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

class UserModel extends Model {
  static table = "users";
  static primaryKey = "id";
  static fillable = ["id", "name", "email", "status", "score"];
  static timestamps = false;
  static softDeletes = false;
  static autoIncrement = false;
  static relationships: Record<string, any> = {};
}

class SoftUserModel extends Model {
  static table = "soft_users";
  static primaryKey = "id";
  static fillable = ["id", "name", "email", "deleted_at"];
  static timestamps = false;
  static softDeletes = true;
  static autoIncrement = false;
  static relationships: Record<string, any> = {};
}

class AutoUserModel extends Model {
  static table = "auto_users";
  static primaryKey = "id";
  static fillable = ["name", "email"];
  static timestamps = false;
  static softDeletes = false;
  static autoIncrement = true;
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

// ─── Static query methods ─────────────────────────────────────────────────────

describe("static query methods", () => {
  it("all() fetches without WHERE", async () => {
    await UserModel.all();
    expect(lastSql()).toMatch(/SELECT \* FROM users/);
  });

  it("find(id) adds a WHERE id = ? LIMIT 1", async () => {
    await UserModel.find(42);
    const sql = lastSql();
    expect(sql).toContain("users.id = ?");
    expect(sql).toContain("LIMIT 1");
    expect(lastParams()).toContain(42);
  });

  it("where().first() adds WHERE and LIMIT 1", async () => {
    await UserModel.where("email", "a@b.com").first();
    const sql = lastSql();
    expect(sql).toContain("users.email = ?");
    expect(sql).toContain("LIMIT 1");
    expect(lastParams()).toContain("a@b.com");
  });

  it("firstOrFail() throws when no row returned", async () => {
    mockExecuteQuery.mockResolvedValue([]);
    await expect(UserModel.where("id", 999).firstOrFail()).rejects.toThrow();
  });

  it("firstOrFail() resolves when row exists", async () => {
    mockExecuteQuery.mockResolvedValue([{ id: 1, name: "Alice" }]);
    const user = await UserModel.where("id", 1).firstOrFail();
    expect(user.getAttribute("name")).toBe("Alice");
  });

  it("where().get() hydrates model instances", async () => {
    mockExecuteQuery.mockResolvedValue([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
    ]);
    const users = await UserModel.where("status", "active").get();
    expect(users).toHaveLength(2);
    expect(users[0]).toBeInstanceOf(UserModel);
    expect(users[0].getAttribute("name")).toBe("Alice");
  });

  it("count() emits COUNT query and returns a number", async () => {
    mockExecuteQuery.mockResolvedValue([{ agg: "7" }]);
    const n = await UserModel.where("status", "active").count();
    expect(lastSql()).toContain("COUNT(*)");
    expect(n).toBe(7);
  });

  it("exists() returns true when count > 0", async () => {
    mockExecuteQuery.mockResolvedValue([{ agg: "1" }]);
    expect(await UserModel.where("id", 1).exists()).toBe(true);
  });

  it("doesntExist() returns true when count = 0", async () => {
    mockExecuteQuery.mockResolvedValue([{ agg: "0" }]);
    expect(await UserModel.where("id", 999).doesntExist()).toBe(true);
  });
});

// ─── paginate ─────────────────────────────────────────────────────────────────

describe("paginate", () => {
  it("issues a COUNT query then a data query with LIMIT/OFFSET", async () => {
    mockExecuteQuery
      .mockResolvedValueOnce([{ count: "25" }]) // count query
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]); // data query

    const result = await UserModel.query().paginate(10, 2);
    expect(result.pagination!.total).toBe(25);
    expect(result.pagination!.lastPage).toBe(3);
    expect(result.pagination!.currentPage).toBe(2);
    expect(result.pagination!.perPage).toBe(10);
    expect(result.data).toHaveLength(2);
    // Data query must include LIMIT/OFFSET
    const dataSql = mockExecuteQuery.mock.calls[1][0];
    expect(dataSql).toContain("LIMIT 10");
    expect(dataSql).toContain("OFFSET 10");
  });
});

// ─── aggregate helpers ────────────────────────────────────────────────────────

describe("aggregate helpers", () => {
  it("max() executes MAX aggregate", async () => {
    mockExecuteQuery.mockResolvedValue([{ agg: "99" }]);
    const v = await UserModel.query().max("score");
    expect(lastSql()).toContain("MAX(score)");
    expect(v).toBe(99);
  });

  it("min() executes MIN aggregate", async () => {
    mockExecuteQuery.mockResolvedValue([{ agg: "1" }]);
    const v = await UserModel.query().min("score");
    expect(lastSql()).toContain("MIN(score)");
    expect(v).toBe(1);
  });

  it("sum() executes SUM aggregate", async () => {
    mockExecuteQuery.mockResolvedValue([{ agg: "450" }]);
    const v = await UserModel.query().sum("score");
    expect(lastSql()).toContain("SUM(score)");
    expect(v).toBe(450);
  });

  it("avg() executes AVG aggregate", async () => {
    mockExecuteQuery.mockResolvedValue([{ agg: "45" }]);
    const v = await UserModel.query().avg("score");
    expect(lastSql()).toContain("AVG(score)");
    expect(v).toBe(45);
  });
});

// ─── pluck / value / sole ─────────────────────────────────────────────────────

describe("pluck / value / sole", () => {
  it("pluck() returns an array of column values", async () => {
    mockExecuteQuery.mockResolvedValue([
      { id: 1, email: "a@b.com" },
      { id: 2, email: "c@d.com" },
    ]);
    const emails = await UserModel.query().pluck("email");
    expect(emails).toEqual(["a@b.com", "c@d.com"]);
  });

  it("pluck(col, key) returns a key-value map", async () => {
    mockExecuteQuery.mockResolvedValue([
      { id: 1, email: "a@b.com" },
      { id: 2, email: "c@d.com" },
    ]);
    const map = await UserModel.query().pluck("email", "id");
    expect(map).toEqual({ 1: "a@b.com", 2: "c@d.com" });
  });

  it("value() returns the first row's column value", async () => {
    mockExecuteQuery.mockResolvedValue([{ email: "a@b.com" }]);
    const email = await UserModel.where("id", 1).value("email");
    expect(email).toBe("a@b.com");
  });

  it("value() returns null when no rows", async () => {
    mockExecuteQuery.mockResolvedValue([]);
    const v = await UserModel.where("id", 999).value("email");
    expect(v).toBeNull();
  });

  it("sole() returns the unique result", async () => {
    mockExecuteQuery.mockResolvedValue([{ id: 1, name: "Alice" }]);
    const user = await UserModel.where("id", 1).sole();
    expect(user.getAttribute("name")).toBe("Alice");
  });

  it("sole() throws when no results", async () => {
    mockExecuteQuery.mockResolvedValue([]);
    await expect(UserModel.where("id", 999).sole()).rejects.toThrow();
  });

  it("sole() throws when more than one result", async () => {
    mockExecuteQuery.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    await expect(UserModel.where("status", "active").sole()).rejects.toThrow();
  });
});

// ─── Model instance — save (INSERT) ──────────────────────────────────────────

describe("Model instance — save (INSERT)", () => {
  it("save() on new instance runs INSERT", async () => {
    const user = new UserModel();
    user.setAttribute("id", 10);
    user.setAttribute("name", "Alice");
    user.setAttribute("email", "alice@example.com");

    await user.save();

    const sql = lastSql();
    expect(sql).toMatch(/^INSERT INTO users/i);
    expect(user["__exists"]).toBe(true);
  });

  it("save() on auto-increment model reads back insertId", async () => {
    mockExecuteQuery.mockResolvedValue({ insertId: 7 } as any);
    const user = new AutoUserModel();
    user.setAttribute("name", "Bob");
    user.setAttribute("email", "bob@example.com");

    await user.save();

    expect(lastSql()).toMatch(/INSERT INTO auto_users/i);
    expect(user.getAttribute("id")).toBe(7);
  });
});

// ─── Model instance — save (UPDATE) ──────────────────────────────────────────

describe("Model instance — save (UPDATE)", () => {
  it("save() on existing instance runs UPDATE only dirty columns", async () => {
    const user = new UserModel();
    user.setAttribute("id", 5);
    user.setAttribute("name", "Alice");
    user["__exists"] = true;
    user["original"] = { id: 5, name: "Alice" };

    user.setAttribute("name", "Alicia");

    await user.save();

    const sql = lastSql();
    expect(sql).toMatch(/UPDATE users SET/i);
    expect(sql).toContain("name = ?");
    expect(lastParams()).toContain("Alicia");
    expect(lastParams()).toContain(5); // WHERE id = 5
  });

  it("save() with no dirty fields does not execute any query", async () => {
    const user = new UserModel();
    user.setAttribute("id", 5);
    user.setAttribute("name", "Alice");
    user["__exists"] = true;
    user["original"] = { id: 5, name: "Alice" };

    await user.save(); // nothing changed

    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });
});

// ─── Model instance — delete ──────────────────────────────────────────────────

describe("Model instance — delete", () => {
  it("hard delete runs DELETE statement", async () => {
    const user = new UserModel();
    user.setAttribute("id", 3);
    user["__exists"] = true;

    const ok = await user.delete();

    expect(ok).toBe(true);
    const sql = lastSql();
    expect(sql).toMatch(/DELETE FROM users WHERE/i);
    expect(lastParams()).toContain(3);
  });

  it("soft delete runs UPDATE SET deleted_at", async () => {
    const su = new SoftUserModel();
    su.setAttribute("id", 7);
    su["__exists"] = true;

    const ok = await su.delete();

    expect(ok).toBe(true);
    const sql = lastSql();
    expect(sql).toMatch(/UPDATE soft_users SET deleted_at/i);
    expect(lastParams()[1]).toBe(7);
  });

  it("delete() returns false when id is missing", async () => {
    const user = new UserModel();
    const ok = await user.delete();
    expect(ok).toBe(false);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });
});

// ─── Model instance — restore ─────────────────────────────────────────────────

describe("Model instance — restore", () => {
  it("restore() clears deleted_at for soft-delete models", async () => {
    const su = new SoftUserModel();
    su.setAttribute("id", 7);
    su.setAttribute("deleted_at", new Date("2024-01-01"));
    su["__exists"] = true;

    const ok = await su.restore();

    expect(ok).toBe(true);
    const sql = lastSql();
    expect(sql).toContain("deleted_at");
    expect(su.getAttribute("deleted_at")).toBeNull();
  });

  it("restore() does nothing on models without softDeletes", async () => {
    const user = new UserModel();
    user.setAttribute("id", 1);
    user["__exists"] = true;

    const ok = await user.restore();

    expect(ok).toBe(false);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });
});

// ─── Model instance — forceDelete ─────────────────────────────────────────────

describe("Model instance — forceDelete", () => {
  it("forceDelete() always runs DELETE even for soft-delete model", async () => {
    const su = new SoftUserModel();
    su.setAttribute("id", 9);
    su["__exists"] = true;

    const ok = await su.forceDelete();

    expect(ok).toBe(true);
    expect(lastSql()).toMatch(/DELETE FROM soft_users WHERE/i);
  });
});

// ─── Builder batch operations ─────────────────────────────────────────────────

describe("builder batch operations", () => {
  it("update() emits UPDATE with SET and WHERE", async () => {
    mockExecuteQuery.mockResolvedValue({ affectedRows: 3 } as any);
    const affected = await UserModel.where("status", "inactive").update({ status: "archived" });
    expect(lastSql()).toMatch(/UPDATE users SET/i);
    expect(lastSql()).toContain("status = ?");
    expect(affected).toBe(3);
  });

  it("delete() on builder emits DELETE with WHERE", async () => {
    await UserModel.where("status", "deleted").delete();
    expect(lastSql()).toMatch(/DELETE FROM users WHERE/i);
  });

  it("increment() emits UPDATE col = col + ?", async () => {
    await UserModel.where("id", 1).increment("score");
    expect(lastSql()).toContain("score = score + ?");
    expect(lastParams()[0]).toBe(1);
  });

  it("decrement() emits UPDATE col = col - ?", async () => {
    await UserModel.where("id", 1).decrement("score", 5);
    expect(lastSql()).toContain("score = score - ?");
    expect(lastParams()[0]).toBe(5);
  });

  it("create() saves and returns a model instance", async () => {
    await UserModel.query().create({ id: 1, name: "Alice", email: "a@b.com" });
    expect(lastSql()).toMatch(/INSERT INTO users/i);
  });
});

// ─── Soft-delete query scopes ─────────────────────────────────────────────────

describe("soft-delete query scopes", () => {
  it("default query includes deleted_at IS NULL", async () => {
    await SoftUserModel.all();
    expect(lastSql()).toContain("deleted_at IS NULL");
  });

  it("withTrashed() omits deleted_at IS NULL", async () => {
    await SoftUserModel.withTrashed().get();
    expect(lastSql()).not.toContain("deleted_at IS NULL");
  });

  it("onlyTrashed() queries deleted_at IS NOT NULL", async () => {
    await SoftUserModel.onlyTrashed().get();
    expect(lastSql()).toContain("deleted_at IS NOT NULL");
  });
});

// ─── Local and global scopes ──────────────────────────────────────────────────

describe("global scopes", () => {
  class ScopedModel extends Model {
    static table = "scoped";
    static primaryKey = "id";
    static fillable = ["id", "name", "tenant_id"];
    static timestamps = false;
    static softDeletes = false;
    static autoIncrement = false;
    static relationships: Record<string, any> = {};
    static globalScopes: Record<string, any> = {
      tenant: (b: EloquentBuilder<any>) => b.where("tenant_id", 99),
    };
    static localScopes: Record<string, any> = {};
    static withoutGlobalScopes: string[] = [];
  }

  beforeEach(() => {
    // Re-attach globalScopes after potential reset
    ScopedModel.globalScopes = {
      tenant: (b: EloquentBuilder<any>) => b.where("tenant_id", 99),
    };
  });

  it("global scope is automatically applied to all queries", async () => {
    await ScopedModel.query().get();
    expect(lastSql()).toContain("tenant_id = ?");
    expect(lastParams()).toContain(99);
  });
});

// ─── Model events ─────────────────────────────────────────────────────────────

describe("model events", () => {
  function freshListeners() {
    return {
      creating: [], created: [], updating: [], updated: [],
      saving: [], saved: [], deleting: [], deleted: [],
      restoring: [], restored: [], retrieved: [],
    };
  }

  beforeEach(() => {
    const listeners = freshListeners();
    (UserModel as any).eventListeners = listeners;
    // Keep prototype in sync so on() and fireModelEvent() share the same object
    (UserModel as any).prototype.eventListeners = listeners;
  });

  it("creating event fires before INSERT", async () => {
    const log: string[] = [];
    UserModel.on("creating", () => {
      log.push("creating");
    });

    const user = new UserModel();
    user.setAttribute("id", 100);
    user.setAttribute("name", "Eve");
    await user.save();

    expect(log).toContain("creating");
  });

  it("returning false from creating event cancels the save", async () => {
    UserModel.on("creating", () => false);

    const user = new UserModel();
    user.setAttribute("id", 200);
    user.setAttribute("name", "Cancelled");
    await user.save();

    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });
});
