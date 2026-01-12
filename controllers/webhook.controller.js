const Stripe = require("stripe");
const User = require("../models/User");
const Plan = require("../models/Plan");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

exports.handleWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    /* ===============================
       CHECKOUT COMPLETED
    =============================== */
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // 🔐 Safety checks
      if (!session.subscription || !session.metadata?.userId) {
        return res.json({ received: true });
      }

      const user = await User.findById(session.metadata.userId);
      const plan = await Plan.findOne({ key: session.metadata.planKey });

      if (!user || !plan) {
        return res.json({ received: true });
      }

      // ✅ Fetch real subscription from Stripe
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription
      );

      user.plan = plan._id;
      user.subscription = {
        stripeCustomerId: session.customer,
        stripeSubscriptionId: subscription.id,
        status: subscription.status, // active
        startDate: new Date(subscription.current_period_start * 1000),
        endDate: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      };

      await user.save();
    }

    /* ===============================
       INVOICE PAID (RENEWAL)
    =============================== */
    if (event.type === "invoice.paid") {
      const invoice = event.data.object;

      const user = await User.findOne({
        "subscription.stripeSubscriptionId": invoice.subscription,
      });

      if (user) {
        user.subscription.status = "active";
        user.subscription.endDate = new Date(
          invoice.lines.data[0].period.end * 1000
        );

        await user.save();
      }
    }

    /* ===============================
       PAYMENT FAILED
    =============================== */
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;

      const user = await User.findOne({
        "subscription.stripeSubscriptionId": invoice.subscription,
      });

      if (user) {
        user.subscription.status = "past_due";
        await user.save();
      }
    }

    /* ===============================
       SUBSCRIPTION CANCELED
    =============================== */
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;

      const user = await User.findOne({
        "subscription.stripeSubscriptionId": subscription.id,
      });

      const freePlan = await Plan.findOne({ key: "FREE" });

      if (user && freePlan) {
        user.plan = freePlan._id;
        user.subscription.status = "canceled";
        user.subscription.endDate = new Date(); // immediate end
        await user.save();
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Webhook handling error:", error);
    res.status(500).json({ message: "Webhook handler failed" });
  }
};
