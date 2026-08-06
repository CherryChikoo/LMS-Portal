const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config({ path: ".env.local" });

async function test(modelName) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    console.error("No API key");
    return;
  }
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: modelName });
  
  try {
    const result = await model.generateContent("Hello!");
    console.log(`Success with ${modelName}:`, result.response.text());
  } catch(e) {
    console.error(`Error with ${modelName}:`, e.message || e);
  }
}

async function run() {
  await test("gemini-2.5-flash");
  await test("gemini-1.5-flash-latest");
}

run();
