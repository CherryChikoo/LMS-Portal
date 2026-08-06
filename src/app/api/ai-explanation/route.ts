import { z } from 'zod';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin';
import { getErrorMessage } from '@/lib/utils/error';
import { NextResponse } from "next/server";
import type { AIExplanation, Question } from "@/types";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateFallbackExplanation } from "@/lib/utils/ai-explanation-fallback";

const AIExplanationSchema = z.object({
  examId: z.string().optional(),
  questions: z.array(z.any()).optional(),
  forceRegenerate: z.boolean().optional(),
}).strict();
export const maxDuration = 60; // Max allowed for Vercel Hobby tier

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL_NAME = "gemini-2.5-flash";

const CHUNK_SIZE = 5; // Process 5 questions per Gemini API call to avoid timeouts/token limits

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const auth = getAdminAuth();
    let decodedToken;
    try { decodedToken = await auth.verifyIdToken(authHeader.split('Bearer ')[1]); } catch(e) { return NextResponse.json({ error: 'Invalid token' }, { status: 401 }); }

    const body = await req.json().catch(() => ({}));
    const parseResult = await AIExplanationSchema.safeParseAsync(body);
    if (!parseResult.success) return NextResponse.json({ error: parseResult.error.issues[0].message }, { status: 400 });
    const { examId, questions: inputQuestions, forceRegenerate = false } = parseResult.data;

    let existingQuestions: Question[] = [];
    if (inputQuestions && Array.isArray(inputQuestions) && inputQuestions.length > 0) {
      existingQuestions = inputQuestions;
    } else if (examId) {
      const db = getAdminFirestore();
      const examDoc = await db.collection('exams').doc(examId).get();
      const exam = examDoc.exists ? examDoc.data() as Exam : null;
      if (!exam || !exam.questions || exam.questions.length === 0) {
        return NextResponse.json({ error: "Exam or questions not found" }, { status: 404 });
      }
      existingQuestions = exam.questions;
    } else {
      return NextResponse.json({ error: "Exam ID or questions array is required" }, { status: 400 });
    }

    // Filter questions that need generation
    const pendingQuestions = existingQuestions.filter((q) => {
      if (forceRegenerate) return true;
      return q.aiExplanationStatus !== "generated" || !q.aiExplanation;
    });

    if (pendingQuestions.length === 0) {
      return NextResponse.json({
        status: "skipped",
        message: "All questions already have AI explanations",
        questions: existingQuestions,
      });
    }

    let updatedQuestions = [...existingQuestions];

    // Mark targeted questions as pending
    updatedQuestions = updatedQuestions.map((q) => {
      const needsGen = pendingQuestions.some((pq) => pq.id === q.id);
      if (needsGen) {
        return { ...q, aiExplanationStatus: "pending" as const };
      }
      return q;
    });

    if (examId) {
      await updateExam(examId, { questions: updatedQuestions });
    }

    // Process chunks with Gemini API
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
        let result;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            result = await model.generateContent({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.2,
                responseMimeType: "application/json",
              },
            });
            break; // Success
          } catch (apiErr) {
            if (attempt === 3) throw apiErr;
            console.log(`[AI-ROUTE] Gemini API busy (attempt ${attempt}/3). Retrying in 5 seconds...`);
            await new Promise(r => setTimeout(r, 5000));
          }
        }

        const response = await result.response;
        let textResponse = response.text().trim();
        textResponse = textResponse.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

        if (!textResponse) {
          failedCount += chunk.length;
          continue;
        }

        const parsed = JSON.parse(textResponse);
        const parsedArray = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.data || []);

        // Update questions in the array
        updatedQuestions = updatedQuestions.map((q, qIdx) => {
          const chunkIdx = chunk.findIndex((cq) => cq.id === q.id);
          const generated =
            parsedArray.find((p: any) => p.id === q.id || String(p.id).trim() === String(q.id).trim()) ||
            (chunkIdx !== -1 ? parsedArray[chunkIdx] : null) ||
            parsedArray[qIdx];

          if (generated) {
            const raw = generated.aiExplanation || generated;
            const explanation: AIExplanation = {
              overview: raw.overview || {
                summary: raw.whyCorrect || "Detailed explanation summary.",
                type: q.type || "mcq",
                topic: q.topic || "General",
                subtopic: "General",
                difficulty: q.difficulty || "medium",
              },
              stepByStep: raw.stepByStep || raw.whyCorrect || "Step by step analysis.",
              whyCorrect: raw.whyCorrect || (typeof raw === "string" ? raw : "Detailed answer explanation."),
              whyIncorrect: raw.whyIncorrect || {},
              keyConcepts: raw.keyConcepts || [],
              commonMistakes: raw.commonMistakes || [],
              revisionNotes: raw.revisionNotes || "",
              relatedConcepts: raw.relatedConcepts || [],
              realWorldExample: raw.realWorldExample || "",
              difficultyAnalysis: raw.difficultyAnalysis || "",
              interviewPerspective: raw.interviewPerspective || "",
              learningObjective: raw.learningObjective || "",
            };

            generatedCount++;
            return {
              ...q,
              aiExplanation: explanation,
              aiExplanationStatus: "generated" as const,
            };
          }
          return q;
        });
      } catch (err: unknown) {
        console.error("[SEQUENTIAL AI PIPELINE] FATAL GEMINI ERROR:", (err as any)?.response?.data || (err as any)?.message || err, (err as any)?.stack);
        failedCount += chunk.length;
      }
    }

    // Ensure 100% of questions have generated AI explanations (using fallback if Gemini API fails or is unconfigured)
    updatedQuestions = updatedQuestions.map((q) => {
      if (q.aiExplanationStatus === "pending" || !q.aiExplanation) {
        return {
          ...q,
          aiExplanation: generateFallbackExplanation(q),
          aiExplanationStatus: "generated" as const,
        };
      }
      return q;
    });

    // If examId exists in DB, update DB
    if (examId) {
      const db = getAdminFirestore();
      await db.collection('exams').doc(examId).update({ questions: updatedQuestions });
    }

    return NextResponse.json({
      status: "completed",
      questions: updatedQuestions,
      generatedCount,
      failedCount,
      totalProcessed: pendingQuestions.length,
    });
  } catch (error: unknown) {
    console.error("[SEQUENTIAL AI PIPELINE] FATAL API ERROR:", (error as any)?.response?.data || (error as any)?.message || error, (error as any)?.stack);
    const errorMessage = error instanceof Error ? getErrorMessage(error) : "Internal Server Error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
