export type TDefault = {
    id: number|string;
    created_at: string;
    updated_at: string;
    deleted_at: string|null;
}

export type TUser = TDefault & {
    name: string;
    email: string;
    password: string;
    active_status: number;
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