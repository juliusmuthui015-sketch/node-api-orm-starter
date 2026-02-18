import { cacheDelPrefix } from '@/cache';
import {Observer} from "@/eloquent/Observers/Observer";
import {Model} from "@/eloquent/Model";

export class ReportCacheObserver extends Observer<Model>{
    async created(model: Model) {
        await this.invalidate(model, 'created');
    }

    async updated(model: Model) {
        await this.invalidate(model, 'updated');
    }

    async deleted(model: Model) {
        await this.invalidate(model, 'deleted');
    }

    private async invalidate(model: Model | any, event: string) {
        try {
            const deleted = await cacheDelPrefix('report:');

            // Determine whether we actually received a Model instance or a plain JSON object
            let ctor = (model as any)?.constructor;
            let isModelInstance = !!(ctor && typeof ctor.getTable === 'function');

            // If we did not get a Model instance but the constructor's prototype exposes hydrate(),
            // attempt to coerce the plain object into a Model instance by hydrating it.
            if (!isModelInstance && ctor && typeof ctor === 'function' && (ctor.prototype as any)?.hydrate) {
                try {
                    const inst = new (ctor as any)();
                    if (typeof (inst as any).hydrate === 'function') {
                        (inst as any).hydrate(model);
                        model = inst;
                        ctor = (model as any)?.constructor;
                        isModelInstance = true;
                    }
                } catch (e) {
                    // ignore hydrate errors and fall back to best-effort table detection
                }
            }

            // Prefer getTable() when available (it computes the default from the class name)
            let tableName = 'Model';
            if (ctor) {
                if (typeof ctor.getTable === 'function') {
                    try {
                        tableName = ctor.getTable();
                    } catch (e) {
                        tableName = ctor.table || ctor.table_name || ctor.name || 'Model';
                    }
                } else {
                    tableName = ctor.table || ctor.table_name || ctor.name || 'Model';
                }
            }

            console.log(
                `Cache invalidation: cleared ${deleted} entries due to ${event} on ${tableName}`
            );
        } catch (e) {
            console.warn('Failed to invalidate report cache:', e);
        }
    }
}
