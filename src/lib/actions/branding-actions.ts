"use server";

import { prisma } from '@/lib/prisma';

export async function getCompanyBrandingAction() {
  return await prisma.settings.findUnique({
    where: { id: 'branding' }
  });
}

export async function getCompanyBrandingLightAction() {
  return await prisma.settings.findUnique({
    where: { id: 'branding' },
    select: { companyName: true, companySubtitle: true }
  });
}

export async function updateCompanyBrandingAction(data: any) {
  const { companyName, companySubtitle, logoBase64 } = data;
  await prisma.settings.upsert({
    where: { id: 'branding' },
    update: { companyName, companySubtitle, logoBase64, updatedAt: new Date() },
    create: { id: 'branding', companyName, companySubtitle, logoBase64, updatedAt: new Date() }
  });
}
