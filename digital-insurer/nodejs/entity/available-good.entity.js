const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  make: String,
  model: String,
  category: String,
  type: String,
  price: Number,
  serialNumber: String,
  productInspectionId: String,
});

export default mongoose.model("availableGood", schema);
