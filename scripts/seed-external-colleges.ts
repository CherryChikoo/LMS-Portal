/**
 * Script to seed 3 external colleges with 200 students total
 * Run with: npx ts-node --project tsconfig.json scripts/seed-external-colleges.ts
 */

import { prisma } from "../src/lib/prisma";

// External college configurations
const EXTERNAL_COLLEGES = [
  {
    name: "Global Tech University",
    departments: ["Computer Science", "Information Technology", "Electronics"],
    studentCount: 70,
  },
  {
    name: "International Business Institute",
    departments: ["Business Administration", "Marketing", "Finance"],
    studentCount: 65,
  },
  {
    name: "Advanced Science Academy",
    departments: ["Physics", "Chemistry", "Mathematics", "Biology"],
    studentCount: 65,
  },
];

const SECTIONS = ["A", "B", "C", "D"];
const ACADEMIC_YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];

// Generate random student data
function generateStudentName(index: number): string {
  const firstNames = [
    "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Sai", "Arnav", "Ayaan",
    "Krishna", "Ishaan", "Shaurya", "Atharva", "Advik", "Pranav", "Reyansh",
    "Aadhya", "Ananya", "Pari", "Anika", "Navya", "Diya", "Myra", "Sara",
    "Anaya", "Ira", "Prisha", "Kavya", "Riya", "Saanvi", "Kiara", "Aarohi",
    "Tara", "Shanaya", "Mahika", "Avni", "Zara", "Advika", "Ishita", "Nisha",
  ];
  
  const lastNames = [
    "Sharma", "Patel", "Kumar", "Singh", "Gupta", "Reddy", "Nair", "Verma",
    "Rao", "Joshi", "Mehta", "Desai", "Iyer", "Agarwal", "Choudhury", "Das",
    "Bose", "Shah", "Kulkarni", "Pillai", "Menon", "Saxena", "Pandey", "Mishra",
  ];
  
  const firstName = firstNames[index % firstNames.length];
  const lastName = lastNames[Math.floor(index / firstNames.length) % lastNames.length];
  
  return `${firstName} ${lastName}`;
}

function generateEmail(name: string, college: string, index: number): string {
  const collegeSuffix = college
    .toLowerCase()
    .split(" ")
    .map(w => w[0])
    .join("");
  
  const namePart = name
    .toLowerCase()
    .replace(/\s+/g, ".");
  
  return `${namePart}.${index}@student.${collegeSuffix}.edu`;
}

function generateRollNumber(collegeIndex: number, studentIndex: number): string {
  const year = new Date().getFullYear().toString().slice(-2);
  const collegeCode = String.fromCharCode(65 + collegeIndex); // A, B, C
  const rollNum = String(studentIndex + 1).padStart(4, "0");
  return `ROLL-${year}${collegeCode}${rollNum}`;
}

async function seedExternalColleges() {
  console.log("🌱 Starting to seed external colleges and students...\n");

  let totalStudentsCreated = 0;

  for (let collegeIndex = 0; collegeIndex < EXTERNAL_COLLEGES.length; collegeIndex++) {
    const college = EXTERNAL_COLLEGES[collegeIndex];
    
    console.log(`📚 Creating students for: ${college.name}`);
    console.log(`   Target: ${college.studentCount} students`);
    
    const studentsPerDept = Math.ceil(college.studentCount / college.departments.length);
    let collegeStudentCount = 0;

    for (let deptIndex = 0; deptIndex < college.departments.length; deptIndex++) {
      const department = college.departments[deptIndex];
      
      // Calculate how many students for this department
      const remaining = college.studentCount - collegeStudentCount;
      const studentsForDept = Math.min(studentsPerDept, remaining);
      
      if (studentsForDept <= 0) break;

      for (let studentIndex = 0; studentIndex < studentsForDept; studentIndex++) {
        const globalStudentIndex = totalStudentsCreated;
        const name = generateStudentName(globalStudentIndex);
        const email = generateEmail(name, college.name, globalStudentIndex);
        const rollNumber = generateRollNumber(collegeIndex, collegeStudentCount);
        const section = SECTIONS[studentIndex % SECTIONS.length];
        const academicYear = ACADEMIC_YEARS[Math.floor(studentIndex / SECTIONS.length) % ACADEMIC_YEARS.length];

        try {
          // Check if student already exists
          const existing = await prisma.students.findFirst({
            where: { email: email },
          });

          if (existing) {
            console.log(`   ⏭️  Skipped: ${email} (already exists)`);
            continue;
          }

          // Create student profile
          await prisma.students.create({
            data: {
              email: email,
              collegeName: college.name,
              department: department,
              academicYear: academicYear,
              section: section,
              rollNumber: rollNumber,
              status: "active",
              createdAt: new Date(),
              updatedAt: new Date(),
              users: {
                create: {
                  email: email,
                  displayName: name,
                  role: "student",
                  status: "active",
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              },
            },
          });

          collegeStudentCount++;
          totalStudentsCreated++;

          if (totalStudentsCreated % 10 === 0) {
            process.stdout.write(`   ✓ Created ${totalStudentsCreated} students...\r`);
          }
        } catch (error: any) {
          console.error(`   ❌ Failed to create student ${email}:`, error.message);
        }
      }
    }

    console.log(`\n   ✅ Completed: ${collegeStudentCount} students created for ${college.name}\n`);
  }

  console.log(`\n🎉 Seeding complete! Total students created: ${totalStudentsCreated}\n`);
  console.log("📊 Distribution:");
  EXTERNAL_COLLEGES.forEach((college) => {
    console.log(`   - ${college.name}: ${college.studentCount} students`);
  });
}

// Run the seed function
seedExternalColleges()
  .catch((error) => {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
