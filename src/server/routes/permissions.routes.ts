import { Router } from 'express';
import PermissionController from '@/server/controllers/PermissionController';
import { authMiddleware, authorizePermissions } from '@/server/middleware/auth';

const router = Router();

router.get('/', authMiddleware, authorizePermissions('view_permissions'), PermissionController.index);
router.get('/:id', authMiddleware, authorizePermissions('view_permissions'), PermissionController.show);
router.post('/', authMiddleware, authorizePermissions('manage_permissions'), PermissionController.store);
router.put('/:id', authMiddleware, authorizePermissions('manage_permissions'), PermissionController.update);
router.delete('/:id', authMiddleware, authorizePermissions('manage_permissions'), PermissionController.destroy);

export default router;
