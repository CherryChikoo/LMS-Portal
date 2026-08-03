import { getErrorMessage } from '@/lib/utils/error';
import { NextResponse } from "next/server";
import type { Question } from "@/types";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL_NAME = "gemini-2.5-flash";

export async function POST(req: Request) {
  try {
    const { questions } = await req.json();

    if (!questions || !Array.isArray(questions)) {
      return NextResponse.json({ error: "Invalid questions payload" }, { status: 400 });
    }

    const systemPrompt = `You are an expert educational assessment reviewer.
I will provide you with an array of exam questions in JSON format.
Your job is to review these questions and improve them:
1. Fix any grammatical or spelling errors.
2. Clarify ambiguous phrasing.
3. Ensure the 'correctAnswer' is logically correct and accurately spelled.
4. For Multiple Choice Questions (mcq), ensure distractor options are plausible but clearly incorrect.

Return the output strictly as a JSON array where each object has:
- id: (the exact original string id)
- suggested: (the full Question object with your improvements applied)
- feedback: (a short, 1-2 sentence string explaining what you changed and why)

Do NOT include Markdown formatting like \`\`\`json. Return only the raw JSON array.

Original Questions:
${JSON.stringify(questions, null, 2)}`;

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });
    }
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      }
    });

    const resultResp = await response.response;
    let textResponse = resultResp.text();
    
    if (!textResponse) {
      return NextResponse.json({ error: "Empty response from AI" }, { status: 500 });
    }

    try {
      const cleanJson = textResponse.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return NextResponse.json({ results: parsed });
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON", textResponse);
      return NextResponse.json({ error: "Invalid JSON response from AI" }, { status: 500 });
    }
  } catch (error) {
    console.error("AI Review Route Error:", error);
    const errorMessage = error instanceof Error ? getErrorMessage(error) : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
