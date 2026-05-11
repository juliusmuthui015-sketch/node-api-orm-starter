/**
 * Relationship unit tests
 *
 * Tests cover: thenable protocol, FK-mutation safety, withDefault,
 * HasOneThrough, HasManyThrough, and query builder delegation.
 */

// ─── DB mock ──────────────────────────────────────────────────────────────────
const mockDbQuery = jest.fn().mockResolvedValue([]);
jest.mock("@/config/db.config", () => ({
  getDbType: () => "mysql",
  query: mockDbQuery,
  collection: jest.fn(),
}));

jest.mock("@/eloquent/DB", () => ({
  __esModule: true,
  default: {
    executeQuery: mockDbQuery,
    getSessionOptions: jest.fn().mockReturnValue({}),
  },
}));

// ─── Imports ─────────────────────────────────────────────────────────────────
import { Model } from "../Model";
import {
  HasOne,
  HasMany,
  BelongsTo,
  BelongsToMany,
  HasOneThrough,
  HasManyThrough,
} from "../relationships";

// ─── Global reset — prevents Once() values from leaking between describes ─────
beforeEach(() => {
  mockDbQuery.mockReset();
  mockDbQuery.mockResolvedValue([]);
});

// ─── Minimal models ───────────────────────────────────────────────────────────

class UserModel extends Model {
  static table = "users";
  static primaryKey = "id";
  static fillable = ["id", "name", "email"];
  static softDeletes = false;
}

class ProfileModel extends Model {
  static table = "user_profiles";
  static primaryKey = "id";
  static fillable = ["id", "user_id", "gender", "type", "deleted_at"];
  static softDeletes = true;
}

class PostModel extends Model {
  static table = "posts";
  static primaryKey = "id";
  static fillable = ["id", "user_id", "country_id", "title"];
  static softDeletes = false;
}

class CountryModel extends Model {
  static table = "countries";
  static primaryKey = "id";
  static fillable = ["id", "name"];
  static softDeletes = false;
}

/** Build a hydrated User model instance. */
function makeUser(attrs: Record<string, any> = {}): UserModel {
  const u = new UserModel();
  Object.entries({ id: 1, name: "Alice", ...attrs }).forEach(([k, v]) =>
    u.setAttribute(k, v),
  );
  (u as any).__exists = true;
  return u;
}

// ─── HasOne ───────────────────────────────────────────────────────────────────

describe("HasOne", () => {
  beforeEach(() => mockDbQuery.mockResolvedValue([]));

  it("is thenable — await user.profile() resolves via getResults()", async () => {
    const user = makeUser({ id: 42 });
    const rel = new HasOne(ProfileModel as any, "user_id", "id", user);
    const result = await rel;
    // No matching row → returns null (soft-deleted model, no rows returned)
    expect(result).toBeNull();
  });

  it("applies FK constraint exactly once (no duplicates on repeated calls)", async () => {
    mockDbQuery.mockResolvedValue([{ id: 1, user_id: 42, gender: "M" }]);
    const user = makeUser({ id: 42 });
    const rel = new HasOne(ProfileModel as any, "user_id", "id", user);

    const r1 = await rel.first();
    const r2 = await rel.first(); // second call must not add FK clause twice
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();

    // Verify the SQL sent to the DB had user_id only once
    const calls = mockDbQuery.mock.calls;
    calls.forEach((args: any[]) => {
      const sql: string = args[0];
      const matches = (sql.match(/user_id/g) || []).length;
      expect(matches).toBeLessThanOrEqual(1);
    });
  });

  it("withDefault() returns an empty model instance when result is null", async () => {
    mockDbQuery.mockResolvedValue([]);
    const user = makeUser({ id: 99 });
    const rel = new HasOne(ProfileModel as any, "user_id", "id", user).withDefault();
    const result = await rel;
    expect(result).toBeInstanceOf(ProfileModel);
  });

  it("withDefault(attrs) pre-fills the default model", async () => {
    mockDbQuery.mockResolvedValue([]);
    const user = makeUser({ id: 99 });
    const rel = new HasOne(ProfileModel as any, "user_id", "id", user).withDefault({
      gender: "unknown",
    });
    const result = (await rel) as ProfileModel;
    expect(result).toBeInstanceOf(ProfileModel);
    expect(result.getAttribute("gender")).toBe("unknown");
  });

  it("returns null when parent has no id", async () => {
    const user = new UserModel();
    const rel = new HasOne(ProfileModel as any, "user_id", "id", user);
    expect(await rel).toBeNull();
  });

  it("extra where() constraints are forwarded to the builder", async () => {
    mockDbQuery.mockResolvedValue([{ id: 5, user_id: 1, type: "admin" }]);
    const user = makeUser({ id: 1 });
    const rel = new HasOne(ProfileModel as any, "user_id", "id", user);
    await rel.where("type", "admin").first();
    const sql: string = mockDbQuery.mock.calls.at(-1)?.[0] ?? "";
    expect(sql).toContain("type");
  });
});

