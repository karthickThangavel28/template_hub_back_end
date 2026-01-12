const router = require("express").Router();
const passport = require("passport");

// Auth with GitHub
router.get(
  "/github",
  passport.authenticate("github", { scope: ["public_repo", "user:email"] })
);

// Callback
router.get(
  "/github/callback",
  passport.authenticate("github", {
    failureRedirect: "http://localhost:5173/login",
  }),
  (req, res) => {
    res.redirect("http://localhost:5173/auth/success");
  }
);

// Get User Data
router.get("/user", (req, res) => {
  if (req.user) {
    res.status(200).json({
      success: true,
      user: req.user,
    });
  } else {
    res.status(401).json({
      success: false,
      message: "Not Authenticated",
    });
  }
});

// Logout
router.get("/logout", (req, res) => {
  req.logout();
  res.redirect(process.env.CLIENT_URL || "http://localhost:5173");
});

module.exports = router;
