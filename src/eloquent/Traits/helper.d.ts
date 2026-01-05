// src/types/eloquent-traits-helper.d.ts
import type { Model } from '@/eloquent/Model';
import type { EloquentBuilder } from '@/eloquent/EloquentBuilder';

/**
 * Extract instance methods from a trait class.
 * Excludes constructor and static members.
 */
type InstanceMethods<T> = {
  [K in keyof T as T[K] extends Function
    ? K extends 'constructor'
      ? never
      : K
    : T[K] extends object
      ? K // allow attribute-like fields on trait instance
      : never]: T[K];
};

/**
 * Extract static methods from a trait class (macros and scopes).
 */
type StaticMethods<T> = {
  [K in keyof T as T[K] extends Function ? K : never]: T[K];
};

/**
 * Utility to merge traits into a Model instance type.
 */
type WithTraitsInstance<M, Traits extends readonly any[]> = M &
  UnionToIntersection<InstanceMethods<Traits[number]['prototype']>>;

/**
 * Utility to merge traits into a Model static type.
 */
type WithTraitsStatic<MClass, Traits extends readonly any[]> = MClass &
  UnionToIntersection<StaticMethods<Traits[number]>>;

/**
 * Turn union into intersection.
 */
type UnionToIntersection<U> = (U extends any ? (x: U) => any : never) extends (x: infer I) => any
  ? I
  : never;

/**
 * Helper to annotate a concrete model with attached traits for IDE.
 * Example:
 *   type UserWithTraits = AttachTraits<typeof User, [SoftDeletes, Timestamps, Sluggable]>;
 *   declare const User: UserWithTraits;
 */
export type AttachTraits<
  MClass extends new (...args: any) => Model,
  Traits extends readonly any[],
> = WithTraitsStatic<MClass, Traits> & {
  new (...args: ConstructorParameters<MClass>): WithTraitsInstance<InstanceType<MClass>, Traits>;
};

/**
 * Extend EloquentBuilder with trait scopes for a given Model type.
 * Example:
 *   type UserBuilder = BuilderWithTraitScopes<User, [Sluggable, Searchable]>;
 */
export type BuilderWithTraitScopes<M, Traits extends readonly any[]> = EloquentBuilder<M> &
  UnionToIntersection<
    {
      [T in Traits[number]]: {
        [K in keyof T as K extends `scope${string}`
          ? K extends `scope${infer Name}`
            ? Name extends ''
              ? never
              : Uncapitalize<Name>
            : never
          : never]: T[K] extends (builder: EloquentBuilder<any>, ...args: infer P) => infer R
          ? (...args: P) => R
          : never;
      };
    }[Traits[number]]
  >;

/**
 * Convenience mapped type to expose scopes on Model.query().
 * Example:
 *   type UserQuery = QueryWithTraitScopes<typeof User, [Sluggable, Searchable]>;
 */
export type QueryWithTraitScopes<
  MClass extends new (...args: any) => Model,
  Traits extends readonly any[],
> = BuilderWithTraitScopes<InstanceType<MClass>, Traits>;

/**
 * Optional: augment global Model typing if you use a registry to bind traits per model.
 * You can declare per-model trait bindings here for full IntelliSense.
 */
declare global {
  // Example augmentation (uncomment and adapt):
  // namespace Eloquent {
  //   interface Models {
  //     User: AttachTraits<typeof import('@/models/User').User, [import('@/eloquent/Traits/built-ins').SoftDeletes, import('@/eloquent/Traits/built-ins').Timestamps, import('@/eloquent/Traits/built-ins').Sluggable]>;
  //   }
  // }
}

/**
 * Usage pattern (in a .d.ts or near the model):
 *
 * import { SoftDeletes, Timestamps, Sluggable, Searchable } from '@/eloquent/Traits/built-ins';
 * import { User as BaseUser } from '@/models/User';
 *
 * export type UserWithTraits = AttachTraits<typeof BaseUser, [SoftDeletes, Timestamps, Sluggable, Searchable]>;
 * declare const User: UserWithTraits;
 *
 * // Now:
 * // - Instance: new User().trashed(), new User().setSlugFrom('name'), etc.
 * // - Static: User.latest(), User.scopeFindBySlug(builder, 'foo') via query().findBySlug('foo')
 * // - Builder: User.query().findBySlug('foo').search('q')
 *
 * // And you can get scoped query type:
 * export type UserQuery = QueryWithTraitScopes<typeof BaseUser, [Sluggable, Searchable]>;
 */

/**
 * Typed decorator helper: using @use(T1, T2, ...) will annotate the class
 * with trait instance/static methods and expose trait scopes on query().
 * This is a purely type-level helper and does not alter runtime behavior.
 */
export declare function use<Traits extends readonly any[]>(
  ...traits: Traits
): <MClass extends new (...args: any) => Model>(ctor: MClass) => AttachTraits<MClass, Traits>;

/** Module augmentation to bind typed decorator to actual export path used in models */
declare module '@/eloquent/Model' {
  export function use<Traits extends readonly any[]>(
    ...traits: Traits
  ): <MClass extends new (...args: any) => Model>(ctor: MClass) => AttachTraits<MClass, Traits>;
}
