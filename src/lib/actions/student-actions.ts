"use server";

import { prisma } from '@/lib/prisma';
import type { Student } from "@/types";

// ============================================================================
// PAGINATED STUDENTS FETCHING (50K SCALE)
// ============================================================================

export async function getStudentsPaginatedAction({
  page = 1,
  pageSize = 100,
  searchQuery,
  collegeId,
  department,
  academicYear,
  section,
  status,
  addedFilter,
  userRole,
  userCollegeId,
}: {
  page?: number;
  pageSize?: number;
  searchQuery?: string;
  collegeId?: string;
  department?: string;
  academicYear?: string;
  section?: string;
  status?: string;
  addedFilter?: string;
  userRole?: string;
  userCollegeId?: string;
}) {
  try {
    // Build where clause
    const where: any = {};

    // Role-based scoping (STRICT FILTERING FOR COLLEGE ADMINS)
    if (userRole && (userRole.toLowerCase() === "college_admin" || userRole.toLowerCase() === "college")) {
      if (!userCollegeId) {
        throw new Error("Unauthorized: College Admin must have an assigned college ID");
      }
      where.collegeId = userCollegeId;
      console.log('[GET_STUDENTS_PAGINATED] College admin filter applied:', { userRole, userCollegeId });
    }

    // Filter by college
    if (collegeId && collegeId !== "ALL" && collegeId !== "GLOBAL" && collegeId !== "") {
      if (collegeId === "UNASSIGNED") {
        // Filter for students with NULL collegeId
        where.collegeId = null;
      } else {
        where.collegeId = collegeId;
      }
    }

    // Filter by department (case-insensitive exact match)
    if (department && department !== "ALL" && department !== "") {
      where.department = { equals: department, mode: 'insensitive' };
    }

    // Filter by academic year (case-insensitive exact match)
    if (academicYear && academicYear !== "ALL" && academicYear !== "") {
      where.academicYear = { equals: academicYear, mode: 'insensitive' };
    }

    // Filter by section (case-insensitive exact match)
    if (section && section !== "ALL" && section !== "") {
      where.section = { equals: section, mode: 'insensitive' };
    }

    // Search query (name, email, roll number, enrollment number)
    if (searchQuery && searchQuery.trim()) {
      const searchTerm = searchQuery.trim();
      where.OR = [
        { users: { displayName: { contains: searchTerm, mode: 'insensitive' } } },
        { users: { email: { contains: searchTerm, mode: 'insensitive' } } },
        { rollNumber: { contains: searchTerm, mode: 'insensitive' } },
        { enrollmentNo: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    // Status filter (active/restricted from users table)
    if (status && status !== "ALL" && status !== "") {
      where.users = {
        ...where.users,
        status: status, // Pass the status directly: "active" or "restricted"
      };
    }

    // Added filter
    if (addedFilter && addedFilter !== "ALL" && addedFilter !== "") {
      if (addedFilter === "Last 24 Hours") {
        where.createdAt = { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
      } else if (addedFilter === "Last 7 Days") {
        where.createdAt = { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
      } else if (addedFilter === "CSV Uploads") {
        where.enrollmentType = "csv";
      } else if (addedFilter === "Manual Entry") {
        where.enrollmentType = "manual";
      }
    }

    // Calculate pagination
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    // Execute queries in parallel
    const [students, totalCount] = await Promise.all([
      prisma.students.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          phone: true,
          department: true,
          academicYear: true,
          semester: true,
          section: true,
          rollNumber: true,
          enrollmentNo: true,
          enrollmentType: true,
          createdAt: true,
          updatedAt: true,
          collegeId: true,
          users: {
            select: {
              id: true,
              displayName: true,
              email: true,
              role: true,
              status: true,
            },
          },
          colleges: {
            select: {
              id: true,
              name: true,
            },
          },
          student_batches: {
            select: {
              batches: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      prisma.students.count({ where }),
    ]);

    // Map to include computed fields
    const mappedStudents = students.map((s) => ({
      id: s.id,
      name: s.users?.displayName || s.users?.email || 'Unknown',
      email: s.users?.email || '',
      phone: s.phone,
      department: s.department,
      academicYear: s.academicYear,
      semester: s.semester,
      section: s.section,
      rollNumber: s.rollNumber,
      enrollmentNo: s.enrollmentNo,
      enrollmentType: s.enrollmentType,
      status: s.users?.status || 'inactive',
      collegeName: s.colleges?.name || null,
      collegeId: s.collegeId,
      batchIds: s.student_batches?.map((sb: any) => sb.batches?.id).filter(Boolean) || [],
      batchNames: s.student_batches?.map((sb: any) => sb.batches?.name).filter(Boolean) || [],
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    console.log('[GET_STUDENTS_PAGINATED] Returning:', {
      studentCount: mappedStudents.length,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
      filters: { searchQuery, collegeId, department, academicYear, section, status },
    });

    return {
      success: true as const,
      data: mappedStudents,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  } catch (error: any) {
    console.error("[GET_STUDENTS_PAGINATED] Error:", error);
    return {
      success: false as const,
      error: error.message || "Failed to fetch students",
      data: [],
      totalCount: 0,
      page: 1,
      pageSize: 100,
      totalPages: 0,
    };
  }
}

// Get unique filter options from actual student data + college departments + batch departments
/**
 * DEPRECATED: Loads ALL students, colleges, and batches to extract filter options
 * Use getStudentFilterOptionsOptimizedAction() for database DISTINCT queries
 * 
 * @deprecated Use getStudentFilterOptionsOptimizedAction() with DISTINCT queries
 */
export async function getStudentFilterOptionsAction({
  userRole,
  userCollegeId,
  collegeId,
}: {
  userRole?: string;
  userCollegeId?: string;
  collegeId?: string;
}) {
  console.warn("[DEPRECATED] getStudentFilterOptionsAction() loads all records. Use getStudentFilterOptionsOptimizedAction() instead.");
  try {
    // Build where clause based on role and college filter
    const where: any = {};

    // Role-based scoping (STRICT FILTERING FOR COLLEGE ADMINS)
    if (userRole && (userRole.toLowerCase() === "college_admin" || userRole.toLowerCase() === "college")) {
      if (!userCollegeId) {
        throw new Error("Unauthorized: College Admin must have an assigned college ID");
      }
      where.collegeId = userCollegeId;
      console.log('[GET_STUDENT_FILTER_OPTIONS] College admin filter applied:', { userRole, userCollegeId });
    }

    // Filter by specific college if provided
    if (collegeId && collegeId !== "ALL" && collegeId !== "GLOBAL") {
      where.collegeId = collegeId;
    }

    // Get all unique values from STUDENTS
    const students = await prisma.students.findMany({
      where,
      select: {
        department: true,
        academicYear: true,
        section: true,
      },
    });

    // Get departments from COLLEGES (so new departments show even without students)
    const collegeWhere: any = {};
    if (collegeId && collegeId !== "ALL" && collegeId !== "GLOBAL") {
      collegeWhere.id = collegeId;
    } else if (userRole && (userRole.toLowerCase() === "college_admin" || userRole.toLowerCase() === "college") && userCollegeId) {
      collegeWhere.id = userCollegeId;
    }

    const colleges = await prisma.colleges.findMany({
      where: Object.keys(collegeWhere).length > 0 ? collegeWhere : undefined,
      select: {
        departments: true,
      },
    });

    // Get departments from BATCHES (so batch departments show even without students)
    const batchWhere: any = {};
    if (collegeId && collegeId !== "ALL" && collegeId !== "GLOBAL") {
      batchWhere.collegeId = collegeId;
    } else if (userRole && (userRole.toLowerCase() === "college_admin" || userRole.toLowerCase() === "college") && userCollegeId) {
      batchWhere.collegeId = userCollegeId;
    }

    const batches = await prisma.batches.findMany({
      where: Object.keys(batchWhere).length > 0 ? batchWhere : undefined,
      select: {
        department: true,
        academicYear: true,
        section: true,
      },
    });

    // Extract unique values from all sources
    const departments = new Set<string>();
    const years = new Set<string>();
    const sections = new Set<string>();

    // Add from students
    students.forEach((s) => {
      if (s.department) departments.add(s.department);
      if (s.academicYear) years.add(s.academicYear);
      if (s.section) sections.add(s.section);
    });

    // Add from colleges
    colleges.forEach((c) => {
      if (c.departments && Array.isArray(c.departments)) {
        c.departments.forEach((d: string) => {
          if (d) departments.add(d);
        });
      }
    });

    // Add from batches
    batches.forEach((b) => {
      if (b.department) departments.add(b.department);
      if (b.academicYear) years.add(b.academicYear);
      if (b.section) sections.add(b.section);
    });

    return {
      success: true,
      departments: Array.from(departments).sort(),
      years: Array.from(years).sort(),
      sections: Array.from(sections).sort(),
    };
  } catch (error: any) {
    console.error("[GET_STUDENT_FILTER_OPTIONS] Error:", error);
    return {
      success: false,
      departments: [],
      years: [],
      sections: [],
    };
  }
}

/**
 * OPTIMIZED: Get filter options using database DISTINCT queries
 * Uses raw SQL for efficient DISTINCT queries instead of loading all records
 */
export async function getStudentFilterOptionsOptimizedAction({
  userRole,
  userCollegeId,
  collegeId,
}: {
  userRole?: string;
  userCollegeId?: string;
  collegeId?: string;
}) {
  try {
    // Build where conditions for SQL
    const whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Role-based scoping
    if (userRole && (userRole.toLowerCase() === "college_admin" || userRole.toLowerCase() === "college")) {
      if (!userCollegeId) {
        throw new Error("Unauthorized: College Admin must have an assigned college ID");
      }
      whereConditions.push(`"collegeId"::text = $${paramIndex}::text`);
      params.push(userCollegeId);
      paramIndex++;
    }

    // Filter by specific college if provided
    if (collegeId && collegeId !== "ALL" && collegeId !== "GLOBAL" && collegeId !== "") {
      if (collegeId === "UNASSIGNED") {
        whereConditions.push(`"collegeId" IS NULL`);
      } else {
        whereConditions.push(`"collegeId"::text = $${paramIndex}::text`);
        params.push(collegeId);
        paramIndex++;
      }
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // Execute DISTINCT queries in parallel
    const [studentDepts, studentYears, studentSections, batchDepts, batchYears, batchSections] = await Promise.all([
      // DISTINCT departments from students
      prisma.$queryRawUnsafe(
        `SELECT DISTINCT department FROM students ${whereClause} AND department IS NOT NULL ORDER BY department`,
        ...params
      ) as Promise<Array<{ department: string }>>,
      
      // DISTINCT academic years from students
      prisma.$queryRawUnsafe(
        `SELECT DISTINCT "academicYear" FROM students ${whereClause} AND "academicYear" IS NOT NULL ORDER BY "academicYear"`,
        ...params
      ) as Promise<Array<{ academicYear: string }>>,
      
      // DISTINCT sections from students
      prisma.$queryRawUnsafe(
        `SELECT DISTINCT section FROM students ${whereClause} AND section IS NOT NULL ORDER BY section`,
        ...params
      ) as Promise<Array<{ section: string }>>,
      
      // DISTINCT departments from batches
      prisma.$queryRawUnsafe(
        `SELECT DISTINCT department FROM batches ${whereClause} AND department IS NOT NULL ORDER BY department`,
        ...params
      ) as Promise<Array<{ department: string }>>,
      
      // DISTINCT academic years from batches
      prisma.$queryRawUnsafe(
        `SELECT DISTINCT "academicYear" FROM batches ${whereClause} AND "academicYear" IS NOT NULL ORDER BY "academicYear"`,
        ...params
      ) as Promise<Array<{ academicYear: string }>>,
      
      // DISTINCT sections from batches
      prisma.$queryRawUnsafe(
        `SELECT DISTINCT section FROM batches ${whereClause} AND section IS NOT NULL ORDER BY section`,
        ...params
      ) as Promise<Array<{ section: string }>>,
    ]);

    // Also get departments from colleges (departments array field)
    const collegeWhere: any = {};
    if (collegeId && collegeId !== "ALL" && collegeId !== "GLOBAL" && collegeId !== "") {
      if (collegeId !== "UNASSIGNED") {
        collegeWhere.id = collegeId;
      }
    } else if (userRole && (userRole.toLowerCase() === "college_admin" || userRole.toLowerCase() === "college") && userCollegeId) {
      collegeWhere.id = userCollegeId;
    }

    const colleges = await prisma.colleges.findMany({
      where: Object.keys(collegeWhere).length > 0 ? collegeWhere : undefined,
      select: {
        departments: true,
      },
    });

    // Merge unique values from all sources
    const departments = new Set<string>();
    const years = new Set<string>();
    const sections = new Set<string>();

    // Add from students
    studentDepts.forEach((row) => {
      if (row.department) departments.add(row.department);
    });
    studentYears.forEach((row) => {
      if (row.academicYear) years.add(row.academicYear);
    });
    studentSections.forEach((row) => {
      if (row.section) sections.add(row.section);
    });

    // Add from batches
    batchDepts.forEach((row) => {
      if (row.department) departments.add(row.department);
    });
    batchYears.forEach((row) => {
      if (row.academicYear) years.add(row.academicYear);
    });
    batchSections.forEach((row) => {
      if (row.section) sections.add(row.section);
    });

    // Add from colleges
    colleges.forEach((c) => {
      if (c.departments && Array.isArray(c.departments)) {
        c.departments.forEach((d: string) => {
          if (d) departments.add(d);
        });
      }
    });

    console.log('[GET_STUDENT_FILTER_OPTIONS_OPTIMIZED] Results:', {
      departments: departments.size,
      years: years.size,
      sections: sections.size,
    });

    return {
      success: true,
      departments: Array.from(departments).sort(),
      years: Array.from(years).sort(),
      sections: Array.from(sections).sort(),
    };
  } catch (error: any) {
    console.error("[GET_STUDENT_FILTER_OPTIONS_OPTIMIZED] Error:", error);
    return {
      success: false,
      departments: [],
      years: [],
      sections: [],
    };
  }
}

/**
 * DEPRECATED: Loads ALL students without pagination - causes massive egress at scale
 * 
 * DO NOT USE THIS FUNCTION. Use getStudentsPaginatedAction() instead.
 * This function is kept only for backward compatibility and will be removed.
 * 
 * @deprecated Use getStudentsPaginatedAction() with proper pagination
 * @throws Error Always throws to prevent accidental usage
 */
export async function getAllStudentsAction(): Promise<never> {
  throw new Error(
    "[DEPRECATED] getAllStudentsAction() is deprecated and disabled. " +
    "Use getStudentsPaginatedAction() with pagination instead. " +
    "Loading all students causes massive egress at scale (20K+ students = 10MB+ transfer). " +
    "For college-specific queries, use getStudentsByCollegeAction(). " +
    "For external colleges with slug matching, use getStudentsByCollegeWithSlugAction()."
  );
}

export async function getStudentCountAction() {
  // Get total count for UI
  return await prisma.students.count();
}

export async function getStudentsByCollegeAction(collegeId: string) {
  // OPTIMIZED: Load all students for college with selective fields
  return await prisma.students.findMany({
    where: { 
      OR: [
        { collegeId },
        { colleges: { id: collegeId } },
        { colleges: { name: { equals: collegeId, mode: 'insensitive' } } }
      ]
    },
    orderBy: { createdAt: 'desc' },
    include: {
      users: {
        select: {
          id: true,
          displayName: true,
          email: true,
          role: true,
          status: true,
        }
      },
      colleges: {
        select: {
          id: true,
          name: true,
          type: true,
        }
      },
      student_batches: {
        include: { 
          batches: {
            select: {
              id: true,
              name: true,
            }
          }
        }
      }
    }
  });
}

export async function getStudentCountByCollegeAction(collegeId: string) {
  // Get count for specific college
  return await prisma.students.count({
    where: { 
      OR: [
        { collegeId },
        { colleges: { id: collegeId } },
        { colleges: { name: { equals: collegeId, mode: 'insensitive' } } }
      ]
    }
  });
}

/**
 * Get students for a college with fuzzy slug matching (for external colleges)
 * Handles case-insensitive slug variations without loading all students
 * 
 * @param collegeId - College ID or slug to match
 * @param collegeName - Optional college name for additional matching
 * @returns Paginated students with database-level filtering
 */
export async function getStudentsByCollegeWithSlugAction(
  collegeId: string,
  collegeName?: string
) {
  try {
    // Build slug-based OR conditions for database query
    const cleanSlug = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const targetSlug = cleanSlug(collegeId);
    
    // Create flexible where conditions that handle:
    // 1. Exact collegeId match
    // 2. Case-insensitive name match
    // 3. Slug-based fuzzy matching
    const whereConditions: any[] = [
      { collegeId: { equals: collegeId, mode: 'insensitive' } },
    ];
    
    if (collegeName) {
      const nameSlug = cleanSlug(collegeName);
      if (nameSlug !== targetSlug) {
        whereConditions.push({ collegeId: { contains: nameSlug, mode: 'insensitive' } });
      }
    }
    
    // Add slug-based matching for original ID
    if (targetSlug) {
      whereConditions.push({ collegeId: { contains: targetSlug, mode: 'insensitive' } });
    }
    
    // Execute query with all fuzzy matching conditions
    const students = await prisma.students.findMany({
      where: { OR: whereConditions },
      orderBy: { createdAt: 'desc' },
      include: {
        users: {
          select: {
            id: true,
            displayName: true,
            email: true,
            role: true,
            status: true,
          }
        },
        colleges: {
          select: {
            id: true,
            name: true,
            type: true,
          }
        },
        student_batches: {
          include: { 
            batches: {
              select: {
                id: true,
                name: true,
              }
            }
          }
        }
      }
    });
    
    return students;
  } catch (err: any) {
    console.error("[GET_STUDENTS_BY_COLLEGE_SLUG] Failed:", err);
    throw err;
  }
}

export async function getStudentsByBatchAction(batchId: string) {
  const data = await prisma.student_batches.findMany({
    where: {
      OR: [
        { batchId },
        { batches: { name: batchId } }
      ]
    },
    include: {
      students: {
        include: {
          users: true,
          colleges: true,
          student_batches: {
            include: { batches: true }
          }
        }
      }
    }
  });
  return data;
}

export async function getStudentByIdAction(studentId: string) {
  return await prisma.students.findUnique({
    where: { id: studentId },
    include: {
      users: true,
      colleges: true,
      student_batches: {
        include: { batches: true }
      }
    }
  });
}

export async function getStudentByEmailAction(email: string) {
  return await prisma.students.findFirst({
    where: { users: { email: email.toLowerCase() } },
    include: {
      users: true,
      colleges: true,
      student_batches: {
        include: { batches: true }
      }
    }
  });
}

export async function createStudentProfileAction(data: any) {
  const studentPayload: any = {
    id: data.id,
    collegeId: (!data.collegeId || data.collegeId === "GLOBAL" || data.collegeId === "all" || data.collegeId === "ALL" || data.collegeId === "global") ? null : data.collegeId,
  };
  if (data.phone !== undefined) studentPayload.phone = data.phone;
  if (data.department !== undefined) studentPayload.department = data.department;
  if (data.academicYear !== undefined) studentPayload.academicYear = data.academicYear;
  if (data.semester !== undefined) studentPayload.semester = typeof data.semester === "number" ? data.semester : (parseInt(data.semester, 10) || null);
  if (data.section !== undefined) studentPayload.section = data.section;
  if (data.rollNumber !== undefined) studentPayload.rollNumber = data.rollNumber;
  if (data.enrollmentNo !== undefined) studentPayload.enrollmentNo = data.enrollmentNo;
  if (data.mustChangePassword !== undefined) studentPayload.mustChangePassword = data.mustChangePassword;
  if (data.enrollmentType !== undefined) studentPayload.enrollmentType = data.enrollmentType;
  if (data.authId !== undefined) studentPayload.authId = data.authId;

  const inserted = await prisma.students.create({
    data: studentPayload,
    select: { id: true }
  });

  // Batch assignments if batchIds provided
  if (Array.isArray(data.batchIds) && data.batchIds.length > 0) {
    const validBatchIds = data.batchIds.filter(Boolean);
    if (validBatchIds.length > 0) {
      const existingBatches = await prisma.batches.findMany({
        where: {
          OR: [
            { id: { in: validBatchIds } },
            { name: { in: validBatchIds } }
          ]
        },
        select: { id: true }
      });
      const existingIds = existingBatches.map((b: any) => b.id);
      if (existingIds.length > 0) {
        await prisma.student_batches.createMany({
          data: existingIds.map((bId: string) => ({
            studentId: inserted.id,
            batchId: bId
          })),
          skipDuplicates: true
        });
      }
    }
  }

  // UPDATE COLLEGE STUDENT COUNT - increment by 1
  if (studentPayload.collegeId) {
    await prisma.colleges.update({
      where: { id: studentPayload.collegeId },
      data: { studentCount: { increment: 1 } }
    }).catch((err) => {
      console.error("Failed to increment college studentCount during profile creation:", err);
    });
  }

  return inserted.id;
}

export async function updateStudentProfileAction(studentId: string, whitelistedData: any) {
  await prisma.$transaction(async (tx: any) => {
    // Get current student data to check if college changed
    const currentStudent = await tx.students.findUnique({
      where: { id: studentId },
      select: { collegeId: true }
    });

    const oldCollegeId = currentStudent?.collegeId;
    const newCollegeId = whitelistedData.collegeId !== undefined
      ? (!whitelistedData.collegeId || whitelistedData.collegeId === "GLOBAL" || whitelistedData.collegeId === "all" || whitelistedData.collegeId === "ALL" || whitelistedData.collegeId === "global" ? null : whitelistedData.collegeId)
      : undefined;

    if (Object.keys(whitelistedData).length > 0) {
      // 1. Clean student fields
      const studentPayload: any = {};
      if (whitelistedData.collegeId !== undefined) {
        studentPayload.collegeId = newCollegeId;
      }
      if (whitelistedData.phone !== undefined) studentPayload.phone = whitelistedData.phone;
      if (whitelistedData.department !== undefined) studentPayload.department = whitelistedData.department;
      if (whitelistedData.academicYear !== undefined) studentPayload.academicYear = whitelistedData.academicYear;
      if (whitelistedData.semester !== undefined) studentPayload.semester = typeof whitelistedData.semester === "number" ? whitelistedData.semester : (parseInt(whitelistedData.semester, 10) || null);
      if (whitelistedData.section !== undefined) studentPayload.section = whitelistedData.section;
      if (whitelistedData.rollNumber !== undefined) studentPayload.rollNumber = whitelistedData.rollNumber;
      if (whitelistedData.enrollmentNo !== undefined) studentPayload.enrollmentNo = whitelistedData.enrollmentNo;
      if (whitelistedData.mustChangePassword !== undefined) studentPayload.mustChangePassword = whitelistedData.mustChangePassword;
      if (whitelistedData.enrollmentType !== undefined) studentPayload.enrollmentType = whitelistedData.enrollmentType;
      if (whitelistedData.updatedAt !== undefined) {
        studentPayload.updatedAt = new Date(whitelistedData.updatedAt);
      } else {
        studentPayload.updatedAt = new Date();
      }

      if (Object.keys(studentPayload).length > 0) {
        await tx.students.update({
          where: { id: studentId },
          data: studentPayload
        });
      }

      // 2. Clean user fields
      const userPayload: any = {};
      if (whitelistedData.name) userPayload.displayName = whitelistedData.name.trim();
      if (whitelistedData.displayName) userPayload.displayName = whitelistedData.displayName.trim();
      if (whitelistedData.email) userPayload.email = whitelistedData.email.toLowerCase().trim();
      if (whitelistedData.status !== undefined) userPayload.status = whitelistedData.status;
      if (whitelistedData.collegeId !== undefined) {
        userPayload.collegeId = newCollegeId;
      }
      if (Object.keys(userPayload).length > 0) {
        userPayload.updatedAt = new Date();
        await tx.users.update({
          where: { id: studentId },
          data: userPayload
        });
      }

      // 3. Update college student counts if college changed
      if (newCollegeId !== undefined && oldCollegeId !== newCollegeId) {
        // Decrement old college count (if had a college)
        if (oldCollegeId) {
          await tx.colleges.update({
            where: { id: oldCollegeId },
            data: { studentCount: { decrement: 1 } }
          }).catch((err: any) => {
            console.error(`Failed to decrement count for old college ${oldCollegeId}:`, err);
          });
        }

        // Increment new college count (if assigned to a college)
        if (newCollegeId) {
          await tx.colleges.update({
            where: { id: newCollegeId },
            data: { studentCount: { increment: 1 } }
          }).catch((err: any) => {
            console.error(`Failed to increment count for new college ${newCollegeId}:`, err);
          });
        }
      }

      // 3. Batch assignments if batchIds provided
      if (Array.isArray(whitelistedData.batchIds)) {
        await tx.student_batches.deleteMany({ where: { studentId } });
        const validBatchIds = whitelistedData.batchIds.filter(Boolean);
        for (const bRaw of validBatchIds) {
          const bName = String(bRaw).trim();
          if (!bName) continue;
          let existingBatches = await tx.batches.findMany({
            where: {
              OR: [
                { id: bName },
                { name: { equals: bName, mode: "insensitive" } }
              ]
            },
            select: { id: true }
          });
          if (existingBatches.length === 0) {
            const newBatchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            const created = await tx.batches.create({
              data: {
                id: newBatchId,
                name: bName,
                collegeId: whitelistedData.collegeId || null,
                department: whitelistedData.department || null,
                academicYear: whitelistedData.academicYear || null,
                section: whitelistedData.section || null,
              },
              select: { id: true }
            });
            existingBatches = [created];
          }
          for (const b of existingBatches) {
            await tx.student_batches.create({
              data: { studentId, batchId: b.id }
            }).catch(() => {});
          }
        }
      }
    }
  });
}

export async function getTrainerNotesAction(studentId: string) {
  return await prisma.trainer_notes.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    take: 100
  });
}

export async function addTrainerNoteAction(note: any) {
  const data = await prisma.trainer_notes.create({
    data: note,
    select: { id: true }
  });
  return data.id;
}

export async function checkStudentEmailExistsAction(email: string) {
  const existing = await prisma.students.findFirst({
    where: { users: { email } }
  });
  return !!existing;
}

export async function resilientStudentFallbackAction(docId: string, cleanEmail: string, studentName: string, studentDoc: any, userDoc: any) {
  const rawColId = studentDoc.collegeId || userDoc.collegeId;
  const isSpecial = !rawColId || ["global", "all", "unassigned", "col-unassigned"].includes(String(rawColId).toLowerCase());
  let validColId: string | null = null;

  if (!isSpecial) {
    const colExists = await prisma.colleges.findFirst({
      where: {
        OR: [
          { id: String(rawColId) },
          { name: { equals: String(rawColId), mode: "insensitive" } }
        ]
      },
      select: { id: true }
    });
    if (colExists) {
      validColId = colExists.id;
    } else {
      const newCol = await prisma.colleges.create({
        data: {
          id: String(rawColId),
          name: String(rawColId),
          code: String(rawColId).substring(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "") || "COL",
          type: "external",
          departments: ["General"],
        },
        select: { id: true }
      });
      validColId = newCol.id;
    }
  }

  const cleanUserDoc = { ...userDoc, collegeId: validColId };
  const cleanStudentDoc = { ...studentDoc, collegeId: validColId };

  await prisma.$transaction(async (tx: any) => {
    // Upsert user
    await tx.users.upsert({
      where: { id: docId },
      update: cleanUserDoc,
      create: cleanUserDoc
    });
    // Upsert student
    await tx.students.upsert({
      where: { id: docId },
      update: cleanStudentDoc,
      create: cleanStudentDoc
    });
  });
}
