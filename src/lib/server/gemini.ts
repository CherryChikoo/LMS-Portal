import { getErrorMessage } from '@/lib/utils/error';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Question } from "@/types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const MODEL_NAME = "gemini-1.5-flash"; // Recommended fast model

export async function generateAIExplanations(questions: Question[]): Promise<Array<{ id: string; text: string; error?: string }>> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing from environment variables.");
  }
  
  if (!questions || questions.length === 0) return [];

  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const prompt = `You are an expert AI tutor. For each of the following multiple choice questions, provide a clear, step-by-step explanation of why the correct answer is correct and why the other options might be incorrect or misleading.
  
Return the output as a strictly formatted JSON array containing objects with the following shape:
[{ "id": "question_id_here", "text": "Detailed explanation here..." }]

Here are the questions:
${questions.map((q, i) => `
Question ${i + 1}:
ID: ${q.id}
Text: ${q.text}
Options: ${q.options ? q.options.map(opt => `- ${opt}`).join("\n") : "N/A"}
Correct Answer: ${q.correctAnswer}
`).join("\n")}

Respond ONLY with the raw JSON array. Do not include markdown code blocks.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error: unknown) {
    console.error("Gemini SDK Generation Error:", error);
    throw new Error(getErrorMessage(error) || "Failed to generate explanations via Gemini SDK");
  }
}

export async function generateAIAssessmentSummary(questions: Question[]): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing from environment variables.");
  }

  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const prompt = `You are an expert curriculum designer and educator. Based on the following set of multiple-choice questions for an upcoming assessment, please generate a comprehensive, high-level summary. The summary should highlight:
1. The core topics and themes covered.
2. The overall difficulty level and cognitive skills required (e.g., recall, application, analysis).
3. Advice for students on what they should focus on when studying for this assessment.

Questions:
${questions.map(q => `- ${q.text}`).join("\n")}

Please format your response in professional, structured Markdown.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error: unknown) {
    console.error("Gemini SDK Summary Generation Error:", error);
    throw new Error("Failed to generate AI summary");
  }
}

export async function generateAIReview(results: any): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing from environment variables.");
  }

  const model = genAI.getGenerativeModel({ model: MODEL_NAME });

  const prompt = `You are an empathetic and expert AI tutor reviewing a student's assessment performance. 
Analyze the following student results and provide a comprehensive learning review.

Results Data:
${JSON.stringify(results, null, 2)}

Your review should:
1. Start with an encouraging tone.
2. Highlight areas of strength.
3. Identify specific knowledge gaps based on incorrect answers.
4. Provide actionable study recommendations.

Format the output strictly as a professional Markdown document.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error: unknown) {
    console.error("Gemini SDK Review Generation Error:", error);
    throw new Error("Failed to generate AI review");
  }
}
