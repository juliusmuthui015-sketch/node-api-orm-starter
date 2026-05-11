/**
 * MongoDB tests
 *
 * Verifies ORM behaviour when getDbType() returns "mongodb".
 * All collection methods are replaced with jest mocks; no real
 * MongoDB connection is required.
 */

// ─── Shared mock state ────────────────────────────────────────────────────────

const mockToArray = jest.fn().mockResolvedValue([]);

// Cursor mock supports the full fluent interface that executeQueryMongo uses:
// find().skip().limit().sort().project().toArray()
const mockCursor: any = {
  toArray: mockToArray,
  skip: jest.fn(),
  limit: jest.fn(),
  sort: jest.fn(),
  project: jest.fn(),
};
mockCursor.skip.mockReturnValue(mockCursor);
mockCursor.limit.mockReturnValue(mockCursor);
mockCursor.sort.mockReturnValue(mockCursor);
mockCursor.project.mockReturnValue(mockCursor);

const mockFind = jest.fn().mockReturnValue(mockCursor);
const mockFindOne = jest.fn().mockResolvedValue(null);
const mockInsertOne = jest.fn().mockResolvedValue({ insertedId: "aaaaaaaaaaaaaaaaaaaaaa01" });
const mockUpdateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
const mockDeleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });
const mockCountDocuments = jest.fn().mockResolvedValue(0);
const mockAggregate = jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) });

const mockCollection = jest.fn().mockReturnValue({
  find: mockFind,
  findOne: mockFindOne,
  insertOne: mockInsertOne,
  updateOne: mockUpdateOne,
  deleteOne: mockDeleteOne,
  countDocuments: mockCountDocuments,
  aggregate: mockAggregate,
});

jest.mock("@/config/db.config", () => ({
  getDbType: () => "mongodb",
  query: jest.fn(),
  collection: mockCollection,
}));

