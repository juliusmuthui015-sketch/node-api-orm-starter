import { Router } from 'express';
import UserController from '@/server/controllers/UserController';
import { authMiddleware, authorizePermissions } from '@/server/middleware/auth';

const router = Router();

router.get('/', authMiddleware, authorizePermissions('view_users'), UserController.index);
router.get('/:id', authMiddleware, authorizePermissions('view_users'), UserController.show);
router.post('/', authMiddleware, authorizePermissions('manage_users'), UserController.store);
router.put('/:id', authMiddleware, authorizePermissions('manage_users'), UserController.update);
router.delete('/:id', authMiddleware, authorizePermissions('manage_users'), UserController.destroy);

export default router;
