"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { HelpCircle, MessageSquare, Send, CheckCircle2, Clock, User, Filter, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { fadeInUp } from "@/lib/animations";
import { getAllDoubts, createDoubt, replyToDoubt } from "@/lib/services";
import type { DoubtThread } from "@/types";

export default function DoubtsPage() {
  const [doubts, setDoubts] = useState<DoubtThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<"trainer" | "student">("student");

  // Ask doubt state
  const [showAskModal, setShowAskModal] = useState(false);
  const [subject, setSubject] = useState("Computer Science");
  const [topic, setTopic] = useState("Data Structures");
  const [question, setQuestion] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reply state
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const fetchDoubts = async () => {
    setLoading(true);
    try {
      const data = await getAllDoubts();
      setDoubts(data);
    } catch (err) {
      console.error("Failed to load doubts", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoubts();
  }, []);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question) return;
    setSubmitting(true);
    try {
      await createDoubt({
        studentId: "stud-1",
        studentName: "Jason Ranti",
        subject,
        topic,
        question,
        status: "open",
        collegeId: "SIT",
        replies: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      setShowAskModal(false);
      setQuestion("");
      fetchDoubts();
    } catch (err) {
      console.error("Failed to post doubt", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async (id: string) => {
    if (!replyText.trim()) return;
    try {
      await replyToDoubt(id, {
        id: `rep-${Date.now()}`,
        authorId: userRole === "trainer" ? "train-1" : "stud-1",
        authorName: userRole === "trainer" ? "Prof. Alan Turing (Trainer)" : "Jason Ranti",
        role: userRole,
        text: replyText,
        createdAt: new Date(),
      });
      setReplyText("");
      setReplyingId(null);
      fetchDoubts();
    } catch (err) {
      console.error("Reply failed", err);
    }
  };

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeInUp} className="space-y-6">
      <PageHeader
        title="Academic Q&A Forum"
        description="Ask conceptual doubts, resolve query threads, and collaborate across colleges and departments."
        actions={
          <div className="flex items-center gap-3">
            <Button onClick={() => setShowAskModal(true)} className="bg-brand hover:bg-brand/90 text-white flex items-center gap-2">
              <Plus className="w-4 h-4" />
              <span>Ask Academic Doubt</span>
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="p-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <span>Loading discussion board...</span>
        </div>
      ) : doubts.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title="No doubt threads posted yet"
          description="Have a question about a lecture or assessment? Post your academic query to get answers from trainers and peers."
          actionLabel={userRole === "student" ? "Ask First Question" : undefined}
          onAction={userRole === "student" ? () => setShowAskModal(true) : () => {}}
        />
      ) : (
        <div className="space-y-4">
          {doubts.map((d) => (
            <motion.div
              key={d.id}
              className="rounded-2xl border border-border bg-card/60 backdrop-blur-md p-6 space-y-4 shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-sm">
                    {d.studentName?.slice(0, 2).toUpperCase() || "JR"}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-foreground">{d.studentName}</h4>
                    <p className="text-xs text-muted-foreground">Subject: {d.subject} • Topic: {d.topic}</p>
                  </div>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                    d.status === "resolved"
                      ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                  }`}
                >
                  {d.status === "resolved" ? "Resolved" : "Open Query"}
                </span>
              </div>

              <p className="text-sm text-foreground font-medium pl-1 leading-relaxed">{d.question}</p>

              {/* Replies */}
              {d.replies && d.replies.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border pl-4">
                  {d.replies.map((rep) => (
                    <div key={rep.id} className="p-3 rounded-xl bg-muted/40 border border-border text-xs space-y-1">
                      <div className="flex items-center justify-between font-semibold text-foreground">
                        <span className="flex items-center gap-1.5">
                          <span className={rep.role === "trainer" ? "text-brand" : "text-muted-foreground"}>
                            {rep.authorName}
                          </span>
                        </span>
                        <span className="text-[10px] text-muted-foreground uppercase">{rep.role}</span>
                      </div>
                      <p className="text-slate-300">{rep.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply Box */}
              <div className="pt-2 flex items-center gap-2">
                {replyingId === d.id ? (
                  <div className="flex-1 flex gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Write educational explanation..."
                      className="flex-1 h-9 px-3 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none"
                    />
                    <Button onClick={() => handleReply(d.id)} size="sm" className="bg-brand text-white">
                      Reply
                    </Button>
                    <Button onClick={() => setReplyingId(null)} size="sm" variant="outline">
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <button
                    onClick={() => setReplyingId(d.id)}
                    className="text-xs font-semibold text-brand hover:underline flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Post Reply / Answer</span>
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Ask Doubt Modal */}
      <AnimatePresence>
        {showAskModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-lg font-bold text-foreground">Ask Academic Doubt</h3>
                <button onClick={() => setShowAskModal(false)} className="text-muted-foreground hover:text-foreground">
                  ✕
                </button>
              </div>

              <form onSubmit={handleAsk} className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Subject</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      required
                      placeholder="Computer Science"
                      className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-foreground">Topic / Lecture</label>
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      required
                      placeholder="Data Structures"
                      className="w-full h-10 px-3 rounded-xl border border-border bg-background text-sm text-foreground focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-foreground">Your Question</label>
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    required
                    rows={4}
                    placeholder="Describe your doubt in detail..."
                    className="w-full p-3 rounded-xl border border-border bg-background text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowAskModal(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting} className="bg-brand text-white hover:bg-brand/90">
                    {submitting ? "Posting..." : "Post Question"}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
