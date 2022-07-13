const mongoose = require("mongoose");

const connectDB = (uri) => {
  return new Promise((resolve, reject) => {
    mongoose.connect(uri, {}, (err) => {
      if (err) reject(err);

      resolve("connected to db successfully!");
    });
  });
};

module.exports = connectDB;
