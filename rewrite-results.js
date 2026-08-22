const fs = require('fs');
const targetFile = 'src/app/(dashboard)/results/page.tsx';
let content = fs.readFileSync(targetFile, 'utf8');

// 1. Add import
if (!content.includes('getPaginatedResultsAction')) {
  content = content.replace(
    'import { useEntityResolution }',
    'import { getPaginatedResultsAction } from "@/lib/actions/results-actions";\nimport { useEntityResolution }'
  );
}

// 2. Remove attempts from useLMSData
content = content.replace(
  'const { filteredAttempts: attempts, filteredExams: exams, filteredStudents: students, loading: lmsLoading } = useLMSData();',
  'const { filteredExams: exams, filteredStudents: students, loading: lmsLoading } = useLMSData();\n  const [attempts, setAttempts] = useState<any[]>([]);\n  const [totalServerSubmissions, setTotalServerSubmissions] = useState(0);'
);

// 3. Remove filteredAttemptsByHierarchy and filteredAttempts, and replace with server fetch useEffect
const startFilteredByHierarchy = content.indexOf('  // Attempts narrowed by the cascading hierarchy filters');
const endFilteredAttempts = content.indexOf('  // Calculate exact counts dynamically based on the final filtered view.');

if (startFilteredByHierarchy !== -1 && endFilteredAttempts !== -1) {
  content = content.slice(0, startFilteredByHierarchy) + `
  // Derive lists from global cache since local attempts is only 25 items
  const examSubjectsList = useMemo(() => {
    return (exams as any[]).map((e) => ({ id: e.id, title: e.title || "Deleted Assessment" }));
  }, [exams]);

  const studentNamesList = useMemo(() => {
    return Array.from(new Set((students as any[]).map((s) => s.name).filter(Boolean)));
  }, [students]);

  // Server-side fetching
  useEffect(() => {
    let isMounted = true;
    setLoadingResults(true);
    
    const loadFromServer = async () => {
      try {
        const res = await getPaginatedResultsAction({
          userContext: {
            id: currentStudentUser?.id || "admin",
            authId: (currentStudentUser as any)?.uid || "",
            email: currentStudentUser?.email || "",
            role: actualRole as any,
            collegeId: academicFilters.collegeId
          },
          collegeId: academicFilters.collegeId,
          department: academicFilters.department,
          academicYear: academicFilters.academicYear,
          section: academicFilters.section,
          batchId: academicFilters.batchId,
          studentFilter,
          examFilter,
          outcomeFilter,
          searchQuery,
          sortBy: sortOption,
          page: attemptPage,
          limit: ATTEMPTS_PER_PAGE,
        });

        if (isMounted && res.success && res.data) {
          setAttempts(res.data.results);
          setTotalServerSubmissions(res.data.totalCount);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoadingResults(false);
      }
    };

    if (mounted) loadFromServer();
    return () => { isMounted = false; };
  }, [
    academicFilters,
    studentFilter,
    examFilter,
    outcomeFilter,
    searchQuery,
    sortOption,
    attemptPage,
    actualRole,
    currentStudentUser,
    mounted
  ]);

  const filteredAttempts = attempts;
` + content.slice(endFilteredAttempts);
}

// 4. Update totalSubmissions to use totalServerSubmissions
content = content.replace(
  'const totalSubmissions = filteredAttempts.length;',
  'const totalSubmissions = totalServerSubmissions;'
);

// 5. Update pagination total count
content = content.replace(
  'const totalPages = Math.max(1, Math.ceil(filteredAttempts.length / ATTEMPTS_PER_PAGE));',
  'const totalPages = Math.max(1, Math.ceil(totalServerSubmissions / ATTEMPTS_PER_PAGE));'
);

content = content.replace(
  'totalItems={filteredAttempts.length}',
  'totalItems={totalServerSubmissions}'
);

// 6. Fix loadData
content = content.replace(
  /  async function loadData\(\) \{\s+setLoadingResults\(true\);\s+try \{\s+await fetchFullLMSStateAction\(\);\s+\/\/ useLMSData will pick up the new cache via local storage event, but we can also just wait a sec\s+await new Promise\(r => setTimeout\(r, 600\)\);\s+\} catch \(err\) \{\s+console.error\(err\);\s+\} finally \{\s+setLoadingResults\(false\);\s+\}\s+\}/,
  `  async function loadData() {
    // Handled by useEffect changing dependencies
    setAttemptPage(1);
    setSearchQuery("");
  }`
);

fs.writeFileSync(targetFile, content, 'utf8');
console.log("Rewrote results/page.tsx to use server-side pagination");
