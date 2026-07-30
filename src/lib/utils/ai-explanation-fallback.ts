import type { Question, AIExplanation } from "@/types";

export function generateFallbackExplanation(q: Question): AIExplanation {
  const correctOpt = Array.isArray(q.correctAnswer)
    ? q.correctAnswer.join(", ")
    : (q.correctAnswer || "Option A");
  const options = q.options || [];

  const whyIncorrect: Record<string, string> = {};
  options.forEach((opt) => {
    if (opt !== correctOpt) {
      whyIncorrect[opt] = `Option "${opt}" is incorrect because it does not satisfy the requirements specified in the question prompt.`;
    }
  });

  return {
    overview: {
      summary: `The correct answer is "${correctOpt}". This option accurately addresses the requirements of the question.`,
      type: q.type || "mcq",
      topic: q.topic || "General",
      subtopic: "Core Concept",
      difficulty: q.difficulty || "medium",
    },
    stepByStep: `1. Carefully evaluate the question prompt: "${q.text}".\n2. Assess each available option against core domain concepts.\n3. Conclude that "${correctOpt}" is the correct and logical answer.`,
    whyCorrect: `The correct answer is "${correctOpt}". It directly aligns with the fundamental principles of ${q.topic || "the subject"}.`,
    whyIncorrect,
    keyConcepts: [q.topic || "Core Principles", "Assessment Analysis", "Fundamental Concepts"],
    commonMistakes: ["Misinterpreting key terms in the question", "Selecting plausible but inaccurate options"],
    revisionNotes: `Key Takeaway: Remember that "${correctOpt}" is the correct response for questions regarding ${q.topic || "this topic"}.`,
    relatedConcepts: ["Foundational Logic", "Practical Applications"],
    realWorldExample: `Applying this concept in real-world scenarios ensures accurate reasoning and avoids common mistakes.`,
    difficultyAnalysis: `This question tests ${q.difficulty || "medium"}-level conceptual understanding.`,
    interviewPerspective: `This fundamental concept is frequently featured in technical and academic evaluations.`,
    learningObjective: `Understand and apply key principles of ${q.topic || "this subject"}.`,
  };
}
