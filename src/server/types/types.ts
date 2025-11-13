export type TFilter = {
    [key: string]:any
}

export type TRequestQuery = {
    [p: string]: any | undefined
    search?: string;
    page?: number;
    limit?: number;
    sort?: string;
    order?: "asc" | "desc" | undefined;
}

export type TRequestHeaders = {
    authorization?: string;
    'content-type'?: string;
    'accept'?: string;
}

export type TRequest = {
    params: TRequestParams;
    query: TRequestQuery;
    headers: TRequestHeaders;
    body: any;
    user?: TRUser;
}
export type TRUser = {
    id: number|string;
    roles?: string[]|undefined;
    permissions?: string[]|undefined;
}

export type TRequestParams = TFilter &{
    search?: string;
    page?: number;
    limit?: number;
    sort?: string;
    order?: string;
}

export type TDefault = {
    id: number|string;
    created_at: string;
    updated_at: string;
    deleted_at: string|null;
}

export type TUser = TDefault & {
    name: string;
    email: string;
    password?: string;
    confirm_password?: string;
    active_status: number;
    phone_number: string;
    roles: TRole[];
}

export type TRole = TDefault & {
    slug: string;
    name: string;
    description: string;
    permissions: TPermission[];
}

export type TPermission = TDefault & {
    slug: string;
    name: string;
    description: string;
}