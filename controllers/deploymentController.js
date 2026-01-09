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
  const { templateId, repoName } = req.body;
  const user = req.user;

  let configData;
  try {
    configData = JSON.parse(req.body.configData);
  } catch {
    return res.status(400).json({ message: "Invalid configData JSON" });
  }

  if (!templateId || !repoName) {
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
    status: "INIT",
    logs: [],
  });

  const workDir = path.join(
    __dirname,
    "../../tmp",
    `${user.username}-${repoName}`
  );

  try {
    /* =====================================================
       1️⃣ FORK + CLONE
    ===================================================== */

    const repoUrl = new URL(template.sourceRepoUrl);
    const sourceOwner = repoUrl.pathname.split("/")[1];
    const sourceRepo = repoUrl.pathname.split("/")[2].replace(".git", "");

    // idempotent fork
    try {
      await octokit.rest.repos.get({
        owner: user.username,
        repo: sourceRepo,
      });
    } catch {
      await octokit.rest.repos.createFork({
        owner: sourceOwner,
        repo: sourceRepo,
      });
      await delay(5000);
    }

    // wait for fork
    let ready = false;
    for (let i = 0; i < 10; i++) {
      try {
        await octokit.rest.repos.get({
          owner: user.username,
          repo: sourceRepo,
        });
        ready = true;
        break;
      } catch {
        await delay(3000);
      }
    }
    if (!ready) throw new Error("Fork not ready");

    // rename fork
    await octokit.rest.repos.update({
      owner: user.username,
      repo: sourceRepo,
      name: repoName,
    });

    await delay(3000);

    // clone
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

    try {
      execSync("git config --local --unset credential.helper", {
        cwd: workDir,
      });
    } catch {}

    /* =====================================================
       2️⃣ PREPARE ASSETS (IMAGES + CONFIG)
    ===================================================== */

    const publicAssetsRoot = path.join(workDir, "public", "assets");
    const userDir = path.join(publicAssetsRoot, "user");
    const projectDir = path.join(publicAssetsRoot, "projects");

    fs.ensureDirSync(userDir);
    fs.ensureDirSync(projectDir);

    // USER IMAGE
    if (req.files?.userImage?.[0]) {
      const file = req.files.userImage[0];
      const ext = path.extname(file.originalname);
      const fileName = `profile${ext}`;

      fs.copySync(file.path, path.join(userDir, fileName));
      fs.removeSync(file.path);

      configData.personal ??= {};
      configData.personal.profileImage = `/assets/user/${fileName}`;
    }

    // PROJECT IMAGES
    if (req.files?.projectImages?.length) {
      configData.projects ??= [{}];
      configData.projects[0].images ??= [];

      req.files.projectImages.forEach((file, idx) => {
        const ext = path.extname(file.originalname);
        const fileName = `project-${idx + 1}${ext}`;

        fs.copySync(file.path, path.join(projectDir, fileName));
        fs.removeSync(file.path);

        configData.projects[0].images.push(
          `/assets/projects/${fileName}`
        );
      });
    }

    // write config (source)
    fs.writeJSONSync(path.join(workDir, "data.json"), configData, {
      spaces: 2,
    });

    /* =====================================================
       3️⃣ BUILD PROJECT (VITE)
    ===================================================== */

    execSync("npm install", { cwd: workDir, stdio: "inherit" });
    execSync("npm run build", { cwd: workDir, stdio: "inherit" });

    const distDir = path.join(workDir, "dist");
    if (!fs.existsSync(distDir)) {
      throw new Error("Vite build failed: dist not found");
    }

    // copy assets into dist
    if (fs.existsSync(publicAssetsRoot)) {
      fs.copySync(publicAssetsRoot, path.join(distDir, "assets"));
    }

    // copy data.json into dist
    fs.writeJSONSync(
      path.join(distDir, "data.json"),
      configData,
      { spaces: 2 }
    );

    /* =====================================================
       4️⃣ DEPLOY TO gh-pages
    ===================================================== */

    const backupDir = path.join(
      path.dirname(workDir),
      `__dist__${Date.now()}`
    );

    fs.copySync(distDir, backupDir);

    execSync("git checkout --orphan gh-pages", { cwd: workDir });
    execSync("git reset --hard", { cwd: workDir });
    execSync("git clean -fdx", { cwd: workDir });

    fs.copySync(backupDir, workDir);
    fs.removeSync(backupDir);

    execSync("git add .", { cwd: workDir });

    const status = execSync("git status --porcelain", {
      cwd: workDir,
    }).toString();

    if (status) {
      execSync('git commit -m "Deploy via Template Hub"', {
        cwd: workDir,
        stdio: "inherit",
      });
    }

    execSync("git push -f origin gh-pages", {
      cwd: workDir,
      stdio: "inherit",
    });

    // enable pages
    try {
      await octokit.rest.repos.createPagesSite({
        owner: user.username,
        repo: repoName,
        source: { branch: "gh-pages", path: "/" },
      });
    } catch (e) {
      if (e.status !== 409) throw e;
    }

    const deployedUrl = `https://${user.username}.github.io/${repoName}/`;

    deployment.status = "SUCCESS";
    deployment.deployedUrl = deployedUrl;
    await deployment.save();

    return res.json({
      success: true,
      deployedUrl,
    });
  } catch (err) {
    console.error(err);
    deployment.status = "FAILED";
    deployment.logs.push(err.message);
    await deployment.save();
    return res.status(500).json({ message: err.message });
  } finally {
    await safeCleanup(workDir);
  }
};