// types.ts
import { Model } from "./Model";
import type { EloquentBuilder } from "./EloquentBuilder";

export interface ModelAttributes {
    [key: string]: any;
}

export interface RelationshipConfig {
    type: 'hasOne' | 'hasMany' | 'belongsTo' | 'belongsToMany' | 'morphOne' | 'morphMany';
    model: typeof Model;
    foreignKey?: string;
    localKey?: string;
    ownerKey?: string;
    relatedKey?: string;
    morphName?: string;
    table?: string;
    through?: typeof Model;
}

export interface Casts {
    [key: string]: string | Function;
}

export interface QueryOptions {
    with?: string[];
    where?: WhereClause[];
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: 'asc' | 'desc';
    groupBy?: string[];
    having?: WhereClause[];
    distinct?: boolean;
}

export interface WhereClause {
    column: string;
    operator: string;
    value: any;
    boolean?: 'and' | 'or';
}

export interface QueryResult<T> {
    data: T[];
    total?: number;
    pagination?: {
        currentPage: number;
        perPage: number;
        total: number;
        lastPage: number;
    };
}

export interface JoinClause {
    table: string;
    first: string;
    operator: string;
    second: string;
    type: 'inner' | 'left' | 'right' | 'cross';
}

export interface EagerLoadOptions {
    constraints?: (builder: EloquentBuilder<any>) => void;
    columns?: string[];
}