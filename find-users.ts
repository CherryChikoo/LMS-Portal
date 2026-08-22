import { prisma } from './src/lib/prisma';

async function main() {
  const globalAdmin = await prisma.users.findFirst({
    where: { role: 'main_admin' },
  });
  
  const collegeAdmin = await prisma.users.findFirst({
    where: { role: 'college_admin' },
  });
  
  const student = await prisma.users.findFirst({
    where: { role: 'student' },
  });

  console.log('Global Admin Email:', globalAdmin?.email);
  console.log('College Admin Email:', collegeAdmin?.email);
  console.log('Student Email:', student?.email);
}

main().catch(console.error).finally(() => process.exit(0));
