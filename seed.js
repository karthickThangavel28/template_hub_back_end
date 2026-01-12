const mongoose = require("mongoose");
require("dotenv").config();

const Template = require("./models/Template");
const Plan = require("./models/Plan");
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/* =======================
   TEMPLATE DATA
======================= */
const templates = [
  {
    name: "Portfolio",
    description: "A professional portfolio to showcase your work.",
    techStack: "React + Vite",
    sourceRepoUrl: "https://github.com/karthickthangavel28/template-1",
    previewUrl: "https://karthickthangavel28.github.io/template-1/",
    previewImage: "https://via.placeholder.com/300x200?text=Portfolio",
    features: ["Responsive", "Project Gallery", "Contact Form"],
    allowedPlans: ["FREE", "PRO", "ULTRA"],
  },
  {
    name: "College Project Showcase",
    description: "Showcase contributions and academic projects.",
    techStack: "React + Vite",
    sourceRepoUrl: "https://github.com/karthickthangavel28/template-2",
    previewUrl: "https://karthickthangavel28.github.io/template-2/",
    previewImage: "https://via.placeholder.com/300x200?text=Project+Showcase",
    features: ["Gallery View", "Detailed Descriptions", "Team Members"],
    allowedPlans: ["PRO", "ULTRA"],
  },
];

/* =======================
   PLAN DATA
======================= */
const plans = [
  {
    key: "FREE",
    name: "Free Plan",
    description: "Basic access with limited features",
    amount: 0,
  },
  {
    key: "PRO",
    name: "Pro Plan",
    description: "Premium templates and standard support",
    amount: 4900,
  },
  {
    key: "ULTRA",
    name: "Ultra Pro Plan",
    description: "Unlimited access and priority support",
    amount: 19900,
  },
];

/* =======================
   STRIPE HELPERS
======================= */
async function findProductByName(name) {
  const products = await stripe.products.list({ limit: 100 });
  return products.data.find((p) => p.name === name);
}

async function findPrice(productId, amount) {
  const prices = await stripe.prices.list({ product: productId, limit: 100 });
  return prices.data.find((p) => p.unit_amount === amount);
}

async function seedPlans() {
  console.log("\n💳 Seeding Plans (Stripe + DB)...\n");

  for (const plan of plans) {
    let stripeProduct = null;
    let stripePrice = null;

    if (plan.amount > 0) {
      stripeProduct = await findProductByName(plan.name);

      if (!stripeProduct) {
        stripeProduct = await stripe.products.create({
          name: plan.name,
          description: plan.description,
          metadata: { plan_key: plan.key },
        });
      }

      stripePrice = await findPrice(stripeProduct.id, plan.amount);

      if (!stripePrice) {
        stripePrice = await stripe.prices.create({
          product: stripeProduct.id,
          unit_amount: plan.amount,
          currency: "inr",
          recurring: { interval: "month" },
        });
      }
    }

    await Plan.findOneAndUpdate(
      { key: plan.key },
      {
        key: plan.key,
        name: plan.name,
        description: plan.description,
        price: plan.amount / 100,
        stripeProductId: stripeProduct?.id || null,
        stripePriceId: stripePrice?.id || null,
      },
      { upsert: true, new: true }
    );

    console.log(`✅ ${plan.name} seeded`);
  }
}

/* =======================
   MAIN SEED
======================= */
async function seedDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB Connected");

    await Template.deleteMany({});
    await Plan.deleteMany({});

    await seedPlans();
    await Template.insertMany(templates);

    console.log("\n🎉 Templates & Plans seeded successfully");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed error:", err);
    process.exit(1);
  }
}

seedDB();