// ─── HasMany ──────────────────────────────────────────────────────────────────

describe("HasMany", () => {
  beforeEach(() => mockDbQuery.mockResolvedValue([]));

  it("is thenable — resolves to an array", async () => {
    const user = makeUser({ id: 1 });
    const rel = new HasMany(PostModel as any, "user_id", "id", user);
    const result = await rel;
    expect(Array.isArray(result)).toBe(true);
  });

  it("returns [] when parent has no id", async () => {
    const user = new UserModel();
    const rel = new HasMany(PostModel as any, "user_id", "id", user);
    expect(await rel).toEqual([]);
  });

  it("FK constraint applied only once across multiple calls", async () => {
    mockDbQuery.mockResolvedValue([{ id: 10, user_id: 5, title: "Post A" }]);
    const user = makeUser({ id: 5 });
    const rel = new HasMany(PostModel as any, "user_id", "id", user);
    await rel.getResults();
    await rel.getResults();

    const calls = mockDbQuery.mock.calls;
    calls.forEach((args: any[]) => {
      const sql: string = args[0];
      const matches = (sql.match(/user_id/g) || []).length;
      expect(matches).toBeLessThanOrEqual(1);
    });
  });
});

// ─── BelongsTo ───────────────────────────────────────────────────────────────

describe("BelongsTo", () => {
  beforeEach(() => mockDbQuery.mockResolvedValue([]));

  it("is thenable", async () => {
    const profile = new ProfileModel();
    profile.setAttribute("id", 1);
    profile.setAttribute("user_id", 10);
    const rel = new BelongsTo(UserModel as any, "user_id", "id", profile);
    const result = await rel;
    expect(result).toBeNull();
  });

  it("withDefault() returns empty instance when FK is null", async () => {
    const profile = new ProfileModel(); // no user_id
    const rel = new BelongsTo(UserModel as any, "user_id", "id", profile).withDefault({
      name: "Guest",
    });
    const result = (await rel) as UserModel;
    expect(result).toBeInstanceOf(UserModel);
    expect(result.getAttribute("name")).toBe("Guest");
  });
});

// ─── HasOneThrough ────────────────────────────────────────────────────────────

describe("HasOneThrough", () => {
  it("queries through the intermediate table", async () => {
    // 1st call: find through row; 2nd call: find related row
    mockDbQuery
      .mockResolvedValueOnce([{ id: 10, user_id: 1 }]) // policies row
      .mockResolvedValueOnce([{ id: 20, policy_id: 10 }]); // insurances row

    const user = makeUser({ id: 1 });
    const rel = new HasOneThrough(
      PostModel as any,   // "distant" model (reusing for simplicity)
      UserModel as any,   // "through" model (reusing for simplicity)
      "user_id",          // firstKey (on through table)
      "user_id",          // secondKey (on related table)
      "id",               // localKey
      "id",               // secondLocalKey
      user,
    );
    const result = await rel.getResults();
    expect(result).not.toBeNull();
  });

  it("returns null when no through row exists", async () => {
    mockDbQuery.mockResolvedValueOnce([]); // no through row
    const user = makeUser({ id: 99 });
    const rel = new HasOneThrough(
      PostModel as any, UserModel as any,
      "user_id", "user_id", "id", "id", user,
    );
    expect(await rel.getResults()).toBeNull();
  });
});

// ─── HasManyThrough ───────────────────────────────────────────────────────────

describe("HasManyThrough", () => {
  it("queries through the intermediate table and returns array", async () => {
    mockDbQuery.mockResolvedValueOnce([
      { id: 1, title: "Post A", user_id: 10, country_id: 1 },
      { id: 2, title: "Post B", user_id: 20, country_id: 1 },
    ]);
    const country = new CountryModel();
    country.setAttribute("id", 1);
    const rel = new HasManyThrough(
      PostModel as any,
      UserModel as any,
      "country_id", // firstKey on users table
      "user_id",    // secondKey on posts table
      "id",
      "id",
      country,
    );
    const results = await rel.getResults();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(2);
  });

  it("returns [] when parent has no id", async () => {
    const country = new CountryModel(); // no id set
    const rel = new HasManyThrough(
      PostModel as any, UserModel as any,
      "country_id", "user_id", "id", "id", country,
    );
    expect(await rel.getResults()).toEqual([]);
  });
});

