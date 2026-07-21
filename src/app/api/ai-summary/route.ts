import { NextResponse } from "next/server";
import { getDocument, updateDocument } from "@/lib/firebase/firestore";
import type { ExamResult, Exam, Question } from "@/types";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 60; // Max allowed for Vercel Hobby tier

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL_NAME = "gemini-1.5-flash"; // Recommended fast model

export async function POST(req: Request) {
  try {
    const { resultId } = await req.json();

    if (!resultId) {
      return NextResponse.json({ error: "Result ID is required" }, { status: 400 });
    }

    const result = await getDocument<ExamResult>("exam_results", resultId);
    if (!result) {
      return NextResponse.json({ error: "Result not found" }, { status: 404 });
    }

    // If summary already exists, return it to save tokens
    if (result.aiSummary && typeof result.aiSummary === "object") {
      return NextResponse.json({ summary: result.aiSummary });
    }

    const exam = await getDocument<Exam>("exams", result.examId);
    if (!exam || !exam.questions) {
      return NextResponse.json({ error: "Exam or questions not found" }, { status: 404 });
    }

    // Map questions with answers to provide context to Gemini
    const performanceData = exam.questions.map((q: Question) => {
      const studentAnswer = result.answers[q.id];
      // simplified correct check
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

    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
      }
    });

    const resultResp = await response.response;
    let textResponse = resultResp.text();
    
    if (!textResponse) {
      return NextResponse.json({ error: "Empty AI response" }, { status: 500 });
    }

    const summaryData = JSON.parse(textResponse);

    // Save summary permanently in ExamResult document
    await updateDocument("exam_results", resultId, { aiSummary: summaryData });

    return NextResponse.json({ summary: summaryData });

  } catch (error) {
    console.error("AI Summary Generation Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
