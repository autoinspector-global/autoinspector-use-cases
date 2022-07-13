const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  category: String,
  type: String,
});

module.exports = mongoose.model("availableGood", schema);