// ─── Thenable: catch / finally ────────────────────────────────────────────────

describe("Relation thenable protocol", () => {
  it("catch() is called on rejection", async () => {
    mockDbQuery.mockRejectedValueOnce(new Error("DB down"));
    const user = makeUser({ id: 1 });
    const rel = new HasOne(ProfileModel as any, "user_id", "id", user);

    let caught: any = null;
    await rel.catch((err) => {
      caught = err;
    });
    expect(caught).toBeInstanceOf(Error);
  });

  it("finally() runs after resolution", async () => {
    mockDbQuery.mockResolvedValue([]);
    const user = makeUser({ id: 1 });
    const rel = new HasOne(ProfileModel as any, "user_id", "id", user);

    let finalized = false;
    await rel.finally(() => {
      finalized = true;
    });
    expect(finalized).toBe(true);
  });
});

// ─── HasOne — query() / get() / execution shortcuts ──────────────────────────

describe("HasOne — query() / get() / execution shortcuts", () => {
  it(".get() applies FK and returns an array", async () => {
    mockDbQuery.mockResolvedValue([{ id: 5, user_id: 1, gender: "M" }]);
    const user = makeUser({ id: 1 });
    const results = await new HasOne(ProfileModel as any, "user_id", "id", user).get();
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(1);
    const sql: string = mockDbQuery.mock.calls[0][0];
    expect(sql).toContain("user_id");
  });

  it(".get() returns [] when parent has no id", async () => {
    const user = new UserModel();
    const results = await new HasOne(ProfileModel as any, "user_id", "id", user).get();
    expect(results).toEqual([]);
  });

  it(".query() returns builder with FK applied — can chain where + get", async () => {
    mockDbQuery.mockResolvedValue([{ id: 5, user_id: 1, gender: "F" }]);
    const user = makeUser({ id: 1 });
    const builder = new HasOne(ProfileModel as any, "user_id", "id", user).query();
    const results = await builder.where("gender", "F").get();
    expect(results).toHaveLength(1);
    const sql: string = mockDbQuery.mock.calls[0][0];
    expect(sql).toContain("user_id");
    expect(sql).toContain("gender");
  });

  it(".query().first() resolves a single model", async () => {
    mockDbQuery.mockResolvedValue([{ id: 5, user_id: 1, gender: "M" }]);
    const user = makeUser({ id: 1 });
    const result = await new HasOne(ProfileModel as any, "user_id", "id", user)
      .query()
      .first();
    expect(result).not.toBeNull();
  });

  it(".count() returns aggregate count", async () => {
    mockDbQuery.mockResolvedValue([{ agg: "3" }]);
    const user = makeUser({ id: 1 });
    const count = await new HasOne(ProfileModel as any, "user_id", "id", user).count();
    expect(count).toBe(3);
  });

  it(".exists() returns true when rows exist", async () => {
    mockDbQuery.mockResolvedValue([{ agg: "1" }]);
    const user = makeUser({ id: 1 });
    const exists = await new HasOne(ProfileModel as any, "user_id", "id", user).exists();
    expect(exists).toBe(true);
  });

  it(".exists() returns false when no rows", async () => {
    mockDbQuery.mockResolvedValue([{ agg: "0" }]);
    const user = makeUser({ id: 1 });
    const exists = await new HasOne(ProfileModel as any, "user_id", "id", user).exists();
    expect(exists).toBe(false);
  });

  it(".paginate() returns paginated result with total", async () => {
    mockDbQuery
      .mockResolvedValueOnce([{ count: "1" }])
      .mockResolvedValueOnce([{ id: 5, user_id: 1, gender: "M" }]);
    const user = makeUser({ id: 1 });
    const page = await new HasOne(ProfileModel as any, "user_id", "id", user).paginate(15, 1);
    expect(page.pagination!.total).toBe(1);
    expect(page.data).toHaveLength(1);
  });

  it(".pluck() returns array of column values", async () => {
    mockDbQuery.mockResolvedValue([{ gender: "M" }, { gender: "F" }]);
    const user = makeUser({ id: 1 });
    const genders = await new HasOne(ProfileModel as any, "user_id", "id", user).pluck("gender");
    expect(genders).toEqual(["M", "F"]);
  });

  it(".value() returns the first column value", async () => {
    mockDbQuery.mockResolvedValue([{ gender: "M" }]);
    const user = makeUser({ id: 1 });
    const val = await new HasOne(ProfileModel as any, "user_id", "id", user).value("gender");
    expect(val).toBe("M");
  });
});

