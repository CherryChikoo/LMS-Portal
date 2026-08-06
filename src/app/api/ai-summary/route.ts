import { getErrorMessage } from '@/lib/utils/error';
import { NextRequest, NextResponse } from "next/server";
import { getDocument, updateDocument } from "@/lib/firebase/firestore";
import type { ExamResult, Exam, Question } from "@/types";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAdminAuth } from "@/lib/firebase/admin";
import { z } from "zod";

export const maxDuration = 60; // Max allowed for Vercel Hobby tier

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
    
    const auth = getAdminAuth();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(idToken);
    } catch (err) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = await AISummarySchema.safeParseAsync(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error.issues[0].message }, { status: 400 });
    }
    const { resultId } = parseResult.data;

    const result = await getDocument<ExamResult>("exam_results", resultId);
    if (!result) {
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }

    // BOLA protection: Only allow the student who took the exam, or an admin/college_admin
    const userRole = decodedToken.role;
    if (userRole === "student" && result.studentId !== decodedToken.uid) {
      return NextResponse.json({ error: "Access denied. You can only view your own results." }, { status: 403 });
    }
    if (userRole === "college_admin" && result.collegeId !== decodedToken.collegeId) {
      return NextResponse.json({ error: "Access denied. Student does not belong to your college." }, { status: 403 });
    }

    if (result.aiSummary && typeof result.aiSummary === "object") {
      return NextResponse.json({ summary: result.aiSummary });
    }

    const exam = await getDocument<Exam>("exams", result.examId);
    if (!exam || !exam.questions) {
      return NextResponse.json({ error: "Exam or questions not found" }, { status: 404 });
    }

    const performanceData = exam.questions.map((q: Question) => {
      const studentAnswer = ((result.answers || {}) || {})[q.id];
      let isCorrect = false;
      if (Array.isArray(q.correctAnswer) && Array.isArray(studentAnswer)) {
        isCorrect = q.correctAnswer.length === studentAnswer.length &&
          q.correctAnswer.every((val) => (studentAnswer as string[]).includes(val));
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
        aiExplanationSummary: q.aiExplanation?.overview?.summary || ""
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

    const prompt = `${systemPrompt}\n\nData:\n${JSON.stringify({
      studentName: result.studentName,
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
    await updateDocument("exam_results", resultId, { aiSummary: summaryData });
    return NextResponse.json({ summary: summaryData });

  } catch (error) {
    const message = process.env.NODE_ENV === "production" ? "Internal server error." : getErrorMessage(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
