import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";
import Job from "../models/Job.js";

dotenv.config();

async function run() {
  const mongoUri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URL ||
    "mongodb://localhost:27017/hexagon";
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB");

  // Remove any resumes from HR accounts and reset lastLogin
  const hrResult = await User.updateMany(
    { role: "hr" },
    { $unset: { "profile.resume": "" }, $set: { lastLogin: null } }
  );
  console.log(`Cleared resumes from HR users: ${hrResult.modifiedCount}`);

  // Reset lastLogin on all users (optional cleanup)
  const userResult = await User.updateMany({}, { $set: { lastLogin: null } });
  console.log(`Reset lastLogin on users: ${userResult.modifiedCount}`);

  await mongoose.disconnect();
  console.log("Done");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
