const express = require("express");
const { body } = require("express-validator");
const ctrl = require("../controllers/checkinController");

const router = express.Router();
router.get("/workshop/:qrToken", ctrl.getWorkshop);
router.post("/", body("qrToken").notEmpty(), body("plate").notEmpty(), body("mileage").isInt({ min: 0 }), body("customerName").notEmpty(), body("complaint").notEmpty(), ctrl.create);
router.get("/track/:trackingToken", ctrl.trackJob);
module.exports = router;
