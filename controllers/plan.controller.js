const Plan = require("../models/Plan");

/**
 * GET /api/plans
 */
exports.getPlans = async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true })
      .select("-stripeProductId -stripePriceId")
      .sort({ price: 1 });

    res.status(200).json({
      success: true,
      data: plans,
    });
  } catch (error) {
    console.error("Get plans error:", error);
    res.status(500).json({ message: "Failed to fetch plans" });
  }
};
