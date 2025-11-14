import { Router } from 'express';
import UserController from '@/server/controllers/UserController';
const UC: any = UserController;
import { authMiddleware, authorizePermissions } from '@/server/middleware/auth';

const router = Router();

router.get('/', authMiddleware, authorizePermissions('view_users'), UserController.index);
router.get('/:id', authMiddleware, authorizePermissions('view_users'), UserController.show);
router.get('/:id/profile', authMiddleware, authorizePermissions('view_users'), UC.showProfile);
router.post('/', authMiddleware, authorizePermissions('create_users'), UserController.store);
router.put('/:id', authMiddleware, authorizePermissions('update_users'), UserController.update);
router.put('/:id/profile', authMiddleware, authorizePermissions('update_users'), UC.updateProfile);
// admin sets a user's password
router.post('/:id/password', authMiddleware, authorizePermissions('update_users'), UC.setPassword);
// user resets their own password (or admin can reset via the previous route)
router.post('/:id/password/reset', authMiddleware, UC.resetPassword);
router.delete('/:id', authMiddleware, authorizePermissions('delete_users'), UC.destroy);

export default router;
