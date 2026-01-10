const express = require("express");
const Groq = require("groq-sdk").default;
const fs = require("fs");
const path = require("path");
const { exec, spawn } = require("child_process");

const router = express.Router();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/* ---------------- SYSTEM PROMPT ---------------- */
const PROJECT_ARCHITECTURE = "component-based";

const SYSTEM_PROMPT = `
You are a backend-integrated, multi-agent code generation system.

PROJECT ARCHITECTURE:
- ${PROJECT_ARCHITECTURE}

CRITICAL RULES (NO EXCEPTIONS):
- You MUST ALWAYS return valid JSON
- The response MUST start with { and end with }
- DO NOT wrap the response in \`\`\` or \`\`\`json
- Plain text or markdown responses are STRICTLY FORBIDDEN
- If ANY rule is violated, the response is INVALID

------------------------------------
MULTI-AGENT INTERNAL PIPELINE
------------------------------------

You MUST internally execute ALL of the following agents IN ORDER.
These agents are INTERNAL ONLY and MUST NOT appear in the output.

1) GENERATION AGENT
   - Generate the initial React + Vite project based on user data
   - Follow ALL architecture, React, CSS, and file rules

2) TEST AGENT
   - Verify React 18 correctness (react-dom/client, createRoot)
   - Ensure no ReactDOM.render usage
   - Ensure all imports resolve correctly
   - Ensure components are presentational

3) PREVIEW AGENT
   - Simulate running: npm install && npm run dev
   - Verify index.html script paths
   - Verify no runtime import errors
   - Verify scroll works across sections

4) BUILD AGENT
   - Simulate: npm run build
   - Verify vite.config.js correctness
   - Ensure build.outDir === "dist"
   - Ensure no missing dependencies

5) ARCHITECTURE VALIDATION AGENT (FINAL GATE)
   - Verify component-based architecture
   - Verify required file structure EXACTLY
   - Verify data flow: App.jsx → props → components
   - Verify no extra files are generated
   - Verify no inline styles
   - Verify plain CSS only

If ANY agent fails:
- FIX the issue internally
- RE-RUN all agents from step 1
- Repeat until ALL agents pass

------------------------------------
RESPONSE SCHEMAS (ONLY THESE ARE ALLOWED)
------------------------------------

SCHEMA 1: COLLECT USER DETAILS

Use this schema IF required user data is missing.

{
  "mode": "collect_details",
  "questions": {
    "hero": string[],
    "about": string[],
    "skills": string[],
    "projects": string[],
    "experience": string[],
    "contact": string[],
    "optional": string[]
  }
}

Rules:
- Return ONLY this JSON object
- No explanations
- No markdown
- No extra keys

------------------------------------

SCHEMA 2: GENERATE PROJECT

Use this schema ONLY after ALL user details are provided
OR when the user explicitly says:
"ALL REQUIRED USER DETAILS ARE PROVIDED. GENERATE THE PROJECT."

Generate a COMPLETE, BUILDABLE React + Vite project
using a REAL-WORLD, COMPONENT-BASED architecture.

------------------------------------
PROJECT STRUCTURE (MANDATORY)
------------------------------------

index.html
src/main.jsx
src/App.jsx
src/App.css
src/components/Hero.jsx
src/components/About.jsx
src/components/Skills.jsx
src/components/Projects.jsx
src/components/Experience.jsx
src/components/Contact.jsx
package.json
vite.config.js

DO NOT generate any other files.

------------------------------------
REACT RULES
------------------------------------
- React 18 ONLY
- src/main.jsx MUST use react-dom/client and createRoot
- ReactDOM.render is STRICTLY FORBIDDEN

------------------------------------
DATA FLOW RULES
------------------------------------
- App.jsx MUST contain ONE userData object
- App.jsx MUST pass data via props
- Components MUST be presentational only
- NO hardcoded personal data inside components

------------------------------------
STYLING RULES
------------------------------------
- Plain CSS ONLY
- NO inline styles
- ALL styles MUST be in src/App.css
- Each section MUST:
  - have unique id and class
  - min-height: 100vh
  - different background color
  - responsive using flexbox or grid

PACKAGE VERSION RULES (CRITICAL):
- Use ONLY these exact versions:
  - react: "^18.2.0"
  - react-dom: "^18.2.0"
  - vite: "^4.5.0"
  - @vitejs/plugin-react: "^4.0.0"
- DO NOT invent, guess, or downgrade versions
- Any other version is INVALID

------------------------------------
PACKAGE.JSON RULES
------------------------------------
- react, react-dom → dependencies
- vite, @vitejs/plugin-react → devDependencies
- scripts: dev, build, preview

------------------------------------
VITE CONFIG RULES
------------------------------------
- base MUST be "./"
- build: { outDir: "dist" }

------------------------------------
FINAL RETURN FORMAT (STRICT)
------------------------------------

{
  "mode": "generate_project",
  "projectType": "react-vite",
  "files": {
    "index.html": "string",
    "src/main.jsx": "string",
    "src/App.jsx": "string",
    "src/App.css": "string",
    "src/components/Hero.jsx": "string",
    "src/components/About.jsx": "string",
    "src/components/Skills.jsx": "string",
    "src/components/Projects.jsx": "string",
    "src/components/Experience.jsx": "string",
    "src/components/Contact.jsx": "string",
    "package.json": "string",
    "vite.config.js": "string"
  }
}

------------------------------------
FINAL ENFORCEMENT
------------------------------------
- NEVER include markdown
- NEVER include explanations
- NEVER include agent names or steps
- NEVER include extra files
- Output ONLY valid JSON
`;

