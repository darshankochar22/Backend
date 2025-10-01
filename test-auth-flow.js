#!/usr/bin/env node

const BASE_URL = "http://localhost:5003";

async function testAuthFlow() {
  console.log("🧪 Testing Authentication Flow...\n");

  try {
    // Test 1: Health Check
    console.log("1. Testing health check...");
    const healthResponse = await fetch(`${BASE_URL}/`);
    const healthData = await healthResponse.json();
    console.log("✅ Health check:", healthData.status);
    console.log("");

    // Test 2: Signup with valid data
    console.log("2. Testing user signup...");
    const signupData = {
      username: "testuser123",
      email: "testuser123@example.com",
      password: "TestPass123",
    };

    const signupResponse = await fetch(`${BASE_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signupData),
    });

    const signupResult = await signupResponse.json();

    if (signupResponse.ok) {
      console.log("✅ Signup successful:", signupResult.message);
      console.log("   User ID:", signupResult.user.id);
      console.log("   Username:", signupResult.user.username);
      console.log("   Email:", signupResult.user.email);

      // Test 3: Login with created user
      console.log("");
      console.log("3. Testing user login...");

      const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: signupData.email,
          password: signupData.password,
        }),
      });

      const loginResult = await loginResponse.json();

      if (loginResponse.ok) {
        console.log("✅ Login successful:", loginResult.message);
        console.log("   Access token received:", !!loginResult.access_token);
        console.log("   Refresh token received:", !!loginResult.refresh_token);

        // Test 4: Access protected route
        console.log("");
        console.log("4. Testing protected route access...");

        const profileResponse = await fetch(`${BASE_URL}/users/me`, {
          headers: {
            Authorization: `Bearer ${loginResult.access_token}`,
          },
        });

        const profileResult = await profileResponse.json();

        if (profileResponse.ok) {
          console.log("✅ Profile access successful");
          console.log("   Profile data received for:", profileResult.username);
        } else {
          console.log("❌ Profile access failed:", profileResult.error);
        }
      } else {
        console.log("❌ Login failed:", loginResult.error);
      }
    } else {
      console.log("❌ Signup failed:", signupResult.error);
      if (signupResult.details) {
        console.log(
          "   Validation errors:",
          signupResult.details.map((d) => d.msg).join(", ")
        );
      }
    }

    // Test 5: Test validation errors
    console.log("");
    console.log("5. Testing validation errors...");

    const invalidSignupResponse = await fetch(`${BASE_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "ab", // too short
        email: "invalid-email",
        password: "123", // too weak
      }),
    });

    const invalidSignupResult = await invalidSignupResponse.json();

    if (!invalidSignupResponse.ok) {
      console.log("✅ Validation working correctly");
      console.log(
        "   Errors:",
        invalidSignupResult.details.map((d) => d.msg).join(", ")
      );
    } else {
      console.log("❌ Validation should have failed");
    }
  } catch (error) {
    console.error("❌ Test failed with error:", error.message);
  }

  console.log("");
  console.log("🎉 Authentication flow test completed!");
}

// Run the test
testAuthFlow();