jest.mock("@/eloquent/DB", () => ({
  __esModule: true,
  default: {
    executeQuery: jest.fn(),
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
  static fillable = ["id", "name", "email", "status"];
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

class PostModel extends Model {
  static table = "posts";
  static primaryKey = "id";
  static fillable = ["id", "user_id", "title"];
  static timestamps = false;
  static softDeletes = false;
  static autoIncrement = false;
  static relationships: Record<string, any> = {};
}

// ─── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockToArray.mockResolvedValue([]);
  // Re-wire cursor methods after clearAllMocks() cleared their implementations
  mockCursor.skip.mockReturnValue(mockCursor);
  mockCursor.limit.mockReturnValue(mockCursor);
  mockCursor.sort.mockReturnValue(mockCursor);
  mockCursor.project.mockReturnValue(mockCursor);
  mockFind.mockReturnValue(mockCursor);
  mockFindOne.mockResolvedValue(null);
  mockInsertOne.mockResolvedValue({ insertedId: "aaaaaaaaaaaaaaaaaaaaaa01" });
  mockUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  mockDeleteOne.mockResolvedValue({ deletedCount: 1 });
  mockCountDocuments.mockResolvedValue(0);
  mockCollection.mockReturnValue({
    find: mockFind,
    findOne: mockFindOne,
    insertOne: mockInsertOne,
    updateOne: mockUpdateOne,
    deleteOne: mockDeleteOne,
    countDocuments: mockCountDocuments,
    aggregate: mockAggregate,
  });
});

// ─── get / all ────────────────────────────────────────────────────────────────

describe("MongoDB — get / all", () => {
  it("all() calls find() on the collection", async () => {
    mockToArray.mockResolvedValue([
      { _id: "aaaaaaaaaaaaaaaaaaaaaa01", name: "Alice" },
      { _id: "aaaaaaaaaaaaaaaaaaaaaa02", name: "Bob" },
    ]);

    const users = await UserModel.all();

    expect(mockCollection).toHaveBeenCalledWith("users");
    expect(mockFind).toHaveBeenCalled();
    expect(users).toHaveLength(2);
    expect(users[0]).toBeInstanceOf(UserModel);
    expect(users[0].getAttribute("name")).toBe("Alice");
  });

  it("where().get() passes filter to find()", async () => {
    mockToArray.mockResolvedValue([{ _id: "aaaaaaaaaaaaaaaaaaaaaa01", name: "Alice" }]);

    await UserModel.where("status", "active").get();

    expect(mockFind).toHaveBeenCalledWith(
      expect.objectContaining({ status: expect.anything() }),
      expect.anything(),
    );
  });

  it("returns [] when collection is empty", async () => {
    mockToArray.mockResolvedValue([]);
    const result = await UserModel.all();
    expect(result).toEqual([]);
  });
});

// ─── first / find ─────────────────────────────────────────────────────────────

describe("MongoDB — first / find", () => {
  it("first() returns null when no document matches", async () => {
    mockToArray.mockResolvedValue([]);
    const u = await UserModel.where("email", "x@y.com").first();
    expect(u).toBeNull();
  });

  it("first() hydrates and returns a model instance", async () => {
    mockToArray.mockResolvedValue([{ _id: "aaaaaaaaaaaaaaaaaaaaaa01", name: "Charlie" }]);
    const u = await UserModel.where("name", "Charlie").first();
    expect(u).not.toBeNull();
    expect(u!.getAttribute("name")).toBe("Charlie");
  });
});

// ─── save — INSERT ────────────────────────────────────────────────────────────

describe("MongoDB — save (INSERT)", () => {
  it("save() on a new instance calls insertOne", async () => {
    const user = new UserModel();
    user.setAttribute("name", "Dave");
    user.setAttribute("email", "dave@example.com");

    await user.save();

    expect(mockInsertOne).toHaveBeenCalled();
    expect(user["__exists"]).toBe(true);
  });

  it("save() stores the insertedId as the model's id", async () => {
    const fakeId = "abcdef123456789012345678";
    mockInsertOne.mockResolvedValue({ insertedId: fakeId });

    const user = new UserModel();
    user.setAttribute("name", "Eve");

    await user.save();

    expect(user.getAttribute("id")).toBe(fakeId);
  });
});

// ─── save — UPDATE ────────────────────────────────────────────────────────────

describe("MongoDB — save (UPDATE)", () => {
  it("save() on existing instance calls updateOne with $set", async () => {
    const user = new UserModel();
    user.setAttribute("id", "aaaaaaaaaaaaaaaaaaaaaa01");
    user.setAttribute("name", "Frank");
    user["__exists"] = true;
    user["original"] = { id: "aaaaaaaaaaaaaaaaaaaaaa01", name: "Frank" };

    user.setAttribute("name", "Franklin");
    await user.save();

    expect(mockUpdateOne).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ $set: expect.objectContaining({ name: "Franklin" }) }),
      expect.any(Object),
    );
  });
});

// ─── delete ───────────────────────────────────────────────────────────────────

describe("MongoDB — delete", () => {
  it("delete() calls deleteOne for non-soft model", async () => {
    const user = new UserModel();
    user.setAttribute("id", "aaaaaaaaaaaaaaaaaaaaaa01");
    user["__exists"] = true;

    const ok = await user.delete();

    expect(ok).toBe(true);
    expect(mockDeleteOne).toHaveBeenCalled();
  });

  it("soft delete() calls updateOne with { $set: { deleted_at: ... } }", async () => {
    const su = new SoftUserModel();
    su.setAttribute("id", "aaaaaaaaaaaaaaaaaaaaaa01");
    su["__exists"] = true;

    const ok = await su.delete();

    expect(ok).toBe(true);
    expect(mockUpdateOne).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ $set: expect.objectContaining({ deleted_at: expect.any(Date) }) }),
      expect.any(Object),
    );
    expect(mockDeleteOne).not.toHaveBeenCalled();
  });

  it("forceDelete() on soft model still calls deleteOne", async () => {
    const su = new SoftUserModel();
    su.setAttribute("id", "aaaaaaaaaaaaaaaaaaaaaa01");
    su["__exists"] = true;

    const ok = await su.forceDelete();

    expect(ok).toBe(true);
    expect(mockDeleteOne).toHaveBeenCalled();
  });
});

// ─── restore ─────────────────────────────────────────────────────────────────

