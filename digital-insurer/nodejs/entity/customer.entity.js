const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  occupation: String,
  firstname: String,
  lastname: String,
  email: String,
  identification: String,
});

module.exports = mongoose.model("customer", schema);
