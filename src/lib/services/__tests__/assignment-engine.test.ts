import { isAssignedToStudent } from "../assignment-engine";
import type { Student, AssignmentTarget } from "@/types";
import * as assert from "assert";

/**
 * Reusable automated test suite for Exam Assignment Logic.
 * Run via: npx tsx src/lib/services/__tests__/assignment-engine.test.ts
 */

const mockStudent: Student = {
  id: "stud-123",
  name: "John Doe",
  email: "john@example.com",
  collegeId: "col-abc",
  collegeName: "ABC College",
  department: "Computer Science",
  academicYear: "2nd Year",
  semester: 3,
  section: "A",
  rollNumber: "ROLL-001",
  batchIds: ["batch-alpha", "batch-beta"],
  enrollmentType: "manual",
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

function runTests() {
  console.log("Running Assignment Engine Tests...");
  let passed = 0;
  let failed = 0;

  function expectMatch(name: string, targets: AssignmentTarget[] | undefined, expected: boolean) {
    try {
      const result = isAssignedToStudent(targets, mockStudent);
      assert.strictEqual(result, expected);
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ FAIL: ${name} - Expected ${expected}`);
      failed++;
    }
  }

  // Scenarios:
  expectMatch("No targets (undefined) defaults to public", undefined, true);
  expectMatch("Empty targets array defaults to public", [], true);

  expectMatch("Individual Student Match (ID)", [{ type: "students", ids: ["stud-123"] }], true);
  expectMatch("Individual Student Match (Email)", [{ type: "students", ids: ["john@example.com"] }], true);
  expectMatch("Individual Student Mismatch", [{ type: "students", ids: ["stud-456"] }], false);

  expectMatch("Batch Match (ID)", [{ type: "batch", ids: ["batch-alpha"] }], true);
  expectMatch("Batch Match (Name fallback)", [{ type: "batch", ids: [], names: ["batch-beta"] }], true);
  expectMatch("Batch Mismatch", [{ type: "batch", ids: ["batch-gamma"] }], false);

  expectMatch("Section Match", [{ type: "section", ids: ["a"] }], true);
  expectMatch("Section Mismatch", [{ type: "section", ids: ["b"] }], false);

  expectMatch("Academic Year Match", [{ type: "year", ids: ["2nd year"] }], true);
  expectMatch("Academic Year Mismatch", [{ type: "year", ids: ["1st year"] }], false);

  expectMatch("Department Match", [{ type: "department", ids: ["computer science"] }], true);
  expectMatch("Department Mismatch", [{ type: "department", ids: ["mechanical"] }], false);

  expectMatch("College Match", [{ type: "college", ids: ["col-abc"] }], true);
  expectMatch("College Mismatch", [{ type: "college", ids: ["col-xyz"] }], false);

  expectMatch("Composite Match (AND logic - all match)", [
    { type: "composite", ids: [], collegeId: "col-abc", department: "Computer Science", academicYear: "2nd Year" }
  ], true);

  expectMatch("Composite Mismatch (AND logic - one fails)", [
    { type: "composite", ids: [], collegeId: "col-abc", department: "Computer Science", academicYear: "3rd Year" }
  ], false);

  expectMatch("Mixed Array (OR logic - one passes)", [
    { type: "college", ids: ["col-xyz"] }, // Fails
    { type: "batch", ids: ["batch-beta"] } // Passes
  ], true);

  expectMatch("Mixed Array (OR logic - all fail)", [
    { type: "college", ids: ["col-xyz"] },
    { type: "section", ids: ["b"] }
  ], false);

  console.log(`\nTest Summary: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
