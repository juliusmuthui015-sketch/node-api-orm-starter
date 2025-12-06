// traits.ts - New file for trait system

// Types for trait support
import {Model} from "@/eloquent/Model";
import {EloquentBuilder} from "@/eloquent/EloquentBuilder";

export interface TraitMethods {
    [methodName: string]: Function;
}

export interface ScopeMethod<T extends Model> {
    (builder: EloquentBuilder<T>, ...args: any[]): void;
}

export interface Trait {
    methods?: TraitMethods;
    boot?: (model: typeof Model) => void;
    scope?: { [name: string]: ScopeMethod<any> };
    macros?: { [name: string]: Function };
}

// Global trait registry
const traitRegistry = new Map<string, Trait>();

/**
 * Register a trait globally
 */
export function registerTrait(name: string, trait: Trait): void {
    traitRegistry.set(name, trait);
}

/**
 * Get a trait by name
 */
export function getTrait(name: string): Trait | undefined {
    return traitRegistry.get(name);
}

/**
 * Apply traits to a model class
 */
export function applyTraits(modelClass: typeof Model, traitNames: string[]): void {
    for (const traitName of traitNames) {
        let trait: Trait | undefined;
        try {
            trait = traitRegistry.get(traitName);
        } catch (e) {
            console.warn(`Error retrieving trait "${traitName}":`, e);
            continue;
        }
        if (!trait) {
            console.warn(`Trait "${traitName}" not found`);
            continue;
        }

        // Apply methods
        try {
            if (trait.methods) {
                Object.entries(trait.methods).forEach(([methodName, method]) => {
                    try {
                        if (!(methodName in modelClass.prototype)) {
                            modelClass.prototype[methodName] = method;
                        } else {
                            // Avoid overriding existing methods
                            console.warn(`Trait method "${traitName}.${methodName}" skipped: already exists on model.`);
                        }
                    } catch (e) {
                        console.warn(`Failed applying method "${traitName}.${methodName}":`, e);
                    }
                });
            }
        } catch (e) {
            console.warn(`Error while applying methods of trait "${traitName}":`, e);
        }

        // Apply scopes
        try {
            if (trait.scope) {
                Object.entries(trait.scope).forEach(([scopeName, scopeMethod]) => {
                    const staticMethodName = `scope${scopeName.charAt(0).toUpperCase() + scopeName.slice(1)}`;
                    try {
                        if (!(staticMethodName in modelClass)) {
                            (modelClass as any)[staticMethodName] = scopeMethod;
                        } else {
                            console.warn(`Trait scope "${traitName}.${staticMethodName}" skipped: already exists on model.`);
                        }
                    } catch (e) {
                        console.warn(`Failed applying scope "${traitName}.${staticMethodName}":`, e);
                    }
                });
            }
        } catch (e) {
            console.warn(`Error while applying scopes of trait "${traitName}":`, e);
        }

        // Apply macros
        try {
            if (trait.macros) {
                Object.entries(trait.macros).forEach(([macroName, macro]) => {
                    try {
                        if (!(macroName in modelClass)) {
                            (modelClass as any)[macroName] = macro;
                        } else {
                            console.warn(`Trait macro "${traitName}.${macroName}" skipped: already exists on model.`);
                        }
                        if (!(macroName in EloquentBuilder.prototype)) {
                            (EloquentBuilder.prototype as any)[macroName] = macro;
                        }
                    } catch (e) {
                        console.warn(`Failed applying macro "${traitName}.${macroName}":`, e);
                    }
                });
            }
        } catch (e) {
            console.warn(`Error while applying macros of trait "${traitName}":`, e);
        }

        // Boot trait
        try {
            if (trait.boot) {
                trait.boot(modelClass);
            }
        } catch (e) {
            console.warn(`Error booting trait "${traitName}":`, e);
        }
    }
}

/**
 * Define a scope trait
 */
export function scope(name: string, callback: ScopeMethod<any>): void {
    const scopeMethodName = `scope${name.charAt(0).toUpperCase() + name.slice(1)}`;
    const traitName = `Scopes${name.charAt(0).toUpperCase() + name.slice(1)}`;

    if (!traitRegistry.has(traitName)) {
        registerTrait(traitName, {
            scope: {
                [name]: callback
            }
        });
    }
}

/**
 * Define a macro trait
 */
export function macro(name: string, callback: Function): void {
    const traitName = `Macros${name.charAt(0).toUpperCase() + name.slice(1)}`;

    if (!traitRegistry.has(traitName)) {
        registerTrait(traitName, {
            macros: {
                [name]: callback
            }
        });
    }
}

/**
 * Common traits similar to Laravel
 */

// SoftDeletes trait
registerTrait('SoftDeletes', {
    methods: {
        /**
         * Force delete the model (bypass soft delete)
         */
        async forceDelete(this: Model): Promise<boolean> {
            return this.delete(true);
        },

        /**
         * Restore a soft-deleted model
         */
        async restore(this: Model): Promise<boolean> {
            return (this as any).restore();
        },

        /**
         * Determine if the model has been soft-deleted
         */
        trashed(this: Model): boolean {
            return !!(this as any).deleted_at;
        },

        /**
         * Determine if the model is not soft-deleted
         */
        isNotTrashed(this: Model): boolean {
            return !(this as any).deleted_at;
        },
    },

    boot: (modelClass: typeof Model) => {
        // Add soft delete flags
        (modelClass as any).softDeletes = true;
    }
});

// HasApiTokens trait (similar to Laravel Sanctum)
registerTrait('HasApiTokens', {
    methods: {
        /**
         * Create a new token for the user
         */
        async createToken(this: Model, name: string, abilities: string[] = ['*']): Promise<any> {
            // Implementation would depend on your token system
            console.log(`Creating token "${name}" with abilities:`, abilities);
            return { token: 'generated-token' };
        },

        /**
         * Get current access token
         */
        currentAccessToken(this: Model): any {
            return null;
        },

        /**
         * Get all tokens
         */
        async tokens(this: Model): Promise<any[]> {
            return [];
        },

        /**
         * Revoke all tokens
         */
        async revokeAllTokens(this: Model): Promise<void> {
            console.log('All tokens revoked');
        },
    }
});

// Notifiable trait (similar to Laravel Notifications)
registerTrait('Notifiable', {
    methods: {
        /**
         * Send notification
         */
        async notify(this: Model, notification: any): Promise<void> {
            console.log('Notification sent:', notification);
        },

        /**
         * Route notifications for the mail channel
         */
        routeNotificationForMail(this: Model): string {
            return (this as any).email;
        },

        /**
         * Get notification preferences
         */
        notificationPreferences(this: Model): any {
            return {};
        },
    }
});

// HasEvents trait (for model events)
registerTrait('HasEvents', {
    boot: (modelClass: typeof Model) => {
        // Initialize event listeners map
        (modelClass as any).eventListeners = {
            creating: [],
            created: [],
            updating: [],
            updated: [],
            saving: [],
            saved: [],
            deleting: [],
            deleted: [],
            restoring: [],
            restored: [],
        };

        // Add event methods
        (modelClass as any).addEventListener = function(event: string, callback: Function): void {
            if ((this as any).eventListeners[event]) {
                (this as any).eventListeners[event].push(callback);
            }
        };

        (modelClass as any).dispatchEvent = function(event: string, model: Model): void {
            const listeners = (this as any).eventListeners[event] || [];
            listeners.forEach((listener: Function) => listener(model));
        };
    }
});

