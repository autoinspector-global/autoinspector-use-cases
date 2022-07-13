const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  occupation: String,
  name: string,
});

export default mongoose.model("customer", schema);
