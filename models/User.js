const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: String,
    email: {
      type: String,
      unique: true,
    },

    /* =======================
       SUBSCRIPTION INFO
    ======================= */
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Plan",
      required: true,
    },

    subscription: {
      stripeCustomerId: {
        type: String,
        default: null,
      },

      stripeSubscriptionId: {
        type: String,
        default: null,
      },

      status: {
        type: String,
        enum: ["free", "active", "past_due", "canceled"],
        default: "free",
      },

      startDate: {
        type: Date,
        default: Date.now,
      },

      endDate: {
        type: Date,
        default: null,
      },

      cancelAtPeriodEnd: {
        type: Boolean,
        default: false,
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