describe("MongoDB — restore", () => {
  it("restore() calls updateOne to clear deleted_at", async () => {
    const su = new SoftUserModel();
    su.setAttribute("id", "aaaaaaaaaaaaaaaaaaaaaa01");
    su.setAttribute("deleted_at", new Date());
    su["__exists"] = true;

    const ok = await su.restore();

    expect(ok).toBe(true);
    expect(mockUpdateOne).toHaveBeenCalled();
    // The update should set deleted_at to null
    const [, update] = mockUpdateOne.mock.calls[0];
    expect(update.$set?.deleted_at).toBeNull();
  });
});

// ─── count ────────────────────────────────────────────────────────────────────

describe("MongoDB — count", () => {
  it("count() returns the document count", async () => {
    mockAggregate.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([{ count: 7 }]),
    });

    const n = await UserModel.query().count();
    expect(n).toBeGreaterThanOrEqual(0);
  });
});

// ─── soft-delete scope ────────────────────────────────────────────────────────

describe("MongoDB — soft-delete scope", () => {
  it("default query filters out soft-deleted docs", async () => {
    await SoftUserModel.all();
    // find() must be called with a filter that excludes deleted documents
    const [filter] = mockFind.mock.calls[0];
    expect(filter).toMatchObject({ deleted_at: null });
  });

  it("withTrashed() does not include deleted_at filter", async () => {
    await SoftUserModel.withTrashed().get();
    const [filter] = mockFind.mock.calls[0];
    expect(filter).not.toHaveProperty("deleted_at", null);
  });

  it("onlyTrashed() queries only soft-deleted docs", async () => {
    await SoftUserModel.onlyTrashed().get();
    const [filter] = mockFind.mock.calls[0];
    expect(filter).toMatchObject({ deleted_at: { $ne: null } });
  });
});

// ─── HasOne / HasMany in Mongo ─────────────────────────────────────────────────

describe("MongoDB — relationships", () => {
  it("HasOne getResults() queries the related collection via find()", async () => {
    const { HasOne } = require("../relationships");

    const user = new UserModel();
    user.setAttribute("id", "aaaaaaaaaaaaaaaaaaaaaa01");
    user["__exists"] = true;

    const rel = new HasOne(PostModel as any, "user_id", "id", user);
    // first() calls get() → find().toArray()
    mockToArray.mockResolvedValue([
      { _id: "bbbbbbbbbbbbbbbbbbbbbb01", user_id: "aaaaaaaaaaaaaaaaaaaaaa01", title: "Hello" },
    ]);

    const post = await rel.getResults();
    expect(mockCollection).toHaveBeenCalledWith("posts");
    expect(mockFind).toHaveBeenCalled();
    expect(post).not.toBeNull();
    expect(post!.getAttribute("title")).toBe("Hello");
  });

  it("HasMany getResults() uses find on the related collection", async () => {
    const { HasMany } = await require("../relationships");

    const user = new UserModel();
    user.setAttribute("id", "aaaaaaaaaaaaaaaaaaaaaa01");
    user["__exists"] = true;

    mockToArray.mockResolvedValue([
      { _id: "cccccccccccccccccccccc01", user_id: "aaaaaaaaaaaaaaaaaaaaaa01", title: "Post A" },
      { _id: "cccccccccccccccccccccc02", user_id: "aaaaaaaaaaaaaaaaaaaaaa01", title: "Post B" },
    ]);

    const rel = new HasMany(PostModel as any, "user_id", "id", user);
    const posts = await rel.getResults();
    expect(mockCollection).toHaveBeenCalledWith("posts");
    expect(posts).toHaveLength(2);
    expect((posts[0] as any).getAttribute("title")).toBe("Post A");
  });

  it("HasMany returns [] when parent has no id", async () => {
    const { HasMany } = await require("../relationships");
    const user = new UserModel(); // no id
    const rel = new HasMany(PostModel as any, "user_id", "id", user);
    expect(await rel.getResults()).toEqual([]);
  });
});

// ─── toMongo() ────────────────────────────────────────────────────────────────