// ─── HasMany — query() / get() / execution shortcuts ─────────────────────────

describe("HasMany — query() / get() / execution shortcuts", () => {
  it(".get() applies FK and returns array", async () => {
    mockDbQuery.mockResolvedValue([
      { id: 1, user_id: 5, title: "Post A" },
      { id: 2, user_id: 5, title: "Post B" },
    ]);
    const user = makeUser({ id: 5 });
    const results = await new HasMany(PostModel as any, "user_id", "id", user).get();
    expect(results).toHaveLength(2);
    const sql: string = mockDbQuery.mock.calls[0][0];
    expect(sql).toContain("user_id");
  });

  it(".get() returns [] when parent has no id", async () => {
    const user = new UserModel();
    expect(await new HasMany(PostModel as any, "user_id", "id", user).get()).toEqual([]);
  });

  it(".query() allows chaining additional where clauses", async () => {
    mockDbQuery.mockResolvedValue([{ id: 3, user_id: 5, title: "Featured" }]);
    const user = makeUser({ id: 5 });
    const results = await new HasMany(PostModel as any, "user_id", "id", user)
      .query()
      .where("title", "Featured")
      .get();
    expect(results).toHaveLength(1);
    const sql: string = mockDbQuery.mock.calls[0][0];
    expect(sql).toContain("user_id");
    expect(sql).toContain("title");
  });

  it(".first() returns first matching model", async () => {
    mockDbQuery.mockResolvedValue([{ id: 10, user_id: 5, title: "First" }]);
    const user = makeUser({ id: 5 });
    const result = await new HasMany(PostModel as any, "user_id", "id", user).first();
    expect(result).not.toBeNull();
  });

  it(".count() returns aggregate count", async () => {
    mockDbQuery.mockResolvedValue([{ agg: "7" }]);
    const user = makeUser({ id: 5 });
    const count = await new HasMany(PostModel as any, "user_id", "id", user).count();
    expect(count).toBe(7);
  });

  it(".paginate() returns paginated result", async () => {
    mockDbQuery
      .mockResolvedValueOnce([{ count: "3" }])
      .mockResolvedValueOnce([
        { id: 1, user_id: 5, title: "A" },
        { id: 2, user_id: 5, title: "B" },
        { id: 3, user_id: 5, title: "C" },
      ]);
    const user = makeUser({ id: 5 });
    const page = await new HasMany(PostModel as any, "user_id", "id", user).paginate(15, 1);
    expect(page.pagination!.total).toBe(3);
    expect(page.data).toHaveLength(3);
  });

  it(".pluck() returns array of values", async () => {
    mockDbQuery.mockResolvedValue([{ title: "A" }, { title: "B" }]);
    const user = makeUser({ id: 5 });
    const titles = await new HasMany(PostModel as any, "user_id", "id", user).pluck("title");
    expect(titles).toEqual(["A", "B"]);
  });

  it(".doesntExist() returns true when count is 0", async () => {
    mockDbQuery.mockResolvedValue([{ agg: "0" }]);
    const user = makeUser({ id: 5 });
    expect(await new HasMany(PostModel as any, "user_id", "id", user).doesntExist()).toBe(true);
  });
});

// ─── BelongsTo — query() / get() ─────────────────────────────────────────────

describe("BelongsTo — query() / get()", () => {
  function makeProfile(attrs: Record<string, any> = {}): ProfileModel {
    const p = new ProfileModel();
    Object.entries({ id: 1, user_id: 10, ...attrs }).forEach(([k, v]) =>
      p.setAttribute(k, v),
    );
    return p;
  }

  it(".get() applies FK (ownerKey) and returns array", async () => {
    mockDbQuery.mockResolvedValue([{ id: 10, name: "Alice" }]);
    const profile = makeProfile({ user_id: 10 });
    const results = await new BelongsTo(UserModel as any, "user_id", "id", profile).get();
    expect(results).toHaveLength(1);
    const sql: string = mockDbQuery.mock.calls[0][0];
    expect(sql).toContain("users.id");
  });

  it(".get() returns [] when FK is null", async () => {
    const profile = new ProfileModel(); // no user_id
    expect(await new BelongsTo(UserModel as any, "user_id", "id", profile).get()).toEqual([]);
  });

  it(".query() returns builder with FK applied", async () => {
    mockDbQuery.mockResolvedValue([{ id: 10, name: "Alice" }]);
    const profile = makeProfile({ user_id: 10 });
    const result = await new BelongsTo(UserModel as any, "user_id", "id", profile)
      .query()
      .first();
    expect(result).not.toBeNull();
    const sql: string = mockDbQuery.mock.calls[0][0];
    expect(sql).toContain("users.id");
  });

  it(".count() returns 0 when FK is null", async () => {
    const profile = new ProfileModel();
    const count = await new BelongsTo(UserModel as any, "user_id", "id", profile).count();
    expect(count).toBe(0);
  });
});

