/**
 * Script to create 200 external students via API (simulating self-registration)
 * These students will automatically create 3 external colleges
 * Run with: node scripts/create-external-students.mjs
 */

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
function generateStudentName(index) {
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

function generateEmail(name, college, index) {
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

function generateRollNumber(collegeIndex, studentIndex) {
  const year = new Date().getFullYear().toString().slice(-2);
  const collegeCode = String.fromCharCode(65 + collegeIndex); // A, B, C
  const rollNum = String(studentIndex + 1).padStart(4, "0");
  return `ROLL-${year}${collegeCode}${rollNum}`;
}

async function createExternalStudents() {
  console.log("🌱 Starting to create external students...\n");
  console.log("📝 NOTE: This creates students with external college names.");
  console.log("📝 External colleges will appear automatically in the External Institutions tab.\n");

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
  
  // You'll need to get an admin auth token
  console.log("⚠️  SETUP REQUIRED:");
  console.log("1. Log in to your LMS as an admin");
  console.log("2. Open browser DevTools > Application > Local Storage");
  console.log("3. Find your session token");
  console.log("4. Set ADMIN_TOKEN environment variable");
  console.log("5. Or manually create students via the UI using the Import CSV feature\n");
  
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
  
  if (!ADMIN_TOKEN) {
    console.log("❌ No ADMIN_TOKEN found. Please see instructions above.\n");
    console.log("💡 ALTERNATIVE: Use the CSV file instead!");
    console.log("   1. Go to /students page in your LMS");
    console.log("   2. Click 'Import Students'");
    console.log("   3. Upload: lms-portal/external-colleges-200-students.csv\n");
    return;
  }

  let totalStudentsCreated = 0;

  for (let collegeIndex = 0; collegeIndex < EXTERNAL_COLLEGES.length; collegeIndex++) {
    const college = EXTERNAL_COLLEGES[collegeIndex];
    
    console.log(`📚 Creating students for: ${college.name}`);
    console.log(`   Target: ${college.studentCount} students`);
    
    const studentsPerDept = Math.ceil(college.studentCount / college.departments.length);
    let collegeStudentCount = 0;

    for (let deptIndex = 0; deptIndex < college.departments.length; deptIndex++) {
      const department = college.departments[deptIndex];
      
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
          const response = await fetch(`${API_BASE_URL}/api/admin/create-student`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${ADMIN_TOKEN}`,
            },
            body: JSON.stringify({
              name,
              email,
              collegeName: college.name, // This creates the external college!
              department,
              academicYear,
              section,
              rollNumber,
            }),
          });

          if (response.ok) {
            collegeStudentCount++;
            totalStudentsCreated++;

            if (totalStudentsCreated % 10 === 0) {
              process.stdout.write(`   ✓ Created ${totalStudentsCreated} students...\r`);
            }
          } else {
            const error = await response.text();
            if (error.includes("already exists") || error.includes("unique")) {
              // Skip duplicates silently
            } else {
              console.log(`   ⚠️  Failed: ${email} - ${error}`);
            }
          }
        } catch (error) {
          console.error(`   ❌ Error creating ${email}:`, error.message);
        }

        // Rate limiting: small delay between requests
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    console.log(`\n   ✅ Completed: ${collegeStudentCount} students for ${college.name}\n`);
  }

  console.log(`\n🎉 Creation complete! Total students: ${totalStudentsCreated}`);
  console.log("\n📊 External Colleges Created:");
  EXTERNAL_COLLEGES.forEach((college) => {
    console.log(`   - ${college.name}: ${college.studentCount} students`);
  });
  console.log("\n💡 Go to /colleges page and click 'External Institutions' tab to see them!");
}

createExternalStudents().catch(console.error);
