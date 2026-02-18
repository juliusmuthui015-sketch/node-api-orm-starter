import 'reflect-metadata';

export type Constructor<T = any> = new (...args: any[]) => T;
export type Abstract<T = any> = Constructor<T> | string | symbol;

type Binding<T = any> = {
    concrete: any;
    singleton: boolean;
};

export class Container {
    private static instance: Container;

    private bindings = new Map<Abstract, Binding>();
    private instances = new Map<Abstract, any>();
    private aliases = new Map<Abstract, Abstract>();
    private resolvingCallbacks: Function[] = [];

    /*
    |--------------------------------------------------------------------------
    | Singleton Access (like Laravel's app())
    |--------------------------------------------------------------------------
    */

    public static getInstance(): Container {
        if (!Container.instance) {
            Container.instance = new Container();
        }
        return Container.instance;
    }

    /*
    |--------------------------------------------------------------------------
    | Binding
    |--------------------------------------------------------------------------
    */

    public bind<T>(
        abstract: Abstract<T>,
        concrete: any = abstract,
        singleton: boolean = false
    ): void {
        this.bindings.set(abstract, { concrete, singleton });
    }

    public bindIf<T>(
        abstract: Abstract<T>,
        concrete: any = abstract,
    ): void {
        if (!this.bound(abstract)) {
            this.bind(abstract, concrete);
        }
    }

    public singleton<T>(
        abstract: Abstract<T>,
        concrete: any = abstract
    ): void {
        this.bind(abstract, concrete, true);
    }

    public singletonIf<T>(
        abstract: Abstract<T>,
        concrete: any = abstract
    ): void {
        if (!this.bound(abstract)) {
            this.singleton(abstract, concrete);
        }
    }

    public instance<T>(abstract: Abstract<T>, instance: T): void {
        this.instances.set(abstract, instance);
    }

    public alias(abstract: Abstract, alias: Abstract): void {
        this.aliases.set(alias, abstract);
    }

    public bound(abstract: Abstract): boolean {
        return this.bindings.has(abstract) || this.instances.has(abstract);
    }

    /*
    |--------------------------------------------------------------------------
    | Resolving
    |--------------------------------------------------------------------------
    */

    public make<T>(abstract: Abstract<T>): T {
        abstract = this.getAlias(abstract);

        // Return existing singleton instance
        if (this.instances.has(abstract)) {
            return this.instances.get(abstract);
        }

        const binding = this.bindings.get(abstract);

        let concrete = binding?.concrete ?? abstract;

        const object = this.build(concrete) as T;

        // Store singleton
        if (binding?.singleton) {
            this.instances.set(abstract, object);
        }

        // Fire resolving callbacks
        this.fireResolving(object);

        return object;
    }

    private build<T>(concrete: any): T {
        if (typeof concrete === 'function') {
            const params: any[] =
                Reflect.getMetadata('design:paramtypes', concrete) || [];

            const dependencies = params.map((param) => this.make(param));

            return new concrete(...dependencies);
        }

        // If it's a factory function
        if (typeof concrete === 'function') {
            return concrete(this);
        }

        return concrete;
    }

    /*
    |--------------------------------------------------------------------------
    | Events (like Laravel resolving())
    |--------------------------------------------------------------------------
    */

    public resolving(callback: Function): void {
        this.resolvingCallbacks.push(callback);
    }

    private fireResolving(object: any) {
        for (const callback of this.resolvingCallbacks) {
            callback(object, this);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Helpers
    |--------------------------------------------------------------------------
    */

    private getAlias(abstract: Abstract): Abstract {
        return this.aliases.get(abstract) ?? abstract;
    }
}

/*
|--------------------------------------------------------------------------
| Global Helpers (Laravel style)
|--------------------------------------------------------------------------
*/

export const container = Container.getInstance();

export function app<T>(abstract?: Abstract<T>): T | Container {
    if (!abstract) {
        return container;
    }
    return container.make<T>(abstract);
}

/*
|--------------------------------------------------------------------------
| Injectable Decorator
|--------------------------------------------------------------------------
*/

export function Injectable(): ClassDecorator {
    return function (target: any) {
        return target;
    };
}