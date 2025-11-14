import { authMiddleware, authorizePermissions, authorizeRoles } from '@/server/middleware/auth';
import {registerMiddleware} from "@/eloquent/Middleware/middleware";



export function registerDefaults() {
    registerMiddleware('auth', authMiddleware);
    registerMiddleware('can', (...perms: string[]) => authorizePermissions(...perms));
    registerMiddleware('role', (...roles: string[]) => authorizeRoles(...roles));
}

// Register defaults automatically so importing this module makes aliases available.
registerDefaults();