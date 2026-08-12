import { isAssignedToStudent } from "./src/lib/services/assignment-engine";

const target = {
  type: "composite",
  ids: ["composite"],
  collegeId: "stanforduniversity",
  collegeName: "stanford university"
};

const student = {
  id: "uid123",
  name: "John",
  email: "j@j.com",
  collegeId: "stanforduniversity",
  collegeName: "Stanford University",
  department: "Computer Science & Engineering",
  academicYear: "1st Year",
  section: "A",
  status: "active"
};

console.log("Match:", isAssignedToStudent([target], student as any));
