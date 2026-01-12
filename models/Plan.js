const mongoose = require("mongoose");

const planSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      enum: ["FREE", "PRO", "ULTRA"],
      required: true,
      unique: true,
    },

    name: {
      type: String,
      required: true,
    },

    price: {
      type: Number, // 49, 199
      required: true,
    },

    currency: {
      type: String,
      default: "INR",
    },

    interval: {
      type: String,
      enum: ["month", "year"],
      default: "month",
    },

    stripeProductId: {
      type: String,
      default: null,
    },

    stripePriceId: {
      type: String,
      default: null,
    },

    features: {
      type: [String],
      default: [],
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Plan", planSchema);
