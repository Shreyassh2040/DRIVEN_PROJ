const router = require('express').Router();

const { authenticate, optionalAuth, allowRoles } = require('../middleware/auth');
const { authLimiter, issueLimiter, voteLimiter } = require('../middleware/rateLimits');
const { upload, verifyImage } = require('../middleware/upload');

const auth = require('../controllers/auth');
const users = require('../controllers/users');
const publicController = require('../controllers/public');
const services = require('../controllers/services');
const serviceCategories = require('../controllers/serviceCategories');
const issues = require('../controllers/issues');
const officer = require('../controllers/officer');
const admin = require('../controllers/admin');
const polls = require('../controllers/polls');
const notifications = require('../controllers/notifications');

const staffOnly = allowRoles('officer', 'admin');
const adminOnly = allowRoles('admin');
const citizenOnly = allowRoles('citizen');

// Public platform data
router.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));
router.get('/stats', publicController.stats);
router.get('/config', publicController.config);

// Authentication
router.post('/auth/register', authLimiter, auth.register);
router.post('/auth/login', authLimiter, auth.login);
router.get('/auth/me', authenticate, auth.me);
router.post('/auth/change-password', authenticate, auth.changePassword);

// Profiles
router.get('/users/profile', authenticate, users.getProfile);
router.put('/users/profile', authenticate, users.updateProfile);

// Service directory
router.get('/services/meta', services.meta);
router.get('/services/search', services.list);
router.get('/services', services.list);
router.get('/services/:id', optionalAuth, services.getById);
router.post('/services', authenticate, adminOnly, services.create);
router.put('/services/:id', authenticate, adminOnly, services.update);
router.delete('/services/:id', authenticate, adminOnly, services.remove);

// Service categories
router.get('/service-categories', optionalAuth, serviceCategories.list);
router.post('/service-categories', authenticate, adminOnly, serviceCategories.create);
router.put('/service-categories/:id', authenticate, adminOnly, serviceCategories.update);
router.delete('/service-categories/:id', authenticate, adminOnly, serviceCategories.remove);

// Citizen complaints
router.post('/issues', authenticate, citizenOnly, issueLimiter, upload.single('photo'), verifyImage, issues.create);
router.get('/issues/my', authenticate, issues.mine);
router.get('/issues/:id/photo', authenticate, issues.photo);
router.get('/issues/:id/history', authenticate, issues.timeline);
router.get('/issues/:id', authenticate, issues.getById);

// Officer operations
router.get('/officer/complaints', authenticate, staffOnly, officer.listComplaints);
router.get('/officer/complaints/:id', authenticate, staffOnly, officer.getComplaint);
router.patch('/officer/complaints/:id/status', authenticate, staffOnly, officer.updateStatus);
router.post('/officer/complaints/:id/assign', authenticate, staffOnly, officer.assignComplaint);
router.post('/officer/complaints/:id/comments', authenticate, staffOnly, officer.addComment);
router.get('/officer/officers', authenticate, staffOnly, officer.listOfficers);
router.get('/officer/stats', authenticate, staffOnly, officer.stats);

// Administrator
router.get('/admin/dashboard', authenticate, adminOnly, admin.dashboard);
router.get('/admin/users', authenticate, adminOnly, admin.listUsers);
router.get('/admin/users/:id', authenticate, adminOnly, admin.getUser);
router.patch('/admin/users/:id/status', authenticate, adminOnly, admin.setUserStatus);
router.patch('/admin/users/:id/role', authenticate, adminOnly, admin.setUserRole);
router.get('/admin/officers', authenticate, adminOnly, admin.listOfficers);
router.post('/admin/officers', authenticate, adminOnly, admin.createOfficer);
router.put('/admin/officers/:id', authenticate, adminOnly, admin.updateOfficer);
router.get('/admin/complaints', authenticate, adminOnly, officer.listComplaints);
router.get('/admin/analytics', authenticate, adminOnly, admin.analytics);
router.get('/admin/activity-logs', authenticate, adminOnly, admin.activityLogs);
router.get('/admin/settings', authenticate, adminOnly, admin.getSettings);
router.put('/admin/settings', authenticate, adminOnly, admin.updateSettings);
router.get('/admin/reports/complaints.csv', authenticate, adminOnly, admin.exportComplaints);

// Community polls
router.get('/polls', optionalAuth, polls.list);
router.get('/polls/:id', optionalAuth, polls.getById);
router.get('/polls/:id/results', optionalAuth, polls.getById);
router.post('/polls', authenticate, adminOnly, polls.create);
router.put('/polls/:id', authenticate, adminOnly, polls.update);
router.post('/polls/:id/close', authenticate, adminOnly, polls.close);
router.delete('/polls/:id', authenticate, adminOnly, polls.remove);
router.post('/polls/:id/vote', authenticate, citizenOnly, voteLimiter, polls.vote);

// In-app notifications
router.get('/notifications', authenticate, notifications.list);
router.get('/notifications/unread-count', authenticate, notifications.unreadCount);
router.patch('/notifications/:id/read', authenticate, notifications.markRead);
router.patch('/notifications/read-all', authenticate, notifications.markAllRead);

module.exports = router;
