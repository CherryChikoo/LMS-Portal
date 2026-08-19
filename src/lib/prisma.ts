import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient; pool: Pool };

let prisma: PrismaClient;

if (globalForPrisma.prisma) {
  prisma = globalForPrisma.prisma;
} else {
  // 🚀 SUPABASE CONNECTION POOLER (port 6543) for queries
  // Use DATABASE_URL with transaction pooler for optimal performance
  const connectionString = process.env.DATABASE_URL;
  
  const pool = new Pool({
    connectionString,
    max: 30, // Increased to 30 for 50k+ student queries
    min: 5, // Minimum 5 connections always ready
    idleTimeoutMillis: 60000, // 60s idle timeout
    connectionTimeoutMillis: 10000, // 10s connection timeout
    statement_timeout: 60000, // 60s query timeout for large datasets
    query_timeout: 60000, // 60s query timeout
    allowExitOnIdle: false, // Keep pool alive
  });
  
  const adapter = new PrismaPg(pool);
  
  prisma = new PrismaClient({ 
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
  
  globalForPrisma.pool = pool;
  globalForPrisma.prisma = prisma;
}

export { prisma };

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
