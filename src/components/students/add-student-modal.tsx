"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createPortal } from "react-dom";
import { UserCheck, Copy, X } from "lucide-react";

export function AddStudentModal({
  isOpen,
  onClose,
  onSuccess,
  colleges,
  departments,
  years,
  sections,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  colleges: any[];
  departments: string[];
  years: string[];
  sections: string[];
}) {
  const [loading, setLoading] = useState(false);
  const [createdStudent, setCreatedStudent] = useState<{name: string, email: string, password: string} | null>(null);
  
  const [formData, setFormData] = useState({
    studentName: "",
    collegeEmail: "",
    college: "",
    department: "",
    academicYear: "",
    section: "",
  });

  const modalDepartments = Array.from(new Set(["Computer Science", "Engineering", "Business", ...departments]));
  const modalYears = Array.from(new Set(["1st Year", "2nd Year", "3rd Year", "4th Year", ...years]));
  const modalSections = Array.from(new Set(["A", "B", "C", "D", ...sections]));

  useEffect(() => {
    if (isOpen) {
      setCreatedStudent(null);
      setFormData({
        studentName: "",
        collegeEmail: "",
        college: colleges.length > 0 ? colleges[0].id : "",
        department: "Computer Science",
        academicYear: "1st Year",
        section: "A",
      });
    }
  }, [isOpen, colleges]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate email format
    if (!formData.collegeEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.collegeEmail)) {
      toast.error("Please enter a valid email address.");
      return;
    }
    
    // Validate name
    if (!formData.studentName || formData.studentName.trim().length < 2) {
      toast.error("Please enter a valid student name (at least 2 characters).");
      return;
    }
    
    setLoading(true);

    try {
      // Get authentication token
      const { supabase } = await import("@/lib/supabase/client");
      const { data: sessionData } = await supabase.auth.getSession();
      let adminIdToken = sessionData.session?.access_token || "";
      
      if (!adminIdToken) {
        const refresh = await supabase.auth.refreshSession();
        adminIdToken = refresh.data.session?.access_token || "";
      }
      
      if (!adminIdToken) {
        toast.error("Authentication required. Please log in again.");
        setLoading(false);
        return;
      }

      // Check if email already exists (client-side pre-validation)
      const normalizedEmail = formData.collegeEmail.toLowerCase().trim();
      
      const { data: existingUser } = await supabase
        .from("users")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle();
      
      if (existingUser) {
        toast.error("A user with this email already exists.");
        setLoading(false);
        return;
      }

      const selectedCollege = colleges.find(c => c.id === formData.college);
      const payload = {
        adminIdToken,
        rows: [{
          ...formData,
          collegeEmail: normalizedEmail,
          college: selectedCollege?.name || "Unassigned"
        }],
        enrollmentType: "manual"
      };

      const res = await fetch("/api/admin/bulk-import-students", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${adminIdToken}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || errorData.details || `HTTP ${res.status}`);
      }

      const data = await res.json();
      
      if (!data.success || !data.summary) {
        throw new Error(data.error || "Failed to add student");
      }
      
      const result = data.summary.results?.[0];
      
      if (result?.status === "failed") {
        toast.error(result.reason || "Failed to add student.");
      } else if (result?.status === "duplicate") {
        toast.error("A student with this email already exists.");
      } else if (result?.status === "created") {
        toast.success("Student added successfully!");
        setCreatedStudent({
          name: formData.studentName,
          email: formData.collegeEmail,
          password: result.password || "Check email"
        });
        onSuccess();
        // Do not close immediately so they can see the password
      } else {
        toast.success("Student added successfully!");
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      console.error("Add student error:", err);
      const message = err.message || "An error occurred while adding the student.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const copyPassword = () => {
    if (createdStudent?.password) {
      navigator.clipboard.writeText(createdStudent.password);
      toast.success("Password copied to clipboard!");
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <AnimatePresence mode="wait">
        {!createdStudent ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-lg font-bold text-foreground">Add Student</h3>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Full Name</label>
                  <input
                    type="text"
                    required
                    value={formData.studentName}
                    onChange={e => setFormData({ ...formData, studentName: e.target.value })}
                    placeholder="e.g. John Doe"
                    className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Email</label>
                  <input
                    type="email"
                    required
                    value={formData.collegeEmail}
                    onChange={e => setFormData({ ...formData, collegeEmail: e.target.value })}
                    placeholder="john@example.com"
                    className="w-full h-9 px-3 rounded-xl border border-border bg-background text-foreground"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">College</label>
                <select
                  value={formData.college}
                  onChange={e => setFormData({ ...formData, college: e.target.value })}
                  className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground"
                >
                  <option value="">Unassigned</option>
                  {colleges.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Department</label>
                  <select
                    required
                    value={formData.department}
                    onChange={e => setFormData({ ...formData, department: e.target.value })}
                    className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground"
                  >
                    {modalDepartments.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Year</label>
                  <select
                    required
                    value={formData.academicYear}
                    onChange={e => setFormData({ ...formData, academicYear: e.target.value })}
                    className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground"
                  >
                    {modalYears.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Section</label>
                  <select
                    required
                    value={formData.section}
                    onChange={e => setFormData({ ...formData, section: e.target.value })}
                    className="w-full h-9 px-2 rounded-xl border border-border bg-background text-foreground"
                  >
                    {modalSections.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className="bg-brand text-brand-foreground">
                  {loading ? "Adding..." : "Add Student"}
                </Button>
              </div>
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-[420px] rounded-[24px] border border-border/40 bg-[#0f0f11] p-6 shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden"
          >
            {/* Soft background glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-32 bg-emerald-500/10 blur-[50px] pointer-events-none" />
            
              <div className="flex justify-end relative z-10">
                 <button onClick={onClose} className="text-muted-foreground/60 hover:text-white transition-colors">
                   <X size={16} />
                 </button>
              </div>
              
              {/* Header: Logo and Title separate & centered */}
              <div className="flex flex-col items-center justify-center gap-4 mt-2 relative z-10 mb-6 text-center w-full">
                <div className="w-[60px] h-[60px] rounded-full border border-emerald-500/20 bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0 shadow-[0_0_20px_rgba(16,185,129,0.25)]">
                  <UserCheck size={30} strokeWidth={2.5} />
                </div>
                <h3 className="text-2xl font-bold text-white">Student Account Created</h3>
              </div>
              
              {/* Centered Content Below */}
              <div className="flex flex-col items-center text-center relative z-10">
                 <p className="text-[14px] text-slate-300 leading-relaxed max-w-[90%]">
                   The account for <span className="font-semibold text-white">{createdStudent.name}</span> has been successfully provisioned.
                 </p>
                 <p className="text-[13px] text-emerald-400/80 font-medium mt-1 truncate max-w-full">
                   {createdStudent.email}
                 </p>
                 
                 <div className="mt-6 w-full max-w-sm text-left flex flex-col gap-2">
                   <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Generated Password</span>
                   <div className="flex items-center gap-2">
                     <div className="flex-1 p-3 rounded-xl bg-black/60 border border-white/10 font-mono text-emerald-400 text-sm font-semibold tracking-wide shadow-inner text-center">
                       {createdStudent.password}
                     </div>
                     <Button 
                       onClick={copyPassword} 
                       size="icon" 
                       className="h-[46px] w-[46px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white shrink-0 transition-colors"
                     >
                       <Copy size={18} />
                     </Button>
                   </div>
                   
                   <p className="text-[11px] text-muted-foreground/80 leading-relaxed mt-3 bg-white/5 p-3 rounded-lg border border-white/5 text-center">
                     Please copy and securely share this password with the student. For security reasons, it will not be shown again.
                   </p>
                 </div>
              </div>
              
              <div className="flex justify-center gap-3 mt-8 pt-4 border-t border-white/5 relative z-10 w-full">
               <Button variant="outline" onClick={onClose} className="bg-transparent border-white/10 hover:bg-white/5 text-white h-10 px-6 rounded-xl text-sm font-medium">
                 Close
               </Button>
               <Button onClick={copyPassword} className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 h-10 px-6 rounded-xl text-sm font-semibold shadow-lg shadow-emerald-900/20">
                 Copy Password
               </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return typeof window !== "undefined" ? createPortal(modalContent, document.body) : null;
}
