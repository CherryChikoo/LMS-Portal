const fs = require('fs');
const path = require('path');

const targetFile = 'src/app/(dashboard)/results/page.tsx';
let content = fs.readFileSync(targetFile, 'utf8');

content = content.replace(
  'import { getCurrentUser } from "@/lib/utils/auth-session";',
  'import { getCurrentUser } from "@/lib/utils/auth-session";\nimport { getPaginatedResultsAction } from "@/lib/actions/results-actions";'
);

const stateToAdd = `
  const [paginatedAttempts, setPaginatedAttempts] = useState<ExamAttempt[]>([]);
  const [totalSubmissions, setTotalSubmissions] = useState(0);
  const [passRate, setPassRate] = useState(0);
  const [avgScore, setAvgScore] = useState(0);
  const [highestScore, setHighestScore] = useState(0);
  const [loadingResults, setLoadingResults] = useState(false);
`;
content = content.replace(
  '  const itemsPerPage = 25;',
  '  const itemsPerPage = 25;\n' + stateToAdd
);

content = content.replace(/const filteredAttemptsByHierarchy = useMemo\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/, '');
content = content.replace(/const filteredAttempts = useMemo\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/, '');

const useEffectStr = `
  useEffect(() => {
    let isMounted = true;
    setLoadingResults(true);
    
    getPaginatedResultsAction({
      collegeId: academicFilters.collegeId || "ALL",
      department: academicFilters.department || "ALL",
      academicYear: academicFilters.academicYear || "ALL",
      section: academicFilters.section || "ALL",
      batchId: academicFilters.batchId || "ALL",
      studentFilter,
      examFilter,
      outcomeFilter,
      searchQuery,
      sortBy,
      page: currentPage,
      limit: itemsPerPage
    }).then((res) => {
      if (!isMounted) return;
      if (res.success && res.data) {
        setPaginatedAttempts(res.data.attempts as ExamAttempt[]);
        setTotalSubmissions(res.data.totalCount);
        setPassRate(res.data.passRate);
        setAvgScore(res.data.avgScore);
        setHighestScore(res.data.highestScore);
      }
      setLoadingResults(false);
    });

    return () => { isMounted = false; };
  }, [academicFilters, studentFilter, examFilter, outcomeFilter, searchQuery, sortBy, currentPage]);
`;
content = content.replace(
  '  // Data is synced by useLMSData, no need for redundant subscriptions',
  '  // Server-side fetching\n' + useEffectStr
);

content = content.replace(/const totalSubmissions = [^\n]*\n/g, '');
content = content.replace(/const passCount = [^\n]*\n/g, '');
content = content.replace(/const passRate = [^\n]*\n/g, '');
content = content.replace(/const highestScore = [^\n]*\n/g, '');
content = content.replace(/const avgScore = [^\n]*\n/g, '');

content = content.replace(/filteredAttempts\.length/g, 'totalSubmissions');
content = content.replace(/const paginatedAttempts = [^\n]*\n/g, '');
content = content.replace(/\{lmsLoading \? \(/g, '{(lmsLoading || loadingResults) ? (');
content = content.replace(/gap-3 pt-3/g, 'gap-6 pt-3');
content = content.replace(/>\{totalSubmissions\}<\/div>/g, '>{totalSubmissions.toLocaleString()}</div>');
content = content.replace(/>\{totalSubmissions\}<\/span>/g, '>{totalSubmissions.toLocaleString()}</span>');

fs.writeFileSync(targetFile, content, 'utf8');
console.log("Refactored.");
