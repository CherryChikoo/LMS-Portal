"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { syncCollegeDepartmentsAction } from "@/lib/actions/sync-departments-action";

export default function SyncDepartmentsPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSync = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await syncCollegeDepartmentsAction();
      setResult(res);
    } catch (error) {
      setResult({ success: false, error: String(error) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Sync College Departments</h1>
      <p className="text-muted-foreground mb-6">
        This will update all college records to include all departments that students are enrolled in.
      </p>

      <Button 
        onClick={handleSync} 
        disabled={loading}
        className="mb-6"
      >
        {loading ? "Syncing..." : "Sync Departments"}
      </Button>

      {result && (
        <div className={`p-4 rounded-lg ${result.success ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'}`}>
          <h2 className="font-bold mb-2">{result.success ? '✅ Success!' : '❌ Error'}</h2>
          {result.error && <p>{result.error}</p>}
          {result.results && (
            <div className="mt-4">
              <pre className="text-xs overflow-auto max-h-96">
                {JSON.stringify(result.results, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
