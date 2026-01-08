const mongoose = require("mongoose");

const TemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,

  techStack: {
    type: String,
    enum: ["React + Vite", "React", "Vite", "Next.js", "HTML"],
    required: true,
  },

  sourceRepoUrl: {
    type: String,
    required: true, // GitHub repo URL
  },

  previewUrl: {
    type: String,
    required: true, // GitHub Pages / live demo
  },

  previewImage: String,
  features: [String],

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Template", TemplateSchema);
