const express = require("express");
const router = express.Router();
const subscriptionController = require("../controllers/subscription.controller");

router.post("/",  subscriptionController.subscribe);

module.exports = router;
