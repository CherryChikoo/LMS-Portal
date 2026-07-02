"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { ClipboardList, Plus, FileCode, Play, Eye, Edit3, Trash2, Target, Clock, CheckCircle2, AlertCircle, ArrowLeft, ArrowRight, Save, Sparkles, Send, Search, Calendar } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { getAllExams, createExam, deleteExam, parseMarkdownTest, getAllStudents, getAllColleges, getAllBatches, getEffectiveExamStatus, getStudentAttempts, filterExamsForStudent } from "@/lib/services";
import type { Exam, Question, QuestionType, Student, AssignmentTargetType, College, Batch, ExamAttempt } from "@/types";

const formatSafeDate = (val: any, options?: Intl.DateTimeFormatOptions): string => {
  if (!val || val === "Invalid Date" || (typeof val === "string" && val.toLowerCase().includes("invalid"))) return "Live Active";
  try {
    let d: Date | null = null;
    if (typeof val === "number") d = new Date(val);
    else if (val?.seconds) d = new Date(val.seconds * 1000);
    else if (val?._seconds) d = new Date(val._seconds * 1000);
    else if (typeof val?.toDate === "function") d = val.toDate();
    else if (typeof val === "string") d = new Date(val);
    else if (val instanceof Date) d = val;
    
    if (!d || isNaN(d.getTime()) || d.toString() === "Invalid Date") {
      return "Live Active";
    }
    return d.toLocaleDateString([], options || { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "Live Active";
  }
};

export default function ExamsPage() {
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [colleges, setColleges] = useState<College[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [attempts, setAttempts] = useState<ExamAttempt[]>([]);
  const [studentUser, setStudentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>("admin");
  const [studentTab, setStudentTab] = useState<"active" | "upcoming" | "pending" | "completed" | "expired">("pending");
  const [examSearch, setExamSearch] = useState("");
  const [examCollegeFilter, setExamCollegeFilter] = useState("ALL");
  const [examDeptFilter, setExamDeptFilter] = useState("ALL");
  const [examYearFilter, setExamYearFilter] = useState("ALL");
  const [examSectionFilter, setExamSectionFilter] = useState("ALL");
  const [examBatchFilter, setExamBatchFilter] = useState("ALL");

  // Modal State
  const [creationMode, setCreationMode] = useState<"none" | "manual" | "markdown">("none");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState<number | "">(30);
  const [passingMarks, setPassingMarks] = useState<number | "">(40);
  const [scheduleMode, setScheduleMode] = useState<"immediate" | "scheduled">("immediate");
  const [startTimeStr, setStartTimeStr] = useState("");
  const [endTimeStr, setEndTimeStr] = useState("");

  // Questions working state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [mdText, setMdText] = useState("# Question 1\nWhat is Java?\nA. Language\nB. Database\nC. Browser\nD. Operating System\nAnswer: A\nMarks: 2\n\n# Question 2\nWhat is 2 + 2?\nA. 3\nB. 4\nC. 5\nD. 6\nAnswer: B\nMarks: 2");

  // Composite Assignment Targeting State
  const [targetCollege, setTargetCollege] = useState("ALL");
  const [targetDepartment, setTargetDepartment] = useState("ALL");
  const [targetYear, setTargetYear] = useState("ALL");
  const [targetSection, setTargetSection] = useState("ALL");
  const [targetBatch, setTargetBatch] = useState("ALL");

  // Preview Mode State
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewQIdx, setPreviewQIdx] = useState(0);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, string>>({});



  const getStudentAttemptForExam = (examId: string) => {
    return attempts.find((a) => {
      if (a.examId !== examId) return false;
      const sId = studentUser?.id;
      const sEmail = (studentUser?.email || "").toLowerCase().trim();
      const sName = (studentUser?.name || "").toLowerCase().trim();

      if (sId && (a.studentId === sId || a.studentId === sEmail)) return true;
      if (sEmail && (a.studentId?.toLowerCase() === sEmail || (a as any).studentEmail?.toLowerCase() === sEmail)) return true;
      if (sEmail && sEmail !== "student@lms.dev" && sName && a.studentName?.toLowerCase() === sName) return true;
      return false;
    });
  };

  const fetchExams = async () => {
    setLoading(true);
    try {
      const [exData, studData, colData, batData, attData] = await Promise.all([
        getAllExams(),
        getAllStudents(),
        getAllColleges(),
        getAllBatches(),
        getStudentAttempts(),
      ]);
      setExams(exData);
      setStudents(studData);
      setColleges(colData);
      setBatches(batData);
      setAttempts(attData || []);
    } catch (err) {
      console.error("Failed to fetch exams", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExams();
    try {
      const storedRole = localStorage.getItem("lms_role");
      if (storedRole) {
        setUserRole(storedRole.toLowerCase());
      }
      const uStr = localStorage.getItem("lms_user") || localStorage.getItem("user");
      if (uStr) {
        setStudentUser(JSON.parse(uStr));
      } else {
        setStudentUser({ id: "guest", name: "Student Candidate", email: "student@lms.dev", department: "Computer Science & Engineering", college: "St. Xavier's College of Engineering", batchIds: [] });
      }
    } catch (_) {}
  }, []);

  const availableCollegeNames = Array.from(
    new Set([
      "Global Institute",
      ...colleges.map((c) => c.name),
      ...students.map((s) => s.collegeName || s.collegeId),
    ])
  ).filter((n) => Boolean(n) && n !== "ALL" && n !== "GLOBAL");

  const handleParseMarkdown = () => {
    const parsed = parseMarkdownTest(mdText);
    setQuestions(parsed);
  };

  const handleAddManualQuestion = (type: QuestionType = "mcq") => {
    setQuestions([
      ...questions,
      {
        id: `q-man-${Date.now()}`,
        text: type === "fill-blank" ? "The primary programming language used for Android app development is _____" : "New Question Text",
        type,
        options: type === "mcq" ? ["Option A", "Option B", "Option C", "Option D"] : undefined,
        correctAnswer: type === "fill-blank" ? "Java" : "Option A",
        marks: 2,
        subject: "General",
        topic: "Assessment",
        difficulty: "medium",
        tags: ["manual"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
  };

  const handlePublish = async () => {
    if (!title || questions.length === 0) return;
    const totalMarks = questions.reduce((acc, q) => acc + (q.marks || 2), 0);
    const compositeTarget = {
      type: "composite" as const,
      ids: ["composite"],
      collegeId: targetCollege,
      department: targetDepartment,
      academicYear: targetYear,
      section: targetSection,
      batchId: targetBatch,
    };

    const startDt = scheduleMode === "scheduled" && startTimeStr ? new Date(startTimeStr) : null;
    const endDt = scheduleMode === "scheduled" && endTimeStr ? new Date(endTimeStr) : null;
    const initialStatus = scheduleMode === "scheduled" && startDt && startDt.getTime() > Date.now() ? "scheduled" : "active";

    const examData: Record<string, unknown> = {
      title,
      description: `Contains ${questions.length} questions`,
      duration: Number(duration) || 30,
      totalMarks,
      passingMarks: Number(passingMarks) || 40,
      questionIds: questions.map((q) => q.id),
      questions,
      targets: [compositeTarget],
      status: initialStatus,
      settings: {
        shuffleQuestions: true,
        shuffleOptions: false,
        showResults: true,
        allowReview: true,
        autoSubmit: true,
        proctoring: false,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Only include time fields when they have actual values (Firestore rejects undefined)
    if (startDt) examData.startTime = startDt;
    if (endDt) examData.endTime = endDt;
    if (startDt) examData.scheduledAt = startDt;

    await createExam(examData as Omit<Exam, "id">);

    setCreationMode("none");
    setTitle("");
    setQuestions([]);
    setTargetCollege("ALL");
    setTargetDepartment("ALL");
    setTargetYear("ALL");
    setTargetSection("ALL");
    setTargetBatch("ALL");
    fetchExams();
  };

  const handleDelete = async (id: string) => {
    await deleteExam(id);
    fetchExams();
  };

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="space-y-6">
      <PageHeader
        title="Online Examination Manager"
        description={userRole !== "student" ? "Create dynamic tests manually or via Markdown generator, preview full user experiences, and assign to targeted academic hierarchies." : "Browse assigned evaluation papers and take live proctored examinations."}
        actions={
          <div className="flex items-center gap-3">
            {userRole !== "student" && (
              <>
                <Button
                  onClick={() => {
                    setCreationMode("markdown");
                    setQuestions([]);
                  }}
                  variant="outline"
                  className="border border-brand text-brand hover:bg-brand/10 flex items-center gap-2"
                >
                  <FileCode className="w-4 h-4" />
                  <span>Markdown Generator</span>
                </Button>
                <Button
                  onClick={() => {
                    setCreationMode("manual");
                    setQuestions([]);
                  }}
                  className="bg-brand hover:bg-brand/90 text-white flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Manual Test Creator</span>
                </Button>
              </>
            )}
          </div>
        }
      />

      {userRole === "student" && (
        <div className="flex items-center gap-2 border-b border-border pb-3 overflow-x-auto">
          {(["upcoming", "active", "pending", "completed", "expired"] as const).map((tab) => {
            const count = filterExamsForStudent(exams, studentUser).filter((e) => {
              const eff = getEffectiveExamStatus(e);
              const att = getStudentAttemptForExam(e.id);
              if (tab === "upcoming") return eff === "scheduled";
              if (tab === "active") return eff === "active";
              if (tab === "pending") return eff === "active" && !att;
              if (tab === "completed") return !!att;
              if (tab === "expired") return (eff === "completed" || eff === "cancelled") && !att;
              return false;
            }).length;
            return (
              <button
                key={tab}
                onClick={() => setStudentTab(tab)}
                className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                  studentTab === tab
                    ? "bg-brand text-white shadow"
                    : "bg-muted/40 hover:bg-muted text-muted-foreground"
                }`}
              >
                {tab} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Search & Powerful Hierarchy Filter Bar for Exams */}
      {!loading && exams.length > 0 && (
        <div className="flex flex-col gap-3.5 bg-card/60 backdrop-blur-md p-4 rounded-2xl border border-border/80 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={examSearch}
                onChange={(e) => setExamSearch(e.target.value)}
                placeholder="Search assessments by title or description..."
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 shadow-sm"
              />
            </div>
            {userRole !== "student" && (
              <div className="text-xs font-semibold text-muted-foreground">
                Showing <span className="text-foreground font-extrabold">
                  {exams.filter(exam => {
                    if (examCollegeFilter !== "ALL" && !exam.targets?.[0]?.collegeId?.includes(examCollegeFilter) && !exam.targets?.[0]?.ids?.includes(examCollegeFilter)) return false;
                    if (examDeptFilter !== "ALL" && exam.targets?.[0]?.department !== examDeptFilter) return false;
                    if (examYearFilter !== "ALL" && exam.targets?.[0]?.academicYear !== examYearFilter) return false;
                    if (examSectionFilter !== "ALL" && exam.targets?.[0]?.section !== examSectionFilter) return false;
                    if (examBatchFilter !== "ALL" && exam.targets?.[0]?.batchId !== examBatchFilter) return false;
                    return true;
                  }).length}
                </span> of {exams.length} Assessments
              </div>
            )}
          </div>

          {userRole !== "student" && (
            <div className="pt-3 border-t border-border/60 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">College</label>
                <select
                  value={examCollegeFilter}
                  onChange={(e) => setExamCollegeFilter(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-border bg-background text-foreground text-xs font-semibold"
                >
                  <option value="ALL">All Colleges</option>
                  {availableCollegeNames.map((colName) => (
                    <option key={colName} value={colName}>{colName}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Department</label>
                <select
                  value={examDeptFilter}
                  onChange={(e) => setExamDeptFilter(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-border bg-background text-foreground text-xs font-semibold"
                >
                  <option value="ALL">All Departments</option>
                  {Array.from(new Set([
                    ...colleges.flatMap((c) => c.departments || []),
                    ...students.map((s) => s.department),
                  ])).filter(Boolean).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Year</label>
                <select
                  value={examYearFilter}
                  onChange={(e) => setExamYearFilter(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-border bg-background text-foreground text-xs font-semibold"
                >
                  <option value="ALL">All Years</option>
                  {Array.from(new Set(["1st Year", "2nd Year", "3rd Year", "4th Year", ...students.map((s) => s.academicYear).filter(Boolean)])).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Section</label>
                <select
                  value={examSectionFilter}
                  onChange={(e) => setExamSectionFilter(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-border bg-background text-foreground text-xs font-semibold"
                >
                  <option value="ALL">All Sections</option>
                  {Array.from(new Set(students.map((s) => s.section))).filter(Boolean).map((sec) => (
                    <option key={sec} value={sec}>{["A", "B", "C", "D"].includes(sec) ? `Section ${sec}` : sec}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Batch</label>
                <select
                  value={examBatchFilter}
                  onChange={(e) => setExamBatchFilter(e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-border bg-background text-foreground text-xs font-semibold"
                >
                  <option value="ALL">All Batches</option>
                  {batches.map((b) => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <span>Loading examinations...</span>
        </div>
      ) : exams.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={userRole !== "student" ? "No online assessments active" : "No examinations assigned to your hierarchy"}
          description={
            userRole !== "student"
              ? "Build structured examinations using our rapid Markdown generator or manual question card editor."
              : "Check back when your trainer assigns a new assessment to your department or batch."
          }
          actionLabel={userRole !== "student" ? "Launch Markdown Generator" : undefined}
          onAction={userRole !== "student" ? () => setCreationMode("markdown") : () => {}}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams
            .filter((exam) => {
              const q = examSearch.toLowerCase();
              const matchesSearch = !q || exam.title.toLowerCase().includes(q) || (exam.description || "").toLowerCase().includes(q);
              if (!matchesSearch) return false;

              if (userRole === "student") {
                if (filterExamsForStudent([exam], studentUser).length === 0) return false;
                const eff = getEffectiveExamStatus(exam);
                const att = getStudentAttemptForExam(exam.id);
                if (studentTab === "upcoming") return eff === "scheduled";
                if (studentTab === "active") return eff === "active";
                if (studentTab === "pending") return eff === "active" && !att;
                if (studentTab === "completed") return !!att;
                if (studentTab === "expired") return (eff === "completed" || eff === "cancelled") && !att;
              } else {
                const t = exam.targets?.[0];
                if (examCollegeFilter !== "ALL" && t?.collegeId !== examCollegeFilter && !t?.ids?.includes(examCollegeFilter) && !t?.ids?.includes("ALL")) return false;
                if (examDeptFilter !== "ALL" && t?.department !== examDeptFilter) return false;
                if (examYearFilter !== "ALL" && t?.academicYear !== examYearFilter) return false;
                if (examSectionFilter !== "ALL" && t?.section !== examSectionFilter) return false;
                if (examBatchFilter !== "ALL" && t?.batchId !== examBatchFilter) return false;
              }
              return true;
            })
            .map((exam) => {
              const effStatus = getEffectiveExamStatus(exam);
              const att = getStudentAttemptForExam(exam.id);

              const getExamTargetDisplay = () => {
                const t = exam.targets?.[0];
                if (!t) return "All Students (Global)";
                if (t.type === "composite") {
                  const parts = [
                    t.collegeId && t.collegeId !== "ALL" ? t.collegeId : null,
                    t.department && t.department !== "ALL" ? t.department : null,
                    t.academicYear && t.academicYear !== "ALL" ? `Year ${t.academicYear}` : null,
                    t.section && t.section !== "ALL" ? `Sec ${t.section}` : null,
                    t.batchId && t.batchId !== "ALL" ? t.batchId : null,
                  ].filter(Boolean);
                  return parts.length > 0 ? parts.join(" → ") : "All Students (Global)";
                }
                const isGlobalId = !t.ids || t.ids.length === 0 || t.ids.includes("ALL") || t.ids.includes("composite");
                if (isGlobalId) return "All Students (Global)";
                return `${t.type.toUpperCase()}: ${t.ids.join(", ")}`;
              };

              return (
                <motion.div
                  key={exam.id}
                  whileHover={{ y: -4 }}
                  className="group relative rounded-3xl bg-white/70 dark:bg-slate-900/60 backdrop-blur-2xl border border-white/50 dark:border-white/10 p-6 flex flex-col justify-between gap-6 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] hover:shadow-[0_16px_40px_rgb(0,0,0,0.12)] hover:border-brand/40 transition-all duration-300"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`px-3 py-1 rounded-full text-[11px] font-extrabold tracking-wide uppercase flex items-center gap-1.5 ${
                        effStatus === "active" && !att
                          ? "bg-emerald-500/15 text-emerald-500"
                          : att || effStatus === "completed"
                          ? "bg-blue-500/15 text-blue-500"
                          : effStatus === "scheduled"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {effStatus === "active" && !att && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                        {att ? "COMPLETED" : effStatus === "active" ? "ACTIVE (LIVE)" : effStatus}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                        <Clock className="w-3.5 h-3.5 text-brand shrink-0" />
                        <span>{exam.duration} mins</span>
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <h3 className="text-xl font-extrabold text-foreground tracking-tight line-clamp-1 group-hover:text-brand transition-colors">
                        {exam.title}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed font-normal">
                        {exam.startTime
                          ? `Active window: ${new Date(exam.startTime).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                          : exam.description || "Assessment ready for students."}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 p-3.5 rounded-2xl bg-muted/30 dark:bg-white/[0.03] text-xs">
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-[11px] font-medium text-muted-foreground">Questions</span>
                      <p className="font-extrabold text-foreground text-sm mt-0.5">{exam.questions?.length || exam.questionIds?.length || 0}</p>
                    </div>
                    <div className="flex flex-col items-center justify-center">
                      <span className="text-[11px] font-medium text-muted-foreground">Total Marks</span>
                      <p className="font-extrabold text-brand text-sm mt-0.5">{exam.totalMarks} marks</p>
                    </div>
                  </div>

                  {userRole !== "student" ? (
                    <div className="space-y-4 pt-1">
                      <div className="space-y-2 rounded-2xl bg-muted/30 dark:bg-white/[0.02] p-3.5 text-xs">
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <Calendar className="w-3.5 h-3.5 text-brand shrink-0" />
                            <span>Assigned:</span>
                          </span>
                          <span className="font-semibold text-foreground">
                            {formatSafeDate(exam.createdAt || exam.updatedAt)}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <Clock className="w-3.5 h-3.5 text-brand shrink-0" />
                            <span>Window:</span>
                          </span>
                          <span className="font-semibold text-foreground truncate max-w-[170px]">
                            {exam.startTime ? formatSafeDate(exam.startTime, { month: "short", day: "numeric" }) : "Always Active"}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <Target className="w-3.5 h-3.5 text-brand shrink-0" />
                            <span>Audience:</span>
                          </span>
                          <span className="font-bold text-foreground truncate max-w-[170px]" title={getExamTargetDisplay()}>
                            {getExamTargetDisplay()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-muted-foreground">
                            Pass: <strong className="text-foreground">{exam.passingMarks}%</strong>
                          </span>
                          {exam.settings?.proctoring && (
                            <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold text-[10px]">
                              Proctored
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleDelete(exam.id)}
                          className="p-2 rounded-xl bg-destructive/10 hover:bg-destructive text-destructive hover:text-white transition-all duration-200"
                          title="Delete Assessment"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="pt-1 space-y-3">
                      {att ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-muted/40 text-xs font-semibold">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Earned Score:
                            </span>
                            <span className={`font-extrabold ${att.passed ? "text-emerald-500" : "text-red-500"}`}>{att.percentage}% ({att.passed ? "PASSED" : "REVIEW"})</span>
                          </div>
                          <Button
                            onClick={() => router.push("/results")}
                            variant="outline"
                            className="w-full h-11 rounded-2xl border-brand/40 text-brand hover:bg-brand/10 font-bold flex items-center justify-center gap-2"
                          >
                            <Eye className="w-4 h-4" />
                            <span>View Scorecard Transcript</span>
                          </Button>
                        </div>
                      ) : effStatus === "active" ? (
                        <Button
                          onClick={() => router.push(`/exams/${exam.id}/take`)}
                          className="w-full h-11 rounded-2xl bg-brand hover:bg-brand/90 text-white font-bold flex items-center justify-center gap-2 shadow-md shadow-brand/20 scale-[1.01] hover:scale-[1.02] transition-transform"
                        >
                          <Play className="w-4 h-4 fill-white" />
                          <span>Take Assessment Now</span>
                        </Button>
                      ) : effStatus === "scheduled" ? (
                        <Button
                          disabled
                          variant="outline"
                          className="w-full h-11 rounded-2xl border-amber-500/30 text-amber-600 dark:text-amber-400 font-bold flex items-center justify-center gap-2 opacity-80"
                        >
                          <Clock className="w-4 h-4" />
                          <span>Scheduled ({exam.startTime ? new Date(exam.startTime).toLocaleDateString() : "Later"})</span>
                        </Button>
                      ) : (
                        <Button
                          disabled
                          variant="outline"
                          className="w-full h-11 rounded-2xl border-border text-muted-foreground font-bold flex items-center justify-center gap-2"
                        >
                          <span>Assessment Closed</span>
                        </Button>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
            </div>
          )}

      {/* Test Creation Modal (Manual / Markdown) */}
      <AnimatePresence>
        {creationMode !== "none" && !isPreviewing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center font-bold">
                    {creationMode === "markdown" ? <FileCode className="w-5 h-5" /> : <Edit3 className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground">
                      {creationMode === "markdown" ? "Markdown Test Generator" : "Manual Examination Builder"}
                    </h3>
                    <p className="text-xs text-muted-foreground">Workflow: Build/Parse → Review/Edit Cards → Live Simulation Preview → Publish</p>
                  </div>
                </div>
                <button onClick={() => setCreationMode("none")} className="text-muted-foreground hover:text-foreground">
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Examination Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    placeholder="e.g. Mid-Term Java Core Assessment"
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Duration (Minutes)</label>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value === "" ? "" : parseInt(e.target.value) || 0)}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Passing Percentage (%)</label>
                  <input
                    type="number"
                    value={passingMarks}
                    onChange={(e) => setPassingMarks(e.target.value === "" ? "" : parseInt(e.target.value) || 0)}
                    className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none"
                  />
                </div>
              </div>

              {/* Scheduling Options */}
              <div className="p-3.5 rounded-xl bg-muted/30 border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4 text-brand" />
                    <span>Assessment Activation & Timing Window</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setScheduleMode("immediate")}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        scheduleMode === "immediate" ? "bg-brand text-white shadow" : "bg-card text-muted-foreground border border-border"
                      }`}
                    >
                      Active Immediately
                    </button>
                    <button
                      type="button"
                      onClick={() => setScheduleMode("scheduled")}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        scheduleMode === "scheduled" ? "bg-brand text-white shadow" : "bg-card text-muted-foreground border border-border"
                      }`}
                    >
                      Schedule Window
                    </button>
                  </div>
                </div>

                {scheduleMode === "scheduled" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted-foreground">Start Date & Time (Becomes Active)</span>
                      <input
                        type="datetime-local"
                        value={startTimeStr}
                        onChange={(e) => setStartTimeStr(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs font-semibold text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-muted-foreground">End Date & Time (Closes)</span>
                      <input
                        type="datetime-local"
                        value={endTimeStr}
                        onChange={(e) => setEndTimeStr(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg border border-border bg-background text-xs font-semibold text-foreground"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Markdown input box */}
              {creationMode === "markdown" && (
                <div className="space-y-3 p-4 rounded-xl bg-muted/40 border border-border">
                  <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-brand" />
                      <span>Paste Markdown Syntax (# Question X, Options A-D, Answer: X, Marks: X)</span>
                    </span>
                    <Button onClick={handleParseMarkdown} size="sm" className="bg-brand hover:bg-brand/90 text-white">
                      Parse & Generate Editable Cards
                    </Button>
                  </div>
                  <textarea
                    value={mdText}
                    onChange={(e) => setMdText(e.target.value)}
                    rows={6}
                    className="w-full p-3 rounded-xl border border-border bg-background font-mono text-xs text-foreground focus:outline-none"
                  />
                </div>
              )}

              {/* Editable Question Cards */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-foreground">Editable Question Cards ({questions.length})</h4>
                  {creationMode === "manual" && (
                    <div className="flex items-center gap-2">
                      <Button onClick={() => handleAddManualQuestion("mcq")} size="sm" variant="outline" className="text-brand border-brand font-semibold">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add MCQ
                      </Button>
                      <Button onClick={() => handleAddManualQuestion("fill-blank")} size="sm" variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-500 font-semibold">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Blank
                      </Button>
                    </div>
                  )}
                </div>

                {questions.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-border rounded-xl text-xs text-muted-foreground">
                    No questions generated yet. {creationMode === "markdown" ? "Click 'Parse & Generate Editable Cards' above." : "Click 'Add MCQ' or 'Add Blank'."}
                  </div>
                ) : (
                  <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                    {questions.map((q, idx) => (
                      <div key={q.id} className="p-4 rounded-xl border border-border bg-background space-y-3 text-xs">
                        <div className="flex items-center justify-between font-semibold">
                          <div className="flex items-center gap-2">
                            <span>Question #{idx + 1}</span>
                            <select
                              value={q.type || "mcq"}
                              onChange={(e) => {
                                const newType = e.target.value as any;
                                setQuestions(questions.map((item, i) => (i === idx ? {
                                  ...item,
                                  type: newType,
                                  options: newType === "mcq" ? (item.options?.length ? item.options : ["Option A", "Option B", "Option C", "Option D"]) : undefined,
                                  correctAnswer: newType === "mcq" ? (item.options?.[0] || "Option A") : (typeof item.correctAnswer === "string" ? item.correctAnswer : "")
                                } : item)));
                              }}
                              className="h-7 px-2 rounded border border-border bg-card text-xs font-bold text-brand focus:outline-none"
                            >
                              <option value="mcq">Multiple Choice (MCQ)</option>
                              <option value="fill-blank">Fill in the Blank</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <span>Marks:</span>
                            <input
                              type="number"
                              value={q.marks}
                              onChange={(e) => {
                                const m = parseInt(e.target.value) || 2;
                                setQuestions(questions.map((item, i) => (i === idx ? { ...item, marks: m } : item)));
                              }}
                              className="w-14 h-7 px-2 rounded border border-border bg-card text-center font-bold"
                            />
                            <button
                              onClick={() => setQuestions(questions.filter((_, i) => i !== idx))}
                              className="text-destructive hover:underline ml-2"
                            >
                              Remove
                            </button>
                          </div>
                        </div>

                        <input
                          type="text"
                          value={q.text}
                          onChange={(e) => setQuestions(questions.map((item, i) => (i === idx ? { ...item, text: e.target.value } : item)))}
                          className="w-full h-9 px-3 rounded-lg border border-border bg-card font-medium text-foreground focus:outline-none"
                        />

                        {q.type === "fill-blank" || q.type === "short-answer" ? (
                          <div className="flex items-center gap-2 pt-1">
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0">Correct Blank Answer:</span>
                            <input
                              type="text"
                              placeholder="Enter exact word or phrase..."
                              value={q.correctAnswer as string}
                              onChange={(e) => setQuestions(questions.map((item, i) => (i === idx ? { ...item, correctAnswer: e.target.value } : item)))}
                              className="flex-1 h-8 px-3 rounded border border-border bg-card font-semibold text-foreground focus:outline-none"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              {q.options?.map((opt, oIdx) => (
                                <div key={oIdx} className="flex items-center gap-2">
                                  <span className="font-bold text-muted-foreground">{String.fromCharCode(65 + oIdx)}.</span>
                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) => {
                                      const newOpts = [...(q.options || [])];
                                      newOpts[oIdx] = e.target.value;
                                      setQuestions(questions.map((item, i) => (i === idx ? { ...item, options: newOpts } : item)));
                                    }}
                                    className="w-full h-8 px-2 rounded border border-border bg-card focus:outline-none"
                                  />
                                </div>
                              ))}
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                              <span className="font-bold text-emerald-500">Correct Answer:</span>
                              <select
                                value={q.correctAnswer as string}
                                onChange={(e) => setQuestions(questions.map((item, i) => (i === idx ? { ...item, correctAnswer: e.target.value } : item)))}
                                className="h-8 px-2 rounded border border-border bg-card font-semibold text-foreground focus:outline-none"
                              >
                                {q.options?.map((opt, oIdx) => (
                                  <option key={oIdx} value={opt}>
                                    {String.fromCharCode(65 + oIdx)}. {opt}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Multi-Factor Assignment Targeting */}
              <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-3 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <Target className="w-4 h-4 text-brand" />
                  <span>Assignment Target</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Select filters to target specific students. Leave as &ldquo;All&rdquo; to include everyone in that category.</p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">College</label>
                    <select
                      value={targetCollege}
                      onChange={(e) => setTargetCollege(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg border border-border bg-background text-foreground text-xs font-semibold"
                    >
                      <option value="ALL">All Colleges</option>
                      {availableCollegeNames.map((colName) => (
                        <option key={colName} value={colName}>
                          {colName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Department</label>
                    <select
                      value={targetDepartment}
                      onChange={(e) => setTargetDepartment(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg border border-border bg-background text-foreground text-xs font-semibold"
                    >
                      <option value="ALL">All Departments</option>
                      {Array.from(new Set([
                        ...colleges.flatMap((c) => c.departments || []),
                        ...students.map((s) => s.department),
                      ])).filter(Boolean).map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Year</label>
                    <select
                      value={targetYear}
                      onChange={(e) => setTargetYear(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg border border-border bg-background text-foreground text-xs font-semibold"
                    >
                      <option value="ALL">All Years</option>
                      {Array.from(new Set(["1st Year", "2nd Year", "3rd Year", "4th Year", ...students.map((s) => s.academicYear).filter(Boolean)])).map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Section</label>
                    <select
                      value={targetSection}
                      onChange={(e) => setTargetSection(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg border border-border bg-background text-foreground text-xs font-semibold"
                    >
                      <option value="ALL">All Sections</option>
                      {Array.from(new Set(students.map((s) => s.section))).filter(Boolean).map((sec) => (
                        <option key={sec} value={sec}>{["A", "B", "C", "D"].includes(sec) ? `Section ${sec}` : sec}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Batch</label>
                    <select
                      value={targetBatch}
                      onChange={(e) => setTargetBatch(e.target.value)}
                      className="w-full h-9 px-2.5 rounded-lg border border-border bg-background text-foreground text-xs font-semibold"
                    >
                      <option value="ALL">All Batches</option>
                      {batches.map((b) => (
                        <option key={b.id} value={b.name}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Summary Badge */}
                <div className="flex items-center gap-1.5 pt-1 text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-brand" />
                  <span className="text-muted-foreground">Targeting:</span>
                  <span className="font-bold text-foreground">
                    {[targetCollege !== "ALL" ? targetCollege : null, targetDepartment !== "ALL" ? targetDepartment : null, targetYear !== "ALL" ? targetYear : null, targetSection !== "ALL" ? `Sec ${targetSection}` : null, targetBatch !== "ALL" ? targetBatch : null].filter(Boolean).join(" → ") || "All Students (Global)"}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-border">
                <Button
                  type="button"
                  onClick={() => setIsPreviewing(true)}
                  disabled={questions.length === 0}
                  variant="outline"
                  className="border-brand text-brand flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  <span>Preview Full Student Experience</span>
                </Button>

                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setCreationMode("none")}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={handlePublish}
                    disabled={!title || questions.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    <span>Publish & Assign Test</span>
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Trainer Preview Simulation Modal */}
        {isPreviewing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl border border-brand bg-card text-foreground p-6 shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between border-b border-border pb-4">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono text-xs font-bold border border-amber-500/30">
                    TRAINER PREVIEW SIMULATION
                  </span>
                  <h3 className="text-lg font-bold text-foreground">{title || "Untitled Assessment"}</h3>
                </div>
                <Button
                  onClick={() => setIsPreviewing(false)}
                  variant="outline"
                  className="border-border text-foreground text-xs font-semibold flex items-center gap-2 hover:bg-accent"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Return to Editing</span>
                </Button>
              </div>

              {/* Simulation Header */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-muted/40 border border-border text-xs">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-brand" />
                  <span className="text-muted-foreground">Remaining Time: <strong className="font-mono text-sm text-foreground">{duration}:00</strong></span>
                </div>
                <div>
                  <span className="text-muted-foreground">Question: <strong className="text-foreground">{previewQIdx + 1} of {questions.length}</strong></span>
                </div>
                <div className="text-right">
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">Live Experience Simulation</span>
                </div>
              </div>

              {/* Question card */}
              {questions[previewQIdx] && (
                <div className="p-6 rounded-2xl bg-muted/20 border border-border space-y-6 shadow-sm">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <span className="font-bold text-sm text-foreground">Question #{previewQIdx + 1}</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-brand/15 text-brand font-bold text-xs border border-brand/20">
                      {questions[previewQIdx].marks || 2} Marks
                    </span>
                  </div>

                  <p className="text-base font-semibold leading-relaxed text-foreground">{questions[previewQIdx].text}</p>

                  {questions[previewQIdx].type === "fill-blank" || questions[previewQIdx].type === "short-answer" ? (
                    <div className="space-y-2 pt-2">
                      <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Type your answer in the blank below:</label>
                      <input
                        type="text"
                        placeholder="Enter your exact answer here..."
                        value={previewAnswers[questions[previewQIdx].id] || ""}
                        onChange={(e) => setPreviewAnswers({ ...previewAnswers, [questions[previewQIdx].id]: e.target.value })}
                        className="w-full h-11 px-4 rounded-xl border border-border bg-background text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-brand shadow-sm"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 pt-2">
                      {questions[previewQIdx].options?.map((opt, idx) => {
                        const isSelected = previewAnswers[questions[previewQIdx].id] === opt;
                        return (
                          <button
                            key={idx}
                            onClick={() => setPreviewAnswers({ ...previewAnswers, [questions[previewQIdx].id]: opt })}
                            className={`p-3.5 rounded-xl border text-left text-sm font-medium transition-all flex items-center gap-3 ${
                              isSelected
                                ? "bg-brand/15 border-brand text-foreground font-bold shadow-sm ring-1 ring-brand"
                                : "border-border bg-background hover:bg-accent/40 text-foreground"
                            }`}
                          >
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              isSelected ? "bg-brand text-white" : "bg-muted text-muted-foreground border border-border"
                            }`}>
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <span>{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Navigation Palette */}
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <Button
                  onClick={() => setPreviewQIdx(Math.max(0, previewQIdx - 1))}
                  disabled={previewQIdx === 0}
                  variant="outline"
                  className="border-border text-foreground font-semibold hover:bg-accent"
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" /> Previous
                </Button>

                <div className="flex flex-wrap gap-2 p-1.5">
                  {questions.map((_, i) => {
                    const isCurrent = previewQIdx === i;
                    const hasAnswer = previewAnswers[questions[i]?.id];
                    let badgeStyle = "bg-muted text-muted-foreground border border-border hover:bg-accent font-semibold";
                    if (isCurrent) badgeStyle = "bg-brand text-white ring-2 ring-foreground font-extrabold shadow-md scale-110 z-10";
                    else if (hasAnswer) badgeStyle = "bg-emerald-600 text-white font-bold shadow-sm";

                    return (
                      <button
                        key={i}
                        onClick={() => setPreviewQIdx(i)}
                        className={`w-9 h-9 rounded-lg text-xs flex items-center justify-center transition-all ${badgeStyle}`}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>

                <Button
                  onClick={() => setPreviewQIdx(Math.min(questions.length - 1, previewQIdx + 1))}
                  disabled={previewQIdx === questions.length - 1}
                  className="bg-brand hover:bg-brand/90 text-white font-semibold shadow-sm"
                >
                  Next <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
