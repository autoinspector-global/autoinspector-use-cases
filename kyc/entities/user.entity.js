const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  firstname: String,
  lastname: String,
  identification: String,
  password: String,
  username: String,
  email: String,
  verified: Boolean,
});

module.exports = mongoose.model("user", schema);
