import { authMiddleware, authorizePermissions, authorizeRoles } from '@/server/middleware/auth';
import { registerMiddleware } from '@/eloquent/Middleware/middleware';
import modelRegisterMiddleware from "@/server/middleware/modelRegister";

export function registerDefaults() {
    registerMiddleware('auth', authMiddleware);
    registerMiddleware('can', (...perms: string[]) => authorizePermissions(...perms));
    registerMiddleware('role', (...roles: string[]) => authorizeRoles(...roles));
    registerMiddleware('model-registry', modelRegisterMiddleware);
}

// Register defaults automatically so importing this module makes aliases available.
registerDefaults();
