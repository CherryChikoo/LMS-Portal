const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const globalAdmin = await prisma.user_roles.findFirst({
    where: { role: 'main_admin' },
    select: { user_id: true }
  });
  
  const collegeAdmin = await prisma.user_roles.findFirst({
    where: { role: 'college_admin' },
    select: { user_id: true }
  });
  
  const studentRole = await prisma.user_roles.findFirst({
    where: { role: 'student' },
    select: { user_id: true }
  });

  const users = await prisma.users.findMany({
    where: {
      id: {
        in: [globalAdmin.user_id, collegeAdmin.user_id, studentRole.user_id]
      }
    }
  });

  console.log('Global Admin Email:', users.find(u => u.id === globalAdmin.user_id)?.email);
  console.log('College Admin Email:', users.find(u => u.id === collegeAdmin.user_id)?.email);
  console.log('Student Email:', users.find(u => u.id === studentRole.user_id)?.email);
}

main().catch(console.error).finally(() => prisma.$disconnect());
