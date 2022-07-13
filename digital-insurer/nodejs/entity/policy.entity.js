const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  status: String,
  startDate: Date,
  endDate: Date,
  availablePolicyId: mongoose.Types.ObjectId,
  customerId: mongoose.Types.ObjectId,
  inspectionId: mongoose.Types.ObjectId,
  goods: [
    {
      availableGoodId: mongoose.Types.ObjectId,
      make: String,
      model: String,
      price: Number,
      productInspectionId: String,
    },
  ],
});

module.exports = mongoose.model("policy", schema);
