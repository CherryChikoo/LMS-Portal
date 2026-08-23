"use server";

import { prisma } from '@/lib/prisma';

const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

function serializeExamResults(results: any[]) {
  return results.map(r => ({
    ...r,
    // Convert Prisma Decimal to number for client serialization
    percentage: r.percentage ? Number(String(r.percentage)) : null,
    // Convert Date objects to ISO strings
    createdAt: r.createdAt ? (r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt) : null,
    updatedAt: r.updatedAt ? (r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt) : null,
    submittedAt: r.submittedAt ? (r.submittedAt instanceof Date ? r.submittedAt.toISOString() : r.submittedAt) : null,
    startTime: r.startTime ? (r.startTime instanceof Date ? r.startTime.toISOString() : r.startTime) : null,
    examTitle: r.exams?.title || r.examTitle,
    studentName: r.students?.users?.displayName || r.studentName,
    studentEmail: r.students?.users?.email || r.studentEmail,
    collegeId: r.students?.collegeId || r.collegeId
  }));
}

function serializeExam(e: any) {
  if (!e) return null;
  const questions = Array.isArray(e.questions) ? e.questions : [];
  const questionCount = questions.length || (Array.isArray(e.questionIds) ? e.questionIds.length : 0);
  const dur = e.durationMinutes ?? e.duration ?? 60;
  return {
    ...e,
    duration: dur,
    durationMinutes: dur,
    questions,
    questionIds: questions.map((q: any) => q.id),
    totalQuestions: questionCount,
    collegeName: e.colleges?.name || e.collegeName || null,
  };
}

/**
 * DEPRECATED: Loads ALL exams with ALL questions - can be slow with many exams
 * Use getAllExamsOptimizedAction() instead which uses _count for questions
 * 
 * @deprecated Use getAllExamsOptimizedAction() for listing, getExamWithQuestionsAction() for details
 */
