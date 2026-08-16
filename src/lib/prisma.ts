import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient; pool: Pool };

let prisma: PrismaClient;

if (globalForPrisma.prisma) {
  prisma = globalForPrisma.prisma;
} else {
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({
    connectionString,
    max: 3, // Allow 3 connections per instance (was 2, too tight for concurrent queries)
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000, // 15s timeout — Supabase cold starts can take 5-10s
  });
  const adapter = new PrismaPg(pool);
  prisma = new PrismaClient({ adapter });
  globalForPrisma.pool = pool;
  globalForPrisma.prisma = prisma;
}

export { prisma };

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
