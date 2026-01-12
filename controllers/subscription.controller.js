const Stripe = require("stripe");
const Plan = require("../models/Plan");
const User = require("../models/User");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * POST /api/subscribe
 */
exports.subscribe = async (req, res) => {
  try {
    const { planKey } = req.body;
    const userId = req.user;
    const plan = await Plan.findOne({ key: planKey });
    if (!plan) {
      return res.status(404).json({ message: "Plan not found" });
    }

    /* ---------------- FREE PLAN ---------------- */
    if (plan.key === "FREE") {
      await User.findByIdAndUpdate(userId, {
        plan: plan._id,
        "subscription.status": "free",
        "subscription.endDate": null,
      });

      return res.status(200).json({
        message: "Free plan activated",
      });
    }

    /* ---------------- PAID PLAN ---------------- */
    const user = await User.findById(userId);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",

      customer_email: user.email,

      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1,
        },
      ],

      success_url: `${process.env.CLIENT_URL}/billing/success`,
      cancel_url: `${process.env.CLIENT_URL}/billing/cancel`,

      metadata: {
        userId: user._id.toString(),
        planKey: plan.key,
      },
    });

    res.status(200).json({
      checkoutUrl: session.url,
    });
  } catch (error) {
    console.error("Subscribe error:", error);
    res.status(500).json({ message: "Subscription failed" });
  }
};
