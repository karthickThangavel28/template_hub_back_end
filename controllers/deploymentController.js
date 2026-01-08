const { Octokit } = require("octokit");
const User = require("../models/User");
const Template = require("../models/Template");
const Deployment = require("../models/Deployment");
const { decrypt } = require("../utils/encryption");
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs-extra");

const getOctokit = (encryptedToken) => {
  const token = decrypt(encryptedToken);
  return new Octokit({ auth: token });
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

exports.getUserDeployments = async (req, res) => {
  try {
    const deployments = await Deployment.find({
      userId: req.user._id,
    }).populate("templateId");
    res.json(deployments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

async function safeCleanup(workDir) {
  try {
    // 🔥 Ensure all child processes are finished
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await fs.rm(workDir, {
      recursive: true,
      force: true,
    });

    console.log("✔ Cleaned:", workDir);
  } catch (err) {
    console.warn("Cleanup skipped:", err.message);
  }
}

exports.deployTemplate = async (req, res) => {
  const { templateId, repoName, configData } = req.body;
  const user = req.user;

  if (!templateId || !repoName || !configData) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const template = await Template.findById(templateId);
  if (!template) {
    return res.status(404).json({ message: "Template not found" });
  }

  const octokit = getOctokit(user.accessToken);

  const deployment = await Deployment.create({
    userId: user._id,
    templateId,
    repoName,
    status: "FORKING",
    logs: [],
  });

  const workDir = path.join(
    __dirname,
    "../../tmp",
    `${user.username}-${repoName}`
  );

  try {
    /* ---------------- SOURCE REPO ---------------- */

    const repoUrl = new URL(template.sourceRepoUrl);
    const sourceOwner = repoUrl.pathname.split("/")[1];
    const sourceRepo = repoUrl.pathname.split("/")[2].replace(".git", "");

    deployment.logs.push(`Forking ${sourceOwner}/${sourceRepo}`);
    await deployment.save();

    /* ---------------- FORK ---------------- */

    await octokit.rest.repos.createFork({
      owner: sourceOwner,
      repo: sourceRepo,
    });

    await delay(5000);

    /* ---------------- RENAME FORK ---------------- */

    await octokit.rest.repos.update({
      owner: user.username,
      repo: sourceRepo,
      name: repoName,
    });

    await delay(3000);

    /* ---------------- CLONE ---------------- */

    fs.removeSync(workDir);

    execSync(
      `git clone https://github.com/${user.username}/${repoName}.git "${workDir}"`,
      { stdio: "inherit" }
    );

    const safeToken = encodeURIComponent(user.accessToken);
    execSync(
      `git remote set-url origin https://${safeToken}@github.com/${user.username}/${repoName}.git`,
      { cwd: workDir }
    );
    execSync("git config --local --unset credential.helper", { cwd: workDir });

    /* ---------------- CONFIG FILE ---------------- */

    fs.writeJSONSync(path.join(workDir, "data.json"), configData, {
      spaces: 2,
    });

    /* ---------------- TECH DETECTION ---------------- */

    const pkgPath = path.join(workDir, "package.json");
    const hasPkg = fs.existsSync(pkgPath);
    const pkg = hasPkg ? fs.readJSONSync(pkgPath) : {};

    let buildCmd = null;
    let distDir = null;
    let framework = "unknown";

    /* ================= NEXT.JS ================= */
    if (fs.existsSync(path.join(workDir, "next.config.js"))) {
      deployment.logs.push("Detected Next.js");
      framework = "nextjs";

      const nextConfigPath = path.join(workDir, "next.config.js");
      let nextConfig = fs.readFileSync(nextConfigPath, "utf8");

      // 🔥 Always enforce static export + basePath
      if (!nextConfig.includes("output:")) {
        nextConfig = nextConfig.replace(
          /module\.exports\s*=\s*\{/,
          `module.exports = {
  output: "export",
  basePath: "/${repoName}",
  assetPrefix: "/${repoName}/",`
        );
      } else {
        nextConfig = nextConfig
          .replace(/basePath\s*:\s*['"].*?['"],?/g, "")
          .replace(/assetPrefix\s*:\s*['"].*?['"],?/g, "");
      }

      fs.writeFileSync(nextConfigPath, nextConfig);

      buildCmd = "npm run build";
      distDir = "out";
    } else if (
      /* ================= VITE (React / Vue / Svelte) ================= */
      fs.existsSync(path.join(workDir, "vite.config.js")) ||
      fs.existsSync(path.join(workDir, "vite.config.ts"))
    ) {
      deployment.logs.push("Detected Vite");
      framework = "vite";

      const vitePath = fs.existsSync(path.join(workDir, "vite.config.js"))
        ? path.join(workDir, "vite.config.js")
        : path.join(workDir, "vite.config.ts");

      let viteConfig = fs.readFileSync(vitePath, "utf8");

      // 🔥 ALWAYS replace base (even if it exists)
      if (/base\s*:/.test(viteConfig)) {
        viteConfig = viteConfig.replace(
          /base\s*:\s*['"].*?['"]/,
          `base: "/${repoName}/"`
        );
      } else {
        viteConfig = viteConfig.replace(
          /defineConfig\s*\(\s*\{/,
          `defineConfig({\n  base: "/${repoName}/",`
        );
      }

      fs.writeFileSync(vitePath, viteConfig);

      buildCmd = "npm run build";
      distDir = "dist";
    } else if (fs.existsSync(path.join(workDir, "angular.json"))) {
      /* ================= ANGULAR ================= */
      deployment.logs.push("Detected Angular");
      framework = "angular";

      buildCmd = `npm run build -- --base-href=/${repoName}/`;
      distDir = `dist/${pkg.name}`;
    } else if (pkg.dependencies?.["react-scripts"]) {
      /* ================= REACT (CRA) ================= */
      deployment.logs.push("Detected React (CRA)");
      framework = "react-cra";

      pkg.homepage = `https://${user.username}.github.io/${repoName}`;
      fs.writeJSONSync(pkgPath, pkg, { spaces: 2 });

      buildCmd = "npm run build";
      distDir = "build";
    } else if (fs.existsSync(path.join(workDir, "index.html"))) {
      /* ================= STATIC HTML ================= */
      deployment.logs.push("Detected Static HTML");
      framework = "static-html";

      buildCmd = null;
      distDir = ".";
    } else {
      /* ================= UNSUPPORTED ================= */
      throw new Error("Unsupported project type");
    }

    /* ---------------- INSTALL ---------------- */

    if (hasPkg) {
      deployment.logs.push("Installing dependencies...");
      await deployment.save();

      execSync("npm install", { cwd: workDir, stdio: "inherit" });
    }

    /* ---------------- BUILD ---------------- */

    if (buildCmd) {
      deployment.logs.push("Building project...");
      await deployment.save();

      execSync(buildCmd, { cwd: workDir, stdio: "inherit" });
    }

    /* ---------------- DEPLOY gh-pages ---------------- */

    const finalDist = path.join(workDir, distDir);
    if (!fs.existsSync(finalDist)) {
      throw new Error("Build output not found");
    }

    const backupDir = path.join(path.dirname(workDir), `__dist__${Date.now()}`);
    fs.copySync(finalDist, backupDir);

    execSync("git checkout --orphan gh-pages", { cwd: workDir });
    execSync("git reset --hard", { cwd: workDir });
    execSync("git clean -fdx", { cwd: workDir });

    fs.copySync(backupDir, workDir);
    fs.removeSync(backupDir);

    execSync("git add .", { cwd: workDir });
    execSync(`git commit -m "Deploy via Template Hub"`, { cwd: workDir });
    execSync("git push -f origin gh-pages", { cwd: workDir });

    /* ---------------- ENABLE PAGES ---------------- */

    try {
      await octokit.rest.repos.createPagesSite({
        owner: user.username,
        repo: repoName,
        source: { branch: "gh-pages", path: "/" },
      });
    } catch (err) {
      if (err.status !== 409) throw err;
    }

    /* ---------------- FINAL ---------------- */

    const deployedUrl = `https://${user.username}.github.io/${repoName}/`;

    deployment.status = "SUCCESS";
    deployment.deployedUrl = deployedUrl;
    deployment.logs.push("Deployment successful");
    await deployment.save();

    return res.json({
      success: true,
      deployedUrl,
      repoUrl: `https://github.com/${user.username}/${repoName}`,
    });
  } catch (err) {
    deployment.status = "FAILED";
    deployment.logs.push(err.message);
    await deployment.save();

    return res.status(500).json({ message: err.message });
  } finally {
    await safeCleanup(workDir);
  }
};
