const passport = require("passport");
const GitHubStrategy = require("passport-github2").Strategy;
const User = require("../models/User");
const Plan = require("../models/Plan"); // ✅ ADD THIS
const { encrypt } = require("../utils/encryption");
require("dotenv").config();

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL:
        process.env.GITHUB_CALLBACK_URL || "/auth/github/callback",
      scope: ["public_repo", "user:email"],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const encryptedToken = encrypt(accessToken);

        // 🔹 Fetch FREE plan (REQUIRED)
        const freePlan = await Plan.findOne({ key: "FREE" });
        if (!freePlan) {
          throw new Error("FREE plan not found in database");
        }

        let user = await User.findOne({ githubId: profile.id });

        if (user) {
          /* =====================
             EXISTING USER
          ===================== */
          user.accessToken = encryptedToken;
          user.username = profile.username;
          user.displayName =
            profile.displayName || profile.username;
          user.profileUrl = profile.profileUrl;

          if (profile.emails && profile.emails.length > 0) {
            user.email = profile.emails[0].value;
          }

          // 🛡️ Safety: ensure plan always exists
          if (!user.plan) {
            user.plan = freePlan._id;
            user.subscription = { status: "free" };
          }

          await user.save();
        } else {
          /* =====================
             NEW USER
          ===================== */
          user = await User.create({
            githubId: profile.id,
            username: profile.username,
            displayName:
              profile.displayName || profile.username,
            profileUrl: profile.profileUrl,
            email:
              profile.emails && profile.emails.length > 0
                ? profile.emails[0].value
                : null,
            accessToken: encryptedToken,

            // ✅ DEFAULT PLAN ASSIGNED
            plan: freePlan._id,
            subscription: {
              status: "free",
            },
          });
        }

        done(null, user);
      } catch (err) {
        console.error("GitHub OAuth Error:", err);
        done(err, null);
      }
    }
  )
);
