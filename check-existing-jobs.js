import mongoose from "mongoose";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    const mongoUrl = process.env.MONGO_URL;

    if (!mongoUrl) {
      console.error("❌ MONGO_URL environment variable is not set");
      process.exit(1);
    }

    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(mongoUrl);
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};

// Check existing collections and jobs data
const checkExistingJobs = async () => {
  try {
    // Get all collections
    const collections = await mongoose.connection.db
      .listCollections()
      .toArray();
    console.log("\n📋 Available collections:");
    collections.forEach((col) => {
      console.log(`  - ${col.name}`);
    });

    // Check if jobs collection exists and has data
    const jobsCollection = mongoose.connection.db.collection("jobs");
    const jobsCount = await jobsCollection.countDocuments();
    console.log(`\n📊 Jobs collection has ${jobsCount} documents`);

    if (jobsCount > 0) {
      console.log("\n📝 Sample jobs data:");
      const sampleJobs = await jobsCollection.find({}).limit(3).toArray();
      sampleJobs.forEach((job, index) => {
        console.log(`\n  Job ${index + 1}:`);
        console.log(`    ID: ${job._id}`);
        console.log(`    Title: ${job.title || "N/A"}`);
        console.log(`    Company: ${job.company || "N/A"}`);
        console.log(`    Location: ${job.location || "N/A"}`);
        console.log(`    Experience: ${job.experience || "N/A"}`);
        console.log(`    Created: ${job.createdAt || job.created_at || "N/A"}`);
        console.log(
          `    Skills: ${job.skills ? job.skills.join(", ") : "N/A"}`
        );
      });
    }

    // Check if there are any other job-related collections
    const jobRelatedCollections = collections.filter(
      (col) =>
        col.name.toLowerCase().includes("job") ||
        col.name.toLowerCase().includes("position") ||
        col.name.toLowerCase().includes("opening")
    );

    if (jobRelatedCollections.length > 0) {
      console.log("\n🔍 Found job-related collections:");
      for (const col of jobRelatedCollections) {
        const count = await mongoose.connection.db
          .collection(col.name)
          .countDocuments();
        console.log(`  - ${col.name}: ${count} documents`);
      }
    }

    // Check users collection for any job-related data
    const usersCollection = mongoose.connection.db.collection("users");
    const usersCount = await usersCollection.countDocuments();
    console.log(`\n👥 Users collection has ${usersCount} documents`);

    if (usersCount > 0) {
      const sampleUser = await usersCollection.findOne({});
      if (sampleUser && sampleUser.profile && sampleUser.profile.jobs) {
        console.log("  📋 Users have job-related profile data");
      }
    }
  } catch (error) {
    console.error("❌ Error checking existing jobs:", error);
  }
};

// Main function
const main = async () => {
  await connectDB();
  await checkExistingJobs();

  console.log("\n✅ Database check completed");
  process.exit(0);
};

main().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});
