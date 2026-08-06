const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config({ path: ".env.local" });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const systemPrompt = `You are an expert AI educational tutor.
I will provide you with an array of assessment questions.
For each question, generate a highly detailed, educational AI Explanation following this EXACT JSON schema.
The JSON must be an array of objects corresponding to the input questions in the same order.

CRITICAL INSTRUCTION: All string values MUST be plain text. DO NOT use any markdown formatting (no asterisks, no bolding, no numbered lists). Write continuous, cohesive paragraphs.

Schema for each object:
{
  "id": "original_question_id",
  "aiExplanation": {
    "whyCorrect": "Detailed explanation of why the correct answer is right. Plain text only.",
    "whyIncorrect": { "Option A": "Why it's wrong", "Option B": "Why it's wrong" },
    "keyConcepts": ["Concept 1", "Concept 2"],
    "commonMistakes": ["Mistake 1", "Mistake 2"],
    "revisionNotes": "A short, memorable note for revision.",
    "relatedConcepts": ["Related 1", "Related 2"],
    "realWorldExample": "A real-world application (if applicable).",
    "difficultyAnalysis": "Why this question is considered this difficulty.",
    "interviewPerspective": "Is this common in interviews? Why?",
    "learningObjective": "What the student should learn."
  }
}

Do NOT wrap the output in markdown code blocks like \`\`\`json. Return RAW valid JSON array only.`;

const chunk = [
  {
    "id": "test-q1",
    "text": "What is the capital of France?",
    "options": ["London", "Berlin", "Paris", "Madrid"],
    "correctAnswer": "Paris",
    "type": "mcq",
    "topic": "Geography"
  }
];

async function run() {
  try {
    const prompt = `${systemPrompt}\n\nQuestions:\n${JSON.stringify(chunk, null, 2)}`;
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    });

    const response = await result.response;
    console.log("Response text:", response.text());
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
