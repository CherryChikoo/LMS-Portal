import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ExamResult, Exam, Question } from "@/types";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";

// maxDuration removed - causing Next.js 16 build issues
// export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL_NAME = "gemini-2.5-flash"; // Recommended fast model

const AISummarySchema = z.object({
  resultId: z.string().min(1, "Result ID is required"),
}).strict();

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid authorization token" }, { status: 401 });
    }
    const idToken = authHeader.split("Bearer ")[1];
    
    const { data: { user: decodedToken }, error: authError } = await supabaseAdmin.auth.getUser(idToken);
    if (authError || !decodedToken) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = await AISummarySchema.safeParseAsync(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.issues[0].message }, { status: 400 });
    }
    const { resultId } = parseResult.data;

    const result = await prisma.exam_results.findUnique({
      where: { id: resultId },
      include: { students: true }
    });

    if (!result) {
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }

    const userRole = decodedToken.app_metadata.role || "student";
    if (userRole === "student" && result.studentId !== decodedToken.id) {
      return NextResponse.json({ error: "Access denied. You can only view your own results." }, { status: 403 });
    }
    if (userRole === "college_admin" && result.students?.collegeId !== decodedToken.app_metadata.collegeId) {
      return NextResponse.json({ error: "Access denied. Student does not belong to your college." }, { status: 403 });
    }

    if (result.aiSummary && typeof result.aiSummary === "object") {
      return NextResponse.json({ summary: result.aiSummary });
    }

    const exam = await prisma.exams.findUnique({
      where: { id: result.examId },
      include: { questions: true }
    });

    if (!exam || !exam.questions) {
      return NextResponse.json({ error: "Exam or questions not found" }, { status: 404 });
    }

    const performanceData = exam.questions.map((q: any) => {
      const studentAnswer = ((result.answers as any || {}) || {})[q.id];
      let isCorrect = false;
      if (Array.isArray(q.correctAnswer) && Array.isArray(studentAnswer)) {
        isCorrect = q.correctAnswer.length === studentAnswer.length &&
          q.correctAnswer.every((val: any) => (studentAnswer as string[]).includes(val));
      } else if (typeof q.correctAnswer === "string" && typeof studentAnswer === "string") {
        isCorrect = q.correctAnswer === studentAnswer;
      } else if (Array.isArray(q.correctAnswer) && typeof studentAnswer === "string") {
        isCorrect = q.correctAnswer.includes(studentAnswer);
      }

      return {
        questionId: q.id,
        topic: q.topic || "General",
        difficulty: q.difficulty || "medium",
        isCorrect,
        aiExplanationSummary: q.aiExplanation ? (q.aiExplanation as any)?.overview?.summary : ""
      };
    });

    const systemPrompt = `You are an expert personalized AI learning mentor.
I will provide you with a student's performance data on an assessment.
Your task is to analyze this performance and generate a highly personalized, encouraging, and actionable Learning Report.

Schema:
{
  "overallPerformance": "A short, encouraging paragraph summarizing their performance.",
  "strongTopics": ["Topic 1", "Topic 2"],
  "weakTopics": ["Topic 1", "Topic 2"],
  "frequentlyMissedConcepts": ["Concept 1", "Concept 2"],
  "learningGaps": "A short analysis of potential knowledge gaps.",
  "improvementAreas": "Specific areas to focus on.",
  "recommendedRevisionTopics": ["Revision 1", "Revision 2"],
  "suggestedPracticeAreas": ["Practice 1", "Practice 2"],
  "estimatedSkillLevel": "Beginner / Intermediate / Advanced",
  "confidenceAnalysis": "Analysis of their answering patterns.",
  "examDifficultyAnalysis": "How hard the exam was relative to their performance.",
  "timeManagementAnalysis": "Analysis based on standard expected times.",
  "learningRecommendations": ["Rec 1", "Rec 2"],
  "personalizedStudyPlan": "A brief study plan outline.",
  "nextTopicsToLearn": ["Next 1", "Next 2"],
  "motivationalSummary": "A final, highly encouraging sign-off."
}

Do NOT wrap the output in markdown code blocks like \`\`\`json. Return RAW valid JSON only.`;

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });
    }
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });

    const prompt = `${systemPrompt}

Data:
${JSON.stringify({
      studentName: result.students?.id ? (result.students as any).name : "Unknown",
      score: result.score,
      totalMarks: result.totalMarks,
      percentage: result.percentage,
      performanceData
    }, null, 2)}`;

    const aiResponse = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" }
    });

    const resultResp = await aiResponse.response;
    const textResponse = resultResp.text();
    
    if (!textResponse) {
      return NextResponse.json({ error: "Empty AI response" }, { status: 500 });
    }

    const summaryData = JSON.parse(textResponse);
    await prisma.exam_results.update({ where: { id: resultId }, data: { aiSummary: summaryData } });
    return NextResponse.json({ summary: summaryData });

  } catch (error) {
    const message = process.env.NODE_ENV === "production" ? "Internal server error." : getErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
