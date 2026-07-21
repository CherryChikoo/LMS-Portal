import { NextResponse } from "next/server";
import type { Question } from "@/types";

export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyCcLtyLTl7DP9jJAPVSlbYB7wkQEWvekR0";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

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

    const payload = {
      contents: [
        {
          parts: [{ text: systemPrompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      }
    };

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API Error:", errText);
      return NextResponse.json({ error: "Failed to generate AI review" }, { status: 500 });
    }

    const data = await response.json();
    let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
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
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
