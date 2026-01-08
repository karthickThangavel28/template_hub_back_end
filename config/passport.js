const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User');
const { encrypt } = require('../utils/encryption');
require('dotenv').config();

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
            callbackURL: process.env.GITHUB_CALLBACK_URL || "/auth/github/callback",
            scope: ['public_repo', 'user:email'] // Requesting 'public_repo' for forking/pushing
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const encryptedToken = encrypt(accessToken);

                let user = await User.findOne({ githubId: profile.id });
                
                if (user) {
                    user.accessToken = encryptedToken;
                    user.username = profile.username;
                    user.displayName = profile.displayName || profile.username;
                    user.profileUrl = profile.profileUrl;
                    if (profile.emails && profile.emails.length > 0) {
                        user.email = profile.emails[0].value;
                    }
                    await user.save();
                } else {
                    user = await User.create({
                        githubId: profile.id,
                        username: profile.username,
                        displayName: profile.displayName || profile.username,
                        profileUrl: profile.profileUrl,
                        email: (profile.emails && profile.emails.length > 0) ? profile.emails[0].value : null,
                        accessToken: encryptedToken
                    });
                }
                done(null, user);
            } catch (err) {
                done(err, null);
            }
        }
    )
);
