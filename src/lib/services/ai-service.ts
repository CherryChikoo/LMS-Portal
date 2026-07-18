import type { Question } from "@/types";

export interface AIReviewResult {
  id: string;
  suggested: Question;
  feedback: string;
}

export async function reviewQuestionsWithAI(questions: Question[]): Promise<AIReviewResult[]> {
  try {
    const response = await fetch("/api/ai-review", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ questions }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to review questions with AI");
    }

    const data = await response.json();
    return data.results;
  } catch (error) {
    console.error("Error in reviewQuestionsWithAI:", error);
    throw error;
  }
}