export async function getAllExamsAction() {
  console.warn("[DEPRECATED] getAllExamsAction() loads all questions. Use getAllExamsOptimizedAction() instead.");
  const exams = await prisma.exams.findMany({
    where: { deletedAt: null },
    include: {
      questions: {
        orderBy: { sortOrder: 'asc' }
      },
      colleges: {
        select: { id: true, name: true, code: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  return exams.map(serializeExam);
}

/**
 * OPTIMIZED: Get all exams with question count only (no question content)
 * Use getExamWithQuestionsAction(examId) to lazy load questions for a specific exam
 */
export async function getAllExamsOptimizedAction() {
  const exams = await prisma.exams.findMany({
    where: { deletedAt: null },
    include: {
      _count: { select: { questions: true } },
      colleges: {
        select: { id: true, name: true, code: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  return exams.map((exam) => ({
    ...serializeExam(exam as any),
    questions: [], // Empty array - lazy load when needed
    questionCount: exam._count.questions,
  }));
}

/**
 * DEPRECATED: Loads ALL exams including deleted with ALL questions
 * Use getAllExamsIncludingDeletedOptimizedAction() instead
 * 
 * @deprecated Use getAllExamsIncludingDeletedOptimizedAction() for listing
 */
export async function getAllExamsIncludingDeletedAction() {
  console.warn("[DEPRECATED] getAllExamsIncludingDeletedAction() loads all questions. Use optimized version.");
  const exams = await prisma.exams.findMany({
    include: {
      questions: {
        orderBy: { sortOrder: 'asc' }
      },
      colleges: {
        select: { id: true, name: true, code: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  return exams.map(serializeExam);
}

/**
 * OPTIMIZED: Get all exams including deleted with question count only
 */
export async function getAllExamsIncludingDeletedOptimizedAction() {
  const exams = await prisma.exams.findMany({
    include: {
      _count: { select: { questions: true } },
      colleges: {
        select: { id: true, name: true, code: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  return exams.map((exam) => ({
    ...serializeExam(exam as any),
    questions: [], // Empty array - lazy load when needed
    questionCount: exam._count.questions,
  }));
}

/**
 * Get a single exam with all its questions
 * Use this when you need the full exam with questions (e.g., exam details page, taking exam)
 */
export async function getExamWithQuestionsAction(examId: string) {
  const exam = await prisma.exams.findUnique({
    where: { id: examId },
    include: {
      questions: {
        orderBy: { sortOrder: 'asc' }
      },
      colleges: {
        select: { id: true, name: true, code: true }
      }
    }
  });
  
  if (!exam) {
    throw new Error(`Exam not found: ${examId}`);
  }
  
  return serializeExam(exam);
}

export async function getExamByIdAction(id: string) {
  const exam = await prisma.exams.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: { sortOrder: 'asc' }
      },
      colleges: {
        select: { id: true, name: true, code: true }
      }
    }
  });
  return serializeExam(exam);
}

export async function createExamAction(data: any) {
  const { questions, questionIds, duration, durationMinutes, ...rest } = data;

  const cleanCollegeId = (!rest.collegeId || rest.collegeId === "GLOBAL" || rest.collegeId === "all" || rest.collegeId === "ALL" || rest.collegeId === "global" || rest.collegeId === "UNASSIGNED" || rest.collegeId === "unassigned") ? null : rest.collegeId;

  const id = rest.id || `exam-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const title = rest.title;
  const description = rest.description || null;
  const dur = durationMinutes || duration || 60;
  const totalMarks = rest.totalMarks ?? 0;
  const passingMarks = rest.passingMarks ?? null;
  const status = rest.status || "draft";
  const targets = rest.targets ? JSON.stringify(rest.targets) : null;
  const settings = rest.settings ? JSON.stringify(rest.settings) : null;
  const scheduledAt = rest.scheduledAt ? new Date(rest.scheduledAt) : null;
  const startTime = rest.startTime ? new Date(rest.startTime) : null;
  const endTime = rest.endTime ? new Date(rest.endTime) : null;
  const createdBy = rest.createdBy || null;
  const createdAt = rest.createdAt ? new Date(rest.createdAt) : new Date();
  const updatedAt = rest.updatedAt ? new Date(rest.updatedAt) : new Date();
  
  // Generate secure share token for exam link
  const { generateSecureShareToken } = await import('@/lib/utils/token-generator');
  const shareToken = rest.shareToken || generateSecureShareToken();

  try {
    const inserted = await prisma.exams.create({
      data: {
        id,
        title,
        ...(cleanCollegeId ? { collegeId: cleanCollegeId } : {}),
        description,
        durationMinutes: dur,
        totalMarks,
        passingMarks,
        status,
        shareToken,
        targets: rest.targets ?? undefined,
        settings: rest.settings ?? undefined,
        scheduledAt,
        startTime,
        endTime,
        createdBy,
        createdAt,
        updatedAt,
      } as any,
      select: { id: true }
    });

    if (Array.isArray(questions) && questions.length > 0) {
      await prisma.questions.createMany({
        data: questions.map((q: any, index: number) => ({
          id: q.id || `q-${inserted.id}-${index}-${Math.random().toString(36).substring(2, 6)}`,
          examId: inserted.id,
          text: q.text,
          type: q.type || "mcq",
          options: q.options || [],
          correctAnswer: q.correctAnswer ?? null,
          marks: q.marks ?? 1,
          explanation: q.explanation || null,
          aiExplanation: q.aiExplanation || null,
          subject: q.subject || null,
          topic: q.topic || null,
          difficulty: q.difficulty || null,
          sortOrder: q.sortOrder ?? index
        }))
      });
    }

    return inserted.id;
  } catch (err: any) {
    // If Turbopack SSR cached client has a relation validation quirk, execute directly via SQL
    await prisma.$executeRawUnsafe(
      `INSERT INTO exams (id, "collegeId", title, description, "durationMinutes", "totalMarks", "passingMarks", status, "shareToken", targets, settings, "scheduledAt", "startTime", "endTime", "createdBy", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         "collegeId" = EXCLUDED."collegeId",
         description = EXCLUDED.description,
         "durationMinutes" = EXCLUDED."durationMinutes",
         "totalMarks" = EXCLUDED."totalMarks",
         "passingMarks" = EXCLUDED."passingMarks",
         status = EXCLUDED.status,
         "shareToken" = EXCLUDED."shareToken",
         targets = EXCLUDED.targets,
         settings = EXCLUDED.settings,
         "scheduledAt" = EXCLUDED."scheduledAt",
         "startTime" = EXCLUDED."startTime",
         "endTime" = EXCLUDED."endTime",
         "updatedAt" = EXCLUDED."updatedAt"`,
      id,
      cleanCollegeId,
      title,
      description,
      dur,
      totalMarks,
      passingMarks,
      status,
      shareToken,
      targets,
      settings,
      scheduledAt,
      startTime,
      endTime,
      createdBy,
      createdAt,
      updatedAt
    );

    if (Array.isArray(questions) && questions.length > 0) {
      await prisma.questions.deleteMany({ where: { examId: id } }).catch(() => {});
      for (let index = 0; index < questions.length; index++) {
        const q = questions[index];
        const qId = q.id || `q-${id}-${index}-${Math.random().toString(36).substring(2, 6)}`;
        await prisma.$executeRawUnsafe(
          `INSERT INTO questions (id, "examId", text, type, options, "correctAnswer", marks, explanation, "aiExplanation", subject, topic, difficulty, "sortOrder", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10, $11, $12, $13, NOW())
           ON CONFLICT (id) DO NOTHING`,
          qId,
          id,
          q.text,
          q.type || "mcq",
          q.options || [],
          q.correctAnswer ? JSON.stringify(q.correctAnswer) : null,
          q.marks ?? 1,
          q.explanation || null,
          q.aiExplanation ? JSON.stringify(q.aiExplanation) : null,
          q.subject || null,
          q.topic || null,
          q.difficulty || null,
          q.sortOrder ?? index
        );
      }
    }

    return id;
  }
}

export async function updateExamAction(id: string, data: any) {
  const { questions, questionIds, duration, durationMinutes, ...rest } = data;

  const cleanCollegeId = (!rest.collegeId || rest.collegeId === "GLOBAL" || rest.collegeId === "all" || rest.collegeId === "ALL" || rest.collegeId === "global" || rest.collegeId === "UNASSIGNED" || rest.collegeId === "unassigned") ? null : rest.collegeId;

  const cleanData: any = {};
  if (rest.title !== undefined) cleanData.title = rest.title;
  if (rest.collegeId !== undefined) {
    cleanData.collegeId = cleanCollegeId;
  }
  if (rest.description !== undefined) cleanData.description = rest.description;
  if (durationMinutes !== undefined) cleanData.durationMinutes = durationMinutes;
  else if (duration !== undefined) cleanData.durationMinutes = duration;
  if (rest.totalMarks !== undefined) cleanData.totalMarks = rest.totalMarks;
  if (rest.passingMarks !== undefined) cleanData.passingMarks = rest.passingMarks;
  if (rest.status !== undefined) cleanData.status = rest.status;
  if (rest.targets !== undefined) cleanData.targets = rest.targets;
  if (rest.settings !== undefined) cleanData.settings = rest.settings;
  if (rest.scheduledAt !== undefined) cleanData.scheduledAt = rest.scheduledAt ? new Date(rest.scheduledAt) : null;
  if (rest.startTime !== undefined) cleanData.startTime = rest.startTime ? new Date(rest.startTime) : null;
  if (rest.endTime !== undefined) cleanData.endTime = rest.endTime ? new Date(rest.endTime) : null;
  if (rest.createdBy !== undefined) cleanData.createdBy = rest.createdBy;
  if (rest.updatedAt !== undefined) cleanData.updatedAt = new Date();
  if (rest.deletedAt !== undefined) cleanData.deletedAt = rest.deletedAt ? new Date(rest.deletedAt) : null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.exams.update({
        where: { id },
        data: cleanData
      });

      if (Array.isArray(questions)) {
        await tx.questions.deleteMany({ where: { examId: id } });
        if (questions.length > 0) {
          await tx.questions.createMany({
            data: questions.map((q: any, index: number) => ({
              id: q.id || `q-${id}-${index}-${Math.random().toString(36).substring(2, 6)}`,
              examId: id,
              text: q.text,
              type: q.type || "mcq",
              options: q.options || [],
              correctAnswer: q.correctAnswer ?? null,
              marks: q.marks ?? 1,
              explanation: q.explanation || null,
              aiExplanation: q.aiExplanation || null,
              subject: q.subject || null,
              topic: q.topic || null,
              difficulty: q.difficulty || null,
              sortOrder: q.sortOrder ?? index
            }))
          });
        }
      }
    });
  } catch (err: any) {
    // Direct SQL fallback if Prisma validation complains about relations
    await prisma.$executeRawUnsafe(
      `UPDATE exams SET
         title = COALESCE($1, title),
         "collegeId" = $2,
         description = COALESCE($3, description),
         "durationMinutes" = COALESCE($4, "durationMinutes"),
         "totalMarks" = COALESCE($5, "totalMarks"),
         "passingMarks" = $6,
         status = COALESCE($7, status),
         "scheduledAt" = $8,
         "startTime" = $9,
         "endTime" = $10,
         "updatedAt" = NOW()
       WHERE id = $11`,
      cleanData.title || null,
      cleanCollegeId,
      cleanData.description || null,
      cleanData.durationMinutes || null,
      cleanData.totalMarks || null,
      cleanData.passingMarks || null,
      cleanData.status || null,
      cleanData.scheduledAt || null,
      cleanData.startTime || null,
      cleanData.endTime || null,
      id
    );

    if (Array.isArray(questions)) {
      await prisma.questions.deleteMany({ where: { examId: id } }).catch(() => {});
      for (let index = 0; index < questions.length; index++) {
        const q = questions[index];
        const qId = q.id || `q-${id}-${index}-${Math.random().toString(36).substring(2, 6)}`;
        await prisma.$executeRawUnsafe(
          `INSERT INTO questions (id, "examId", text, type, options, "correctAnswer", marks, explanation, "aiExplanation", subject, topic, difficulty, "sortOrder", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10, $11, $12, $13, NOW())
           ON CONFLICT (id) DO NOTHING`,
          qId,
          id,
          q.text,
          q.type || "mcq",
          q.options || [],
          q.correctAnswer ? JSON.stringify(q.correctAnswer) : null,
          q.marks ?? 1,
          q.explanation || null,
          q.aiExplanation ? JSON.stringify(q.aiExplanation) : null,
          q.subject || null,
          q.topic || null,
          q.difficulty || null,
          q.sortOrder ?? index
        );
      }
    }
  }
}

export async function getResultsByExamAction(examId: string, collegeId?: string) {
  const whereClause: any = { examId };
  if (collegeId && collegeId !== "ALL" && collegeId !== "global") {
    whereClause.students = { collegeId };
  }
  
  const results = await prisma.exam_results.findMany({
    where: whereClause,
    include: {
      exams: { select: { title: true } },
      students: {
        select: {
          collegeId: true,
          users: { select: { displayName: true, email: true } }
        }
      }
    }
  });
  return serializeExamResults(results);
}

export async function getResultsByStudentAction(studentId: string) {
  let studentIds = [studentId];
  try {
    const student = await prisma.students.findFirst({
      where: {
        OR: [
          { id: studentId },
          ...(isUUID(studentId) ? [{ authId: studentId }] : [])
        ]
      },
      select: { id: true }
    });
    if (student && student.id !== studentId) {
      studentIds.push(student.id);
    }
  } catch {}

  const results = await prisma.exam_results.findMany({
    where: { studentId: { in: studentIds } },
    include: {
      exams: { select: { title: true } },
      students: {
        select: {
          collegeId: true,
          users: { select: { displayName: true, email: true } }
        }
      }
    }
  });
  return serializeExamResults(results);
}

export async function getStudentAttemptsAction(studentId?: string) {
  if (studentId) {
    return await getResultsByStudentAction(studentId);
  }
  const results = await prisma.exam_results.findMany({
    include: {
      exams: { select: { title: true } },
      students: {
        select: {
          collegeId: true,
          users: { select: { displayName: true, email: true } }
        }
      }
    }
  });
  return serializeExamResults(results);
}

export async function getStudentAttemptsForCurrentUserAction(uid: string) {
  if (!uid) return [];
  return await getResultsByStudentAction(uid);
}

export async function submitExamResultAction(data: any) {
  let resolvedStudentId = data.studentId;
  try {
    const student = await prisma.students.findFirst({
      where: {
        OR: [
          { id: data.studentId },
          ...(isUUID(data.studentId) ? [{ authId: data.studentId }] : []),
          ...(data.studentEmail ? [{ users: { email: { equals: data.studentEmail, mode: 'insensitive' as const } } }] : [])
        ]
      },
      select: { id: true }
    });
    if (student) {
      resolvedStudentId = student.id;
    }
  } catch (lookupErr) {
    console.warn("Could not look up student by authId/email:", lookupErr);
  }

  // Whitelist only fields that exist in the Prisma `exam_results` model
  const cleanData: any = {
    examId: data.examId,
    studentId: resolvedStudentId,
    score: typeof data.score === 'number' ? Math.round(data.score) : 0,
    totalMarks: typeof data.totalMarks === 'number' ? Math.round(data.totalMarks) : 0,
    status: data.status || "submitted",
  };
  if (data.id) cleanData.id = data.id;
  if (data.percentage !== undefined && data.percentage !== null) cleanData.percentage = data.percentage;
  if (data.passed !== undefined) cleanData.passed = Boolean(data.passed);
  if (data.correctCount !== undefined && data.correctCount !== null) cleanData.correctCount = data.correctCount;
  if (data.incorrectCount !== undefined && data.incorrectCount !== null) cleanData.incorrectCount = data.incorrectCount;
  if (data.answers !== undefined) cleanData.answers = data.answers;
  if (data.aiSummary !== undefined) cleanData.aiSummary = data.aiSummary;
  if (data.timeTakenMinutes !== undefined && data.timeTakenMinutes !== null) cleanData.timeTakenMinutes = Math.max(0, data.timeTakenMinutes);
  if (data.startTime !== undefined && data.startTime !== null) cleanData.startTime = new Date(data.startTime);
  if (data.submittedAt !== undefined && data.submittedAt !== null) cleanData.submittedAt = new Date(data.submittedAt);
  if (data.createdAt !== undefined && data.createdAt !== null) cleanData.createdAt = new Date(data.createdAt);
  if (data.updatedAt !== undefined && data.updatedAt !== null) cleanData.updatedAt = new Date(data.updatedAt);

  const inserted = await prisma.exam_results.create({
    data: cleanData,
    select: { id: true }
  });
  return inserted.id;
}

export async function deleteResultByIdAction(id: string) {
  await prisma.exam_results.delete({
    where: { id }
  });
}