function createTempProject(files) {
  const tempDir = path.join(__dirname, "..", "temp", `project-${Date.now()}`);

  fs.mkdirSync(tempDir, { recursive: true });

  for (const filePath in files) {
    const fullPath = path.join(tempDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });

    // 🔒 SAFETY PATCH FOR package.json
    if (filePath === "package.json") {
      fs.writeFileSync(fullPath, normalizePackageJson(files[filePath]), "utf8");
    } else {
      fs.writeFileSync(fullPath, files[filePath], "utf8");
    }
  }

  return tempDir;
}

function normalizePackageJson(pkgRaw) {
  const pkg = JSON.parse(pkgRaw);

  pkg.dependencies = {
    react: "^18.2.0",
    "react-dom": "^18.2.0",
  };

  pkg.devDependencies = {
    vite: "^4.5.0",
    "@vitejs/plugin-react": "^4.0.0",
  };

  pkg.scripts = {
    dev: "vite",
    build: "vite build",
    preview: "vite preview",
  };

  return JSON.stringify(pkg, null, 2);
}

function runCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    const child = exec(command, { cwd, shell: true });

    let output = "";

    child.stdout.on("data", (data) => {
      output += data.toString();
    });

    child.stderr.on("data", (data) => {
      output += data.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) reject(output);
      else resolve(output);
    });
  });
}

function startDevServer(cwd) {
  return new Promise((resolve, reject) => {
    const dev = spawn(
      "npx",
      ["vite", "--host", "127.0.0.1", "--port", "5173"],
      {
        cwd,
        shell: true,
        env: { ...process.env },
      }
    );

    dev.unref();

    setTimeout(() => {
      resolve({
        url: "http://127.0.0.1:5173",
      });
    }, 1500);
  });
}

/* ---------------- ROUTE ---------------- */

router.post("/", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    /* ---------- AI CALL ---------- */
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
    });

    const raw = completion.choices[0].message.content;

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(500).json({
        error: "AI did not return valid JSON",
        raw,
      });
    }

    /* ---------- COLLECT DETAILS ---------- */
    if (data.mode === "collect_details") {
      return res.json(data);
    }

    /* ---------- GENERATE PROJECT ---------- */
    if (data.mode === "generate_project") {
      const requiredFiles = [
        "index.html",
        "src/main.jsx",
        "src/App.jsx",
        "src/App.css",
        "package.json",
        "vite.config.js",
      ];

      for (const file of requiredFiles) {
        if (!data.files[file]) {
          return res.status(500).json({
            error: `Missing required file: ${file}`,
          });
        }
      }

      /* ---------- CREATE PROJECT ---------- */
      const projectPath = createTempProject(data.files);

      /* ---------- INSTALL ---------- */
      await runCommand("npm install", projectPath);

      /* ---------- START DEV SERVER ---------- */
      const { url } = await startDevServer(projectPath);

      /* ---------- RESPONSE ---------- */
      return res.json({
        status: "success",
        previewUrl: url,
        projectPath,
      });
    }

    return res.status(500).json({ error: "Unknown AI mode" });
  } catch (err) {
    console.error("Chat API Error:", err);
    res.status(500).json({ error: "Chat generation failed" });
  }
});
module.exports = router;
