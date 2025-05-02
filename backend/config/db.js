const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const mongoURI =  "mongodb://127.0.0.1:27017/MetaSpace";
    await mongoose.connect(mongoURI);
    console.log("MongoDB Connected");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

module.exports = connectDB;
