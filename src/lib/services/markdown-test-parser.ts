import type { Question } from "@/types";

/**
 * Parse structured markdown test file into editable Question objects
 */
export function parseMarkdownTest(mdText: string): Question[] {
  const blocks = mdText
    .split(/(?=# Question \d+|### Question \d+|\*\*Question \d+\*\*)/i)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const questions: Question[] = [];

  blocks.forEach((block, idx) => {
    const lines = block.split(/\r\n|\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    // Line 0 is usually "# Question X"
    let qText = "";
    const options: string[] = [];
    let answerLetter = "A";
    let marks = 2;

    let lineIndex = 0;
    if (lines[0].match(/^(#|###|\*\*)*Question \d+/i)) {
      lineIndex = 1;
    }

    // Read question text until we hit option lines (A. or B. or C. or D.) or Answer: or Marks:
    while (lineIndex < lines.length) {
      const line = lines[lineIndex];
      if (line.match(/^[A-D]\s*\./i) || line.match(/^Answer:/i) || line.match(/^Marks:/i)) {
        break;
      }
      qText += (qText ? " " : "") + line;
      lineIndex++;
    }

    // Read options and metadata
    while (lineIndex < lines.length) {
      const line = lines[lineIndex];
      const optMatch = line.match(/^([A-D])\s*\.\s*(.+)$/i);
      if (optMatch) {
        options.push(optMatch[2].trim());
      } else if (line.match(/^Answer:/i)) {
        const ansMatch = line.match(/^Answer:\s*([A-D])/i);
        if (ansMatch) {
          answerLetter = ansMatch[1].toUpperCase();
        }
      } else if (line.match(/^Marks:/i)) {
        const marksMatch = line.match(/^Marks:\s*(\d+)/i);
        if (marksMatch) {
          marks = parseInt(marksMatch[1], 10) || 2;
        }
      }
      lineIndex++;
    }

    if (!qText && options.length === 0) return;

    // Convert Answer letter A/B/C/D to actual option text
    const letterToIndex: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
    const ansIdx = letterToIndex[answerLetter] ?? 0;
    const correctText = options[ansIdx] || options[0] || "Option A";

    questions.push({
      id: `q-md-${Date.now()}-${idx}`,
      text: qText || `Question ${idx + 1}`,
      type: "mcq",
      options: options.length >= 4 ? options : ["Option A", "Option B", "Option C", "Option D"],
      correctAnswer: correctText,
      marks,
      subject: "General",
      topic: "Assessment",
      difficulty: "medium",
      tags: ["markdown"],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  return questions;
}
