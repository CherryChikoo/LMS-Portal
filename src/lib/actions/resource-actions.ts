"use server";

import { prisma } from '@/lib/prisma';

export async function getAllResourcesAction() {
  return await prisma.resources.findMany();
}

export async function getResourceByIdAction(id: string) {
  return await prisma.resources.findUnique({
    where: { id }
  });
}

export async function createResourceAction(data: any) {
  // Whitelist only fields that exist in the Prisma `resources` model
  const cleanCollegeId = (!data.collegeId || data.collegeId === "GLOBAL" || data.collegeId === "all" || data.collegeId === "ALL" || data.collegeId === "global" || data.collegeId === "UNASSIGNED" || data.collegeId === "unassigned") ? null : data.collegeId;
  const cleanData: any = {
    title: data.title,
    type: data.type,
    url: data.url,
    collegeId: cleanCollegeId,
  };
  if (data.id) cleanData.id = data.id;
  if (data.description !== undefined) cleanData.description = data.description;
  if (data.category !== undefined) cleanData.category = data.category;
  if (data.tags !== undefined) cleanData.tags = data.tags;
  if (data.targets !== undefined) cleanData.targets = data.targets;
  if (data.createdBy !== undefined) cleanData.createdBy = data.createdBy;
  if (data.createdAt !== undefined) cleanData.createdAt = data.createdAt;
  if (data.updatedAt !== undefined) cleanData.updatedAt = data.updatedAt;

  const inserted = await prisma.resources.create({
    data: cleanData,
    select: { id: true }
  });
  return inserted.id;
}

export async function updateResourceAction(id: string, data: any) {
  // Whitelist only fields that exist in the Prisma `resources` model
  const cleanData: any = {};
  if (data.title !== undefined) cleanData.title = data.title;
  if (data.type !== undefined) cleanData.type = data.type;
  if (data.url !== undefined) cleanData.url = data.url;
  if (data.collegeId !== undefined) {
    cleanData.collegeId = (!data.collegeId || data.collegeId === "GLOBAL" || data.collegeId === "all" || data.collegeId === "ALL" || data.collegeId === "global") ? null : data.collegeId;
  }
  if (data.description !== undefined) cleanData.description = data.description;
  if (data.category !== undefined) cleanData.category = data.category;
  if (data.tags !== undefined) cleanData.tags = data.tags;
  if (data.targets !== undefined) cleanData.targets = data.targets;
  if (data.createdBy !== undefined) cleanData.createdBy = data.createdBy;
  if (data.updatedAt !== undefined) cleanData.updatedAt = data.updatedAt;

  await prisma.resources.update({
    where: { id },
    data: cleanData
  });
}
