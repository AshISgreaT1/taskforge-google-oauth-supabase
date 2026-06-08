const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const {
  googleLogin,
  signup,
  login,
  getMe,
  getAllUsers,
  createUser,
  updateUserRole,
  disableUser,
  deleteUser
} = require('../controllers/authController');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }
  next();
};

router.post(
  '/google',
  validate,
  googleLogin
);

router.post('/signup', signup);
router.post('/login', login);
router.get('/me', protect, getMe);
router.get('/users', protect, getAllUsers);
router.post(
  '/users',
  protect,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('role').optional().isIn(['admin', 'member']),
  ],
  validate,
  createUser
);
router.patch(
  '/users/:userId/role',
  protect,
  [
    body('role').optional().isIn(['admin', 'member']),
    body('isActive').optional().isBoolean()
  ],
  validate,
  updateUserRole
);
router.patch('/users/:userId/disable', protect, disableUser);
router.delete('/users/:userId', protect, deleteUser);

module.exports = router;
