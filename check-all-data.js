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

// Check all data in detail
const checkAllData = async () => {
  try {
    // Get all collections
    const collections = await mongoose.connection.db
      .listCollections()
      .toArray();
    console.log("\n📋 All collections in database:");
    collections.forEach((col) => {
      console.log(`  - ${col.name}`);
    });

    // Check each collection for data
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      const collection = mongoose.connection.db.collection(collectionName);
      const count = await collection.countDocuments();

      console.log(`\n📊 Collection: ${collectionName} (${count} documents)`);

      if (count > 0 && count <= 5) {
        // Show all documents if 5 or fewer
        const docs = await collection.find({}).limit(5).toArray();
        docs.forEach((doc, index) => {
          console.log(`\n  Document ${index + 1}:`);
          console.log(`    ID: ${doc._id}`);
          // Show key fields based on collection type
          if (collectionName === "users") {
            console.log(`    Username: ${doc.username || "N/A"}`);
            console.log(`    Email: ${doc.email || "N/A"}`);
            console.log(`    Provider: ${doc.provider || "local"}`);
            if (doc.profile) {
              console.log(`    Full Name: ${doc.profile.full_name || "N/A"}`);
              console.log(`    Bio: ${doc.profile.bio || "N/A"}`);
            }
          } else if (collectionName === "todos") {
            console.log(`    Title: ${doc.title || "N/A"}`);
            console.log(`    Completed: ${doc.completed || false}`);
            console.log(`    Priority: ${doc.priority || "N/A"}`);
            console.log(`    User: ${doc.user || "N/A"}`);
          } else if (collectionName === "sessions") {
            console.log(`    Session ID: ${doc._id}`);
            console.log(`    Expires: ${doc.expires || "N/A"}`);
          }
        });
      } else if (count > 5) {
        // Show sample document for large collections
        const sample = await collection.findOne({});
        console.log(`\n  Sample document:`);
        console.log(`    ID: ${sample._id}`);
        if (collectionName === "users") {
          console.log(`    Username: ${sample.username || "N/A"}`);
          console.log(`    Email: ${sample.email || "N/A"}`);
        }
      }
    }

    // Check if there are any documents with job-related fields
    console.log("\n🔍 Searching for job-related data in all collections...");

    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      const collection = mongoose.connection.db.collection(collectionName);

      // Search for documents with job-related fields
      const jobFields = [
        "title",
        "company",
        "location",
        "experience",
        "skills",
        "description",
      ];
      const queries = jobFields.map((field) => ({
        [field]: { $exists: true, $ne: null },
      }));
      const jobDocs = await collection
        .find({ $or: queries })
        .limit(3)
        .toArray();

      if (jobDocs.length > 0) {
        console.log(`\n  Found potential job data in ${collectionName}:`);
        jobDocs.forEach((doc, index) => {
          console.log(`    Document ${index + 1}:`);
          jobFields.forEach((field) => {
            if (doc[field]) {
              console.log(`      ${field}: ${doc[field]}`);
            }
          });
        });
      }
    }
  } catch (error) {
    console.error("❌ Error checking data:", error);
  }
};

// Main function
const main = async () => {
  await connectDB();
  await checkAllData();

  console.log("\n✅ Database analysis completed");
  process.exit(0);
};

main().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});
