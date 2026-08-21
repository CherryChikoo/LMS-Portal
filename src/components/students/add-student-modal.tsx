"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createPortal } from "react-dom";

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
        toast.success(`Student added successfully! Temporary password: ${result.password || "Check email"}`);
        onSuccess();
        onClose();
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

  const modalContent = (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
      >
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h3 className="text-lg font-bold text-foreground">Add Student</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
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
    </div>
  );

  return typeof window !== "undefined" ? createPortal(modalContent, document.body) : null;
}
