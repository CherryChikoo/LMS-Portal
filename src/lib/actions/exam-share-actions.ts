/**
 * Server Actions for Exam Share Link System
 * 
 * Handles:
 * - Token generation for existing exams
 * - Token validation
 * - Exam eligibility checks
 */

'use server';

import { prisma } from '@/lib/prisma';
import { generateSecureShareToken, isValidShareTokenFormat } from '@/lib/utils/token-generator';
import { getCurrentUser } from '@/lib/utils/auth-session';
import type { Exam, Student } from '@/types';

/**
 * Generate share token for an existing exam (idempotent)
 * 
 * @param examId - The exam ID to generate token for
 * @returns The generated or existing token
 */
export async function generateExamShareTokenAction(examId: string): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    // Check if exam already has a token
    const exam = await prisma.exams.findUnique({
      where: { id: examId },
      select: { id: true, shareToken: true }
    });

    if (!exam) {
      return { success: false, error: 'Exam not found' };
    }

    // If token exists, return it
    if (exam.shareToken) {
      return { success: true, token: exam.shareToken };
    }

    // Generate new token with retry logic (in case of collision)
    let token: string;
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      token = generateSecureShareToken();
      
      try {
        // Try to update with unique constraint
        await prisma.exams.update({
          where: { id: examId },
          data: { shareToken: token }
        });
        
        return { success: true, token };
      } catch (err: any) {
        // If unique constraint violation, try again
        if (err.code === 'P2002') {
          attempts++;
          continue;
        }
        throw err;
      }
    }

    return { success: false, error: 'Failed to generate unique token after multiple attempts' };
  } catch (error: any) {
    console.error('[generateExamShareTokenAction] Error:', error);
    return { success: false, error: error.message || 'Failed to generate share token' };
  }
}

/**
 * Batch generate tokens for all exams without one
 * 
 * @returns Count of tokens generated
 */
export async function generateMissingShareTokensAction(): Promise<{ success: boolean; count?: number; error?: string }> {
  try {
    // Get all exams without shareToken
    const examsWithoutToken = await prisma.exams.findMany({
      where: { 
        shareToken: null,
        deletedAt: null 
      },
      select: { id: true }
    });

    if (examsWithoutToken.length === 0) {
      return { success: true, count: 0 };
    }

    let successCount = 0;

    // Generate tokens for each exam
    for (const exam of examsWithoutToken) {
      const result = await generateExamShareTokenAction(exam.id);
      if (result.success) {
        successCount++;
      }
    }

    return { success: true, count: successCount };
  } catch (error: any) {
    console.error('[generateMissingShareTokensAction] Error:', error);
    return { success: false, error: error.message || 'Failed to generate missing tokens' };
  }
}

/**
 * Get exam by share token (server-side validation)
 * 
 * @param token - The share token
 * @returns Exam data if valid
 */
export async function getExamByShareTokenAction(token: string): Promise<{ success: boolean; exam?: any; error?: string }> {
  try {
    // Validate token format
    if (!isValidShareTokenFormat(token)) {
      return { success: false, error: 'Invalid token format' };
    }

    // Find exam by token
    const exam = await prisma.exams.findUnique({
      where: { shareToken: token },
      include: {
        questions: {
          orderBy: { sortOrder: 'asc' }
        },
        colleges: {
          select: { id: true, name: true }
        }
      }
    });

    if (!exam) {
      return { success: false, error: 'Exam not found' };
    }

    // Check if exam is deleted
    if (exam.deletedAt) {
      return { success: false, error: 'This exam is no longer available' };
    }

    // Return exam data (authorization happens in route handler)
    return { 
      success: true, 
      exam: {
        ...exam,
        targets: exam.targets as any,
        settings: exam.settings as any
      }
    };
  } catch (error: any) {
    console.error('[getExamByShareTokenAction] Error:', error);
    return { success: false, error: 'Failed to retrieve exam' };
  }
}

/**
 * Check if a student is eligible for an exam (server-side)
 * 
 * @param examId - The exam ID
 * @param studentId - The student ID
 * @returns Eligibility status with reason
 */
export async function checkExamEligibilityAction(
  examId: string, 
  studentId: string
): Promise<{ 
  success: boolean; 
  eligible?: boolean; 
  reason?: string; 
  error?: string 
}> {
  try {
    // Get exam with targets
    const exam = await prisma.exams.findUnique({
      where: { id: examId },
      select: {
        id: true,
        status: true,
        collegeId: true,
        targets: true,
        startTime: true,
        endTime: true,
        deletedAt: true
      }
    });

    if (!exam) {
      return { success: false, error: 'Exam not found' };
    }

    // Check if deleted
    if (exam.deletedAt) {
      return { success: true, eligible: false, reason: 'Exam is no longer available' };
    }

    // Check exam status
    if (exam.status === 'draft') {
      return { success: true, eligible: false, reason: 'Exam is not yet published' };
    }

    // Check if scheduled but not started
    if (exam.status === 'scheduled' && exam.startTime) {
      const now = new Date();
      const start = new Date(exam.startTime);
      if (now < start) {
        return { success: true, eligible: false, reason: 'Exam has not started yet' };
      }
    }

    // Check if expired
    if (exam.status === 'expired' || exam.status === 'completed') {
      return { success: true, eligible: false, reason: 'Exam has expired' };
    }

    if (exam.endTime) {
      const now = new Date();
      const end = new Date(exam.endTime);
      if (now > end) {
        return { success: true, eligible: false, reason: 'Exam deadline has passed' };
      }
    }

    // Get student details
    const student = await prisma.students.findUnique({
      where: { id: studentId },
      include: {
        student_batches: {
          include: {
            batches: true
          }
        },
        users: {
          select: { email: true, displayName: true, role: true }
        }
      }
    });

    if (!student) {
      return { success: false, error: 'Student not found' };
    }

    // Check if exam is global
    const targets = exam.targets as any;
    
    if (!targets || targets.length === 0) {
      // No targets = global exam, everyone eligible
      return { success: true, eligible: true };
    }

    // Check each target for eligibility
    for (const target of targets) {
      // Global target
      if (target.level === 'institution' && !target.collegeId) {
        return { success: true, eligible: true };
      }

      // College-level target
      if (target.collegeId) {
        if (target.collegeId === 'global' || target.collegeId === 'GLOBAL' || target.collegeId === 'all') {
          return { success: true, eligible: true };
        }

        if (student.collegeId === target.collegeId) {
          // Check department if specified
          if (target.department && target.department !== 'all' && target.department !== student.department) {
            continue;
          }

          // Check academic year if specified
          if (target.academicYear && target.academicYear !== 'all' && target.academicYear !== student.academicYear) {
            continue;
          }

          // Check section if specified
          if (target.section && target.section !== 'all' && target.section !== student.section) {
            continue;
          }

          return { success: true, eligible: true };
        }
      }

      // Batch-level target
      if (target.batchId) {
        const studentBatchIds = student.student_batches.map(sb => sb.batchId);
        if (studentBatchIds.includes(target.batchId)) {
          return { success: true, eligible: true };
        }
      }
    }

    // Not eligible
    return { 
      success: true, 
      eligible: false, 
      reason: 'This exam is not assigned to you. Please contact your administrator.' 
    };
  } catch (error: any) {
    console.error('[checkExamEligibilityAction] Error:', error);
    return { success: false, error: 'Failed to check eligibility' };
  }
}
