const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  name: String,
  coverages: [
    {
      type: String,
    },
  ],
});

export default mongoose.model("availablePolicy", schema);
