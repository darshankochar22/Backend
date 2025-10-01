import mongoose from "mongoose";
import dotenv from "dotenv";
import Job from "./src/models/Job.js";
import User from "./src/models/User.js";

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

// Create sample jobs
const createSampleJobs = async () => {
  try {
    // Get the first user to be the poster
    const user = await User.findOne({});
    if (!user) {
      console.error("❌ No users found. Please create a user first.");
      return;
    }

    console.log(`👤 Using user: ${user.username} (${user.email}) as job poster`);

    // Sample jobs data
    const sampleJobs = [
      {
        title: "Senior Software Engineer",
        company: "TechCorp Inc.",
        location: "San Francisco, CA",
        experience: "Senior",
        skills: ["JavaScript", "React", "Node.js", "MongoDB", "AWS"],
        description: "We are looking for a senior software engineer to join our team. You will work on building scalable web applications and mentor junior developers.",
        salary: {
          min: 120000,
          max: 180000,
          currency: "USD"
        },
        jobType: "Full-time",
        remote: true,
        tags: ["remote", "senior", "full-stack"],
        benefits: ["Health Insurance", "401k", "Flexible Hours", "Stock Options"],
        requirements: [
          "5+ years of software development experience",
          "Strong knowledge of JavaScript and React",
          "Experience with backend technologies",
          "Excellent communication skills"
        ],
        postedBy: user._id
      },
      {
        title: "Frontend Developer",
        company: "StartupXYZ",
        location: "New York, NY",
        experience: "Mid",
        skills: ["React", "TypeScript", "CSS", "HTML", "Git"],
        description: "Join our growing startup as a frontend developer. You'll be building beautiful user interfaces and working closely with our design team.",
        salary: {
          min: 80000,
          max: 120000,
          currency: "USD"
        },
        jobType: "Full-time",
        remote: false,
        tags: ["frontend", "startup", "react"],
        benefits: ["Health Insurance", "Unlimited PTO", "Learning Budget"],
        requirements: [
          "3+ years of frontend development",
          "Proficiency in React and TypeScript",
          "Experience with modern CSS frameworks",
          "Portfolio of previous work"
        ],
        postedBy: user._id
      },
      {
        title: "DevOps Engineer",
        company: "CloudTech Solutions",
        location: "Austin, TX",
        experience: "Mid",
        skills: ["AWS", "Docker", "Kubernetes", "CI/CD", "Python"],
        description: "We need a DevOps engineer to help us scale our infrastructure and improve our deployment processes.",
        salary: {
          min: 90000,
          max: 140000,
          currency: "USD"
        },
        jobType: "Full-time",
        remote: true,
        tags: ["devops", "cloud", "automation"],
        benefits: ["Health Insurance", "401k", "Remote Work", "Conference Budget"],
        requirements: [
          "3+ years of DevOps experience",
          "Strong AWS knowledge",
          "Experience with containerization",
          "Scripting skills in Python or Bash"
        ],
        postedBy: user._id
      },
      {
        title: "UI/UX Designer",
        company: "DesignStudio",
        location: "Los Angeles, CA",
        experience: "Entry",
        skills: ["Figma", "Adobe Creative Suite", "Sketch", "Prototyping"],
        description: "We're looking for a creative UI/UX designer to join our design team and help create amazing user experiences.",
        salary: {
          min: 60000,
          max: 85000,
          currency: "USD"
        },
        jobType: "Full-time",
        remote: true,
        tags: ["design", "ui", "ux", "creative"],
        benefits: ["Health Insurance", "Flexible Schedule", "Design Tools"],
        requirements: [
          "1-2 years of design experience",
          "Proficiency in Figma and Adobe Creative Suite",
          "Strong portfolio",
          "Understanding of user-centered design"
        ],
        postedBy: user._id
      },
      {
        title: "Data Scientist",
        company: "AnalyticsPro",
        location: "Seattle, WA",
        experience: "Senior",
        skills: ["Python", "Machine Learning", "SQL", "Statistics", "TensorFlow"],
        description: "Join our data science team to build machine learning models and extract insights from large datasets.",
        salary: {
          min: 110000,
          max: 160000,
          currency: "USD"
        },
        jobType: "Full-time",
        remote: true,
        tags: ["data-science", "ml", "python", "analytics"],
        benefits: ["Health Insurance", "401k", "Stock Options", "Research Time"],
        requirements: [
          "5+ years of data science experience",
          "Strong Python and ML skills",
          "PhD or Master's in related field preferred",
          "Experience with big data tools"
        ],
        postedBy: user._id
      }
    ];

    console.log("\n🚀 Creating sample jobs...");
    
    // Clear existing jobs first
    await Job.deleteMany({});
    console.log("🗑️  Cleared existing jobs");

    // Create new jobs
    const createdJobs = [];
    for (const jobData of sampleJobs) {
      const job = new Job(jobData);
      await job.save();
      createdJobs.push(job);
      console.log(`✅ Created job: ${job.title} at ${job.company}`);
    }

    console.log(`\n🎉 Successfully created ${createdJobs.length} sample jobs!`);
    console.log("\n📋 Sample jobs created:");
    createdJobs.forEach((job, index) => {
      console.log(`  ${index + 1}. ${job.title} - ${job.company} (${job.experience})`);
    });

    console.log("\n🌐 You can now view these jobs at: https://hexagon-steel.vercel.app/jobs");

  } catch (error) {
    console.error("❌ Error creating sample jobs:", error);
  }
};

// Main function
const main = async () => {
  await connectDB();
  await createSampleJobs();
  
  console.log("\n✅ Sample jobs seeding completed");
  process.exit(0);
};

main().catch(error => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});
