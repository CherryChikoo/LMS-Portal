import { filterExamsForStudent } from "./src/lib/services/exam-service";
import { isAssignedToStudent } from "./src/lib/services/assignment-engine";

const student = {
  id: "uid123",
  name: "John",
  email: "j@j.com",
  collegeId: "stanforduniversity",
  collegeName: "Stanford University",
  department: "Computer Science & Engineering",
  academicYear: "1st Year",
  section: "A",
  status: "active",
  createdAt: { seconds: 1720000000, nanoseconds: 0 } // student created at 1720000000
};

const exam = {
  id: "exam1",
  title: "Test Exam",
  targets: [{
    type: "composite",
    ids: ["composite"],
    collegeId: "stanforduniversity",
    collegeName: "stanford university"
  }],
  createdAt: { seconds: 1720000500, nanoseconds: 0 }, // exam created AFTER student
  updatedAt: { seconds: 1720000500, nanoseconds: 0 }
};

const exam2 = {
  id: "exam2",
  title: "Old Exam",
  targets: [{
    type: "composite",
    ids: ["composite"],
    collegeId: "stanforduniversity"
  }],
  createdAt: { seconds: 1710000000, nanoseconds: 0 }, // exam created BEFORE student
  updatedAt: { seconds: 1710000000, nanoseconds: 0 }
};

console.log("Exam 1 (Assigned After):", filterExamsForStudent([exam] as any, student as any).length > 0);
console.log("Exam 2 (Assigned Before):", filterExamsForStudent([exam2] as any, student as any).length > 0);
