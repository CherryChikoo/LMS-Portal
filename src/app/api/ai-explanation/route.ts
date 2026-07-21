import { NextResponse } from "next/server";
import { getExamById, updateExam } from "@/lib/services/exam-service";
import type { AIExplanation } from "@/types";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 60; // Max allowed for Vercel Hobby tier

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL_NAME = "gemini-2.5-flash";

const CHUNK_SIZE = 5; // Process 5 questions per Gemini API call to avoid timeouts/token limits

export async function POST(req: Request) {
  try {
    const { examId, forceRegenerate = false } = await req.json();

    if (!examId) {
      return NextResponse.json({ error: "Exam ID is required" }, { status: 400 });
    }

    const exam = await getExamById(examId);
    if (!exam || !exam.questions || exam.questions.length === 0) {
      return NextResponse.json({ error: "Exam or questions not found" }, { status: 404 });
    }

    // Filter questions that need generation
    const pendingQuestions = exam.questions.filter((q) => {
      if (forceRegenerate) return true;
      return q.aiExplanationStatus !== "generated" || !q.aiExplanation;
    });

    if (pendingQuestions.length === 0) {
      return NextResponse.json({ status: "skipped", message: "All questions already have AI explanations" });
    }

    // Set status to pending for targeted questions
    let updatedQuestions = [...exam.questions];
    let hasUpdates = false;

    updatedQuestions = updatedQuestions.map((q) => {
      const needsGen = pendingQuestions.some((pq) => pq.id === q.id);
      if (needsGen) {
        hasUpdates = true;
        return { ...q, aiExplanationStatus: "pending" as const };
      }
      return q;
    });

    if (hasUpdates) {
      await updateExam(examId, { questions: updatedQuestions });
    }

    // We process the chunks sequentially to avoid rate limiting
    const chunks = [];
    for (let i = 0; i < pendingQuestions.length; i += CHUNK_SIZE) {
      chunks.push(pendingQuestions.slice(i, i + CHUNK_SIZE));
    }

    const systemPrompt = `You are an expert AI educational tutor.
I will provide you with an array of assessment questions.
For each question, generate a highly detailed, educational AI Explanation following this EXACT JSON schema.
The JSON must be an array of objects corresponding to the input questions in the same order.

CRITICAL INSTRUCTION: All string values MUST be plain text. DO NOT use any markdown formatting (no asterisks, no bolding, no numbered lists). Write continuous, cohesive paragraphs.

Schema for each object:
{
  "id": "original_question_id",
  "aiExplanation": {
    "overview": {
      "summary": "1 sentence summary of the core concept tested.",
      "type": "question type",
      "topic": "main topic",
      "subtopic": "specific subtopic",
      "difficulty": "Easy/Medium/Hard"
    },
    "stepByStep": "Detailed reasoning on how to solve this. Must be a single cohesive paragraph of plain text.",
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

    let generatedCount = 0;
    let failedCount = 0;

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });
    }
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    for (const chunk of chunks) {
      try {
        const prompt = `${systemPrompt}\n\nQuestions:\n${JSON.stringify(chunk, null, 2)}`;
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          }
        });
        
        const response = await result.response;
        let textResponse = response.text();
        
        if (!textResponse) {
          failedCount += chunk.length;
          continue;
        }

        const parsed = JSON.parse(textResponse) as Array<{ id: string; aiExplanation: AIExplanation }>;
        
        // Update questions in the array
        updatedQuestions = updatedQuestions.map((q) => {
          const generated = parsed.find((p) => p.id === q.id);
          if (generated) {
            generatedCount++;
            return {
              ...q,
              aiExplanation: generated.aiExplanation,
              aiExplanationStatus: "generated" as const,
            };
          }
          return q;
        });

      } catch (err) {
        console.error("Failed to parse or fetch chunk", err);
        failedCount += chunk.length;
      }
    }

    // Mark remaining pending as failed if they weren't generated
    updatedQuestions = updatedQuestions.map((q) => {
      if (q.aiExplanationStatus === "pending") {
        return { ...q, aiExplanationStatus: "failed" as const };
      }
      return q;
    });

    // Save final updated questions to DB
    await updateExam(examId, { questions: updatedQuestions });

    return NextResponse.json({ 
      status: "completed", 
      generatedCount, 
      failedCount,
      totalProcessed: pendingQuestions.length 
    });

  } catch (error) {
    console.error("AI Explanation Generation Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
