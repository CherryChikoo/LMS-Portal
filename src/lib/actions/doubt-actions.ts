"use server";

import { prisma } from '@/lib/prisma';

export async function getAllDoubtsAction() {
  return await prisma.doubts.findMany();
}

export async function getDoubtsByStudentAction(studentId: string) {
  return await prisma.doubts.findMany({
    where: { studentId }
  });
}

export async function getDoubtByIdAction(id: string) {
  return await prisma.doubts.findUnique({
    where: { id },
    include: { doubt_replies: true }
  });
}

export async function createDoubtAction(data: any) {
  const inserted = await prisma.doubts.create({
    data,
    select: { id: true }
  });
  return inserted.id;
}

export async function replyToDoubtAction(id: string, replyText: string, author: string, authorId: string) {
  await prisma.$transaction(async (tx: any) => {
    // 1. Insert reply
    const replyId = `reply-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    await tx.doubt_replies.create({
      data: {
        id: replyId,
        doubtId: id,
        authorId: authorId, // Prisma requires authorId as string
        role: "trainer",
        text: replyText,
        createdAt: new Date()
      }
    });

    // 2. Update doubt status
    await tx.doubts.update({
      where: { id },
      data: {
        status: "resolved",
        updatedAt: new Date()
      }
    });
  });
}

export async function deleteDoubtAction(id: string) {
  await prisma.doubts.delete({
    where: { id }
  });
}

export async function updateDoubtAction(id: string, data: any) {
  // Exclude non-existent Prisma fields that might have been passed
  const { reply, repliedBy, replies, studentName, resourceTitle, ...cleanData } = data;
  
  if (Object.keys(cleanData).length > 0) {
    await prisma.doubts.update({
      where: { id },
      data: cleanData
    });
  }
}