// ─── BelongsToMany — get() ───────────────────────────────────────────────────

class RoleModel extends Model {
  static table = "roles";
  static primaryKey = "id";
  static fillable = ["id", "name"];
  static softDeletes = false;
}

describe("BelongsToMany — get()", () => {
  it(".get() delegates to getResults() (runs pivot + related queries)", async () => {
    mockDbQuery
      .mockResolvedValueOnce([{ related_id: 1 }, { related_id: 2 }])
      .mockResolvedValueOnce([
        { id: 1, name: "Admin" },
        { id: 2, name: "Editor" },
      ]);
    const user = makeUser({ id: 1 });
    const rel = new BelongsToMany(
      RoleModel as any,
      "role_user",
      "user_id",
      "role_id",
      "id",
      "id",
      user,
    );
    const results = await rel.get();
    expect(results).toHaveLength(2);
    expect(mockDbQuery).toHaveBeenCalledTimes(2);
    const pivotSql: string = mockDbQuery.mock.calls[0][0];
    expect(pivotSql).toContain("role_user");
    expect(pivotSql).toContain("user_id");
  });

  it(".get() returns [] when parent has no id", async () => {
    const user = new UserModel();
    const rel = new BelongsToMany(
      RoleModel as any, "role_user", "user_id", "role_id", "id", "id", user,
    );
    expect(await rel.get()).toEqual([]);
  });
});

// ─── HasOneThrough — get() / first() ─────────────────────────────────────────

describe("HasOneThrough — get() / first()", () => {
  it(".get() wraps getResults() result in an array", async () => {
    mockDbQuery.mockResolvedValueOnce([{ id: 20, policy_id: 10, user_id: 1 }]);
    const user = makeUser({ id: 1 });
    const rel = new HasOneThrough(
      PostModel as any,
      UserModel as any,
      "user_id",
      "user_id",
      "id",
      "id",
      user,
    );
    const results = await rel.get();
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(1);
  });

  it(".get() returns [] when getResults() returns null", async () => {
    mockDbQuery.mockResolvedValueOnce([]);
    const user = makeUser({ id: 1 });
    const rel = new HasOneThrough(
      PostModel as any, UserModel as any, "user_id", "user_id", "id", "id", user,
    );
    expect(await rel.get()).toEqual([]);
  });

  it(".first() delegates to getResults()", async () => {
    mockDbQuery.mockResolvedValueOnce([{ id: 20, user_id: 1 }]);
    const user = makeUser({ id: 1 });
    const rel = new HasOneThrough(
      PostModel as any, UserModel as any, "user_id", "user_id", "id", "id", user,
    );
    const result = await rel.first();
    expect(result).not.toBeNull();
  });

  it(".first() returns null when no row found", async () => {
    mockDbQuery.mockResolvedValueOnce([]);
    const user = makeUser({ id: 99 });
    const rel = new HasOneThrough(
      PostModel as any, UserModel as any, "user_id", "user_id", "id", "id", user,
    );
    expect(await rel.first()).toBeNull();
  });
});

// ─── HasManyThrough — get() ───────────────────────────────────────────────────

describe("HasManyThrough — get()", () => {
  it(".get() delegates to getResults()", async () => {
    mockDbQuery.mockResolvedValueOnce([
      { id: 1, title: "Post A", user_id: 10, country_id: 1 },
      { id: 2, title: "Post B", user_id: 20, country_id: 1 },
    ]);
    const country = new CountryModel();
    country.setAttribute("id", 1);
    const rel = new HasManyThrough(
      PostModel as any,
      UserModel as any,
      "country_id",
      "user_id",
      "id",
      "id",
      country,
    );
    const results = await rel.get();
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(2);
  });

  it(".get() returns [] when parent has no id", async () => {
    const country = new CountryModel();
    const rel = new HasManyThrough(
      PostModel as any, UserModel as any, "country_id", "user_id", "id", "id", country,
    );
    expect(await rel.get()).toEqual([]);
  });
});
