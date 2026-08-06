const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config({ path: ".env.local" });

const CHUNK_SIZE = 5;

async function run() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!privateKey) {
    console.error("Missing FIREBASE_ADMIN_PRIVATE_KEY");
    return;
  }
  privateKey = privateKey.replace(/\\n/g, '\n').replace(/^"|"$/g, "");

  try {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  } catch (e) {
    if (!/already exists/.test(e.message)) {
      console.error("Firebase Initialization Error", e);
      return;
    }
  }

  const db = getFirestore();
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  console.log("Fetching exams...");
  const examsSnapshot = await db.collection("exams").get();
  console.log(`Found ${examsSnapshot.size} exams.`);

  for (const examDoc of examsSnapshot.docs) {
    const exam = examDoc.data();
    if (!exam.questions || exam.questions.length === 0) continue;

    console.log(`Processing exam: ${exam.title || examDoc.id}`);
    
    // Find questions that have the fallback explanation
    const pendingQuestions = exam.questions.filter((q) => {
      if (!q.aiExplanation) return true;
      const whyCorrect = q.aiExplanation.whyCorrect || "";
      return whyCorrect.includes("It directly aligns with the fundamental principles of");
    });

    if (pendingQuestions.length === 0) {
      console.log(`- All questions look fine. Skipping.`);
      continue;
    }

    console.log(`- Found ${pendingQuestions.length} questions to fix.`);

    const chunks = [];
    for (let i = 0; i < pendingQuestions.length; i += CHUNK_SIZE) {
      chunks.push(pendingQuestions.slice(i, i + CHUNK_SIZE));
    }

    let updatedQuestions = [...exam.questions];
    let generatedCount = 0;

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
            console.log(`Gemini API busy (attempt ${attempt}/3). Retrying in 5 seconds...`);
            await new Promise(r => setTimeout(r, 5000));
          }
        }

        let textResponse = result.response.text().trim();
        textResponse = textResponse.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

        if (!textResponse) continue;

        const parsed = JSON.parse(textResponse);
        const parsedArray = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.data || []);

        updatedQuestions = updatedQuestions.map((q) => {
          const generated = parsedArray.find((p) => p.id === q.id || String(p.id).trim() === String(q.id).trim());
          if (generated) {
            const raw = generated.aiExplanation || generated;
            const explanation = {
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
              aiExplanationStatus: "generated",
            };
          }
          return q;
        });
      } catch (err) {
        console.error("Gemini API Error for chunk:", err?.message || err);
      }
    }

    if (generatedCount > 0) {
      console.log(`- Fixed ${generatedCount} explanations. Saving to Firestore...`);
      await db.collection("exams").doc(examDoc.id).update({
        questions: updatedQuestions,
      });
      console.log(`- Saved.`);
    }
  }
  
  console.log("Done.");
}

run();
