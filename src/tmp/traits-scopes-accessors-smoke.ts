// Smoke test for traits: scopes and accessors
import { Model } from "@/eloquent/Model";
import { EloquentBuilder } from "@/eloquent/EloquentBuilder";
import { registerTrait } from "@/eloquent/Traits/traits";

class DemoUser extends Model {
    static table = "users";
    static traits = ["DemoTrait"];
    static appends = ["display_name"];

    // Minimal query builder hook
    static query<T extends typeof Model>(this: T): EloquentBuilder<InstanceType<T>> {
        return new EloquentBuilder<InstanceType<T>>(this as any);
    }
}

// Register trait providing a scope and an accessor via methods
registerTrait("DemoTrait", {
    scope: {
        active<T extends Model>(builder: EloquentBuilder<T>) {
            // add where clause to builder (builder.where is typical API)
            if (typeof (builder as any).where === "function") {
                (builder as any).where("is_active", true);
            }
        },
    },
    methods: {
        // accessor: getDisplayNameAttribute
        getDisplayNameAttribute(this: DemoUser) {
            const first = this.getProperty("first_name") || "Unknown";
            const last = this.getProperty("last_name") || "User";
            return `${first} ${last}`.trim();
        },
    },
});

async function run() {
    // Create instance and test accessor
    const u = new DemoUser({ first_name: "Jane", last_name: "Doe", is_active: true });
    const display = u.getAttribute("display_name");
    console.log("Accessor display_name:", display);

    // Test appended in toJSON
    const json = u.toJSON({ withAccessors: true });
    console.log("toJSON with accessors:", json);

    // Test scope method
    const builder = (DemoUser as any).scope("active");
    // Basic sanity: builder exists
    console.log("Scope 'active' produced builder:", !!builder);

    // If builder.where was chained, output its internal state if available
    if ((builder as any).toSql) {
        console.log("Builder SQL:", (builder as any).toSql());
    } else {
        console.log("Builder:", builder);
    }
}

run().catch((e) => {
    console.error("traits-scopes-accessors-smoke error:", e);
});
