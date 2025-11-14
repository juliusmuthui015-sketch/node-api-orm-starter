import { Router } from 'express';
import PermissionController from '@/server/controllers/PermissionController';
import { authMiddleware, authorizePermissions } from '@/server/middleware/auth';

const router = Router();

router.get('/', authMiddleware, authorizePermissions('view_permissions'), PermissionController.index);
router.get('/:id', authMiddleware, authorizePermissions('view_permissions'), PermissionController.show);
router.post('/', authMiddleware, authorizePermissions('create_permissions'), PermissionController.store);
router.put('/:id', authMiddleware, authorizePermissions('update_permissions'), PermissionController.update);
router.delete('/:id', authMiddleware, authorizePermissions('delete_permissions'), PermissionController.destroy);

export default router;
