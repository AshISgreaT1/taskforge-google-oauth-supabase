const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const {
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
  '/signup',
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').not().exists().withMessage('Role cannot be set during signup'),
    body('jobRole').not().exists().withMessage('Job role cannot be set during signup')
  ],
  validate,
  (req, res, next) => {
    console.log('AUTH ROUTE HIT /signup', req.method, req.originalUrl, req.body && { email: req.body.email });
    next();
  },
  signup
);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  validate,
  (req, res, next) => {
    console.log('AUTH ROUTE HIT /login', req.method, req.originalUrl, req.body && { email: req.body.email });
    next();
  },
  login
);

router.get('/me', protect, getMe);
router.get('/users', protect, getAllUsers);
router.post(
  '/users',
  protect,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').optional().isIn(['admin', 'member']),
    body('jobRole').optional().isIn(['team-lead', 'frontend-dev', 'backend-dev', 'qa', 'designer', 'member'])
  ],
  validate,
  createUser
);
router.patch(
  '/users/:userId/role',
  protect,
  [
    body('role').optional().isIn(['admin', 'member']),
    body('jobRole').optional().isIn(['team-lead', 'frontend-dev', 'backend-dev', 'qa', 'designer', 'member']),
    body('isActive').optional().isBoolean()
  ],
  validate,
  updateUserRole
);
router.patch('/users/:userId/disable', protect, disableUser);
router.delete('/users/:userId', protect, deleteUser);

module.exports = router;