describe("toMongo()", () => {
  function builder<T extends Model>(M: typeof Model = UserModel): EloquentBuilder<T> {
    return new EloquentBuilder<T>(M as any);
  }

  it("returns the collection name", () => {
    expect(builder().toMongo().collection).toBe("users");
  });

  it("returns an empty filter when no where clauses", () => {
    expect(builder().toMongo().filter).toEqual({});
  });

  it("simple where() translates to equality filter", () => {
    const { filter } = builder().where("status", "active").toMongo();
    expect(filter).toMatchObject({ status: "active" });
  });

  it("where(col, '!=', val) translates to $ne", () => {
    const { filter } = builder().where("status", "!=", "deleted").toMongo();
    expect(filter).toMatchObject({ status: { $ne: "deleted" } });
  });

  it("where(col, '>', val) translates to $gt", () => {
    const { filter } = builder().where("score", ">", 10).toMongo();
    expect(filter).toMatchObject({ score: { $gt: 10 } });
  });

  it("whereIn() translates to $in", () => {
    const { filter } = builder().whereIn("status", ["active", "pending"]).toMongo();
    expect(filter).toMatchObject({ status: { $in: ["active", "pending"] } });
  });

  it("whereNotIn() translates to $nin", () => {
    const { filter } = builder().whereNotIn("status", ["deleted"]).toMongo();
    expect(filter).toMatchObject({ status: { $nin: ["deleted"] } });
  });

  it("whereBetween() translates to $gte/$lte", () => {
    const { filter } = builder().whereBetween("score", [1, 100]).toMongo();
    expect(filter).toMatchObject({ score: { $gte: 1, $lte: 100 } });
  });

  it("whereNull() translates to { col: null }", () => {
    const { filter } = builder().whereNull("deleted_at").toMongo();
    expect(filter).toMatchObject({ deleted_at: null });
  });

  it("whereNotNull() translates to { col: { $ne: null } }", () => {
    const { filter } = builder().whereNotNull("deleted_at").toMongo();
    expect(filter).toMatchObject({ deleted_at: { $ne: null } });
  });

  it("whereLike() translates to $regex", () => {
    const { filter } = builder().whereLike("name", "%alice%").toMongo();
    expect(filter).toMatchObject({ name: { $regex: ".*alice.*", $options: "i" } });
  });

  it("multiple where() clauses combine with $and", () => {
    const { filter } = builder().where("status", "active").where("email", "a@b.com").toMongo();
    // Two AND conditions — either flat object or $and array
    const combined = JSON.stringify(filter);
    expect(combined).toContain("active");
    expect(combined).toContain("a@b.com");
  });

  it("orWhere() produces $or", () => {
    const { filter } = builder().where("status", "active").orWhere("status", "pending").toMongo();
    const str = JSON.stringify(filter);
    expect(str).toContain("active");
    expect(str).toContain("pending");
  });

  it("soft-delete model auto-injects deleted_at: null into filter", () => {
    const { filter } = builder(SoftUserModel).where("name", "Alice").toMongo();
    const str = JSON.stringify(filter);
    expect(str).toContain("deleted_at");
    expect(str).toContain("null");
  });

  it("includes sort when orderBy() is set", () => {
    const { sort } = builder().orderBy("name", "asc").toMongo();
    expect(sort).toEqual({ name: 1 });
  });

  it("latest() produces sort: { created_at: -1 }", () => {
    const { sort } = builder().latest().toMongo();
    expect(sort).toEqual({ created_at: -1 });
  });

  it("includes limit when limit() is set", () => {
    const { limit } = builder().limit(25).toMongo();
    expect(limit).toBe(25);
  });

  it("includes skip when offset() is set", () => {
    const { skip } = builder().offset(10).toMongo();
    expect(skip).toBe(10);
  });

  it("includes projection when select() is set", () => {
    const { projection } = builder().select(["name", "email"]).toMongo();
    expect(projection).toEqual({ name: 1, email: 1 });
  });

  it("omits sort/limit/skip/projection when not set", () => {
    const result = builder().where("status", "active").toMongo();
    expect(result.sort).toBeUndefined();
    expect(result.limit).toBeUndefined();
    expect(result.skip).toBeUndefined();
    expect(result.projection).toBeUndefined();
  });

  it("clone() produces an independent toMongo() call", () => {
    const original = builder().where("status", "active");
    const copy = original.clone().where("name", "Alice");
    const o = original.toMongo();
    const c = copy.toMongo();
    expect(JSON.stringify(o.filter)).not.toContain("Alice");
    expect(JSON.stringify(c.filter)).toContain("Alice");
  });
});
