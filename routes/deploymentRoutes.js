const router = require('express').Router();
const deploymentController = require('../controllers/deploymentController');

// Middleware to ensure user is authenticated
const ensureAuth = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Not authenticated' });
};

router.post('/', ensureAuth, deploymentController.deployTemplate);
router.get('/history', ensureAuth, deploymentController.getUserDeployments);

module.exports = router;
