const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  name: String,
  coverages: [
    {
      type: String,
    },
  ],
});

module.exports = mongoose.model("availablePolicy", schema);
