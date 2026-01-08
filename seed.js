const mongoose = require('mongoose');
const Template = require('./models/Template');
require('dotenv').config();
const templates = [
  {
    name: "Portfolio",
    description: "A professional portfolio to showcase your work.",
    techStack: "React + Vite",
    sourceRepoUrl: "https://github.com/karthickthangavel28/template-1",
    previewUrl: "https://karthickthangavel28.github.io/template-1/",
    previewImage: "https://via.placeholder.com/300x200?text=Portfolio",
    features: ["Responsive", "Project Gallery", "Contact Form"]
  },
  {
    name: "College Project Showcase",
    description: "Showcase contributions and academic projects.",
    techStack: "React + Vite",
    sourceRepoUrl: "https://github.com/karthickthangavel28/template-2",
    previewUrl: "https://karthickthangavel28.github.io/template-2/",
    previewImage: "https://via.placeholder.com/300x200?text=Project+Showcase",
    features: ["Gallery View", "Detailed Descriptions", "Team Members"]
  }
];


const seedDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        await Template.deleteMany({});
        await Template.insertMany(templates);

        console.log('Data Seeded!');
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seedDB();
