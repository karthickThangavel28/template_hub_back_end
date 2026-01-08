const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    githubId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    displayName: String,
    profileUrl: String,
    email: String,
    accessToken: { type: String, required: true }, // Ideally encrypted
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
