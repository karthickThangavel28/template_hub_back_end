const router = require("express").Router();
const deploymentController = require("../controllers/deployment.controller");
const upload = require("../middlewares/upload");


// Middleware to ensure user is authenticated
const ensureAuth = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Not authenticated" });
};

/* ---------------- ROUTE ---------------- */

router.post(
  "/",
  upload.fields([
    { name: "userImage", maxCount: 1 },
    { name: "projectImages", maxCount: 10 },
  ]),
  deploymentController.deployTemplate
);
router.get("/history", ensureAuth, deploymentController.getUserDeployments);

module.exports = router;
