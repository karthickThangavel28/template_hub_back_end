const mongoose = require("mongoose");

const DeploymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: "Template" },
  repoName: String, // e.g., "my-portfolio"
  userRepoUrl: String, // https://github.com/user/my-portfolio
  deployedUrl: String, // https://user.github.io/my-portfolio
  status: {
    type: String,
    enum: [
      "INIT",
      "FORKING",
      "CLONING",
      "COMMITTING",
      "CONFIGURING",
      "BUILDING",
      "DEPLOYING",
      "SUCCESS",
      "FAILED",
    ],
    default: "INIT",
  },
  logs: [String], // Simple audit log of steps
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Deployment", DeploymentSchema);
