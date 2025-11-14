import { Router } from 'express';
import RoleController from '@/server/controllers/RoleController';
import { authMiddleware, authorizePermissions } from '@/server/middleware/auth';

const router = Router();

router.get('/', authMiddleware, authorizePermissions('view_roles'), RoleController.index);
router.get('/:id', authMiddleware, authorizePermissions('view_roles'), RoleController.show);
router.post('/', authMiddleware, authorizePermissions('create_roles'), RoleController.store);
router.put('/:id', authMiddleware, authorizePermissions('update_roles'), RoleController.update);
router.delete('/:id', authMiddleware, authorizePermissions('delete_roles'), RoleController.destroy);
router.post('/:id/permissions', authMiddleware, authorizePermissions('add_permissions_to_roles'), RoleController.syncPermissions);

export default router;
