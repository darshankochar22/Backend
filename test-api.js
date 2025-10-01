#!/usr/bin/env node

// Simple test script for the Node.js backend
import fetch from "node-fetch";

const BASE_URL = "http://localhost:5003";

async function testAPI() {
  console.log("🧪 Testing Node.js Backend API...\n");

  try {
    // Test health endpoint
    console.log("1. Testing health endpoint...");
    const healthResponse = await fetch(`${BASE_URL}/`);
    const healthData = await healthResponse.json();
    console.log("✅ Health check:", healthData.message);
    console.log("");

    // Test user signup
    console.log("2. Testing user signup...");
    const signupData = {
      username: "testuser123",
      email: "test@example.com",
      password: "TestPass123",
    };

    const signupResponse = await fetch(`${BASE_URL}/auth/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(signupData),
    });

    if (signupResponse.ok) {
      const signupResult = await signupResponse.json();
      console.log("✅ Signup successful:", signupResult.message);
      console.log("   User:", signupResult.user.username);

      // Test user login
      console.log("3. Testing user login...");
      const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: signupData.email,
          password: signupData.password,
        }),
      });

      if (loginResponse.ok) {
        const loginResult = await loginResponse.json();
        console.log("✅ Login successful:", loginResult.message);
        const token = loginResult.access_token;

        // Test get user profile
        console.log("4. Testing get user profile...");
        const profileResponse = await fetch(`${BASE_URL}/users/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          console.log("✅ Profile retrieved:", profileData.username);
        } else {
          console.log("❌ Profile retrieval failed");
        }

        // Test create todo
        console.log("5. Testing create todo...");
        const todoData = {
          title: "Test Todo",
          description: "This is a test todo item",
          priority: "high",
        };

        const todoResponse = await fetch(`${BASE_URL}/todos`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(todoData),
        });

        if (todoResponse.ok) {
          const todoResult = await todoResponse.json();
          console.log("✅ Todo created:", todoResult.title);
          const todoId = todoResult._id;

          // Test get todos
          console.log("6. Testing get todos...");
          const todosResponse = await fetch(`${BASE_URL}/todos`, {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });

          if (todosResponse.ok) {
            const todosData = await todosResponse.json();
            console.log(
              "✅ Todos retrieved:",
              todosData.todos.length,
              "todo(s)"
            );
          } else {
            console.log("❌ Todos retrieval failed");
          }

          // Test toggle todo
          console.log("7. Testing toggle todo...");
          const toggleResponse = await fetch(
            `${BASE_URL}/todos/${todoId}/toggle`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            }
          );

          if (toggleResponse.ok) {
            const toggleResult = await toggleResponse.json();
            console.log(
              "✅ Todo toggled:",
              toggleResult.completed ? "completed" : "pending"
            );
          } else {
            console.log("❌ Todo toggle failed");
          }
        } else {
          console.log("❌ Todo creation failed");
        }
      } else {
        console.log("❌ Login failed");
      }
    } else {
      console.log("❌ Signup failed - user might already exist");
    }
  } catch (error) {
    console.error("❌ Test failed:", error.message);
  }

  console.log("\n🎉 API testing completed!");
}

testAPI();
