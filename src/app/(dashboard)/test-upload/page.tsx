"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";

export default function TestUploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    console.log("Minimal React Test: Button clicked, invoking file picker natively.");
    fileInputRef.current?.click();
  };

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-xl font-bold">Minimal React File Upload Test</h1>
      <p>This page tests if a single button and hidden input in React causes the freeze.</p>
      
      <Button onClick={handleClick}>Open File Picker (Minimal React)</Button>
      
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: "none" }} 
        onChange={(e) => {
          console.log("Minimal React Test: File selected", e.target.files);
        }}
      />
    </div>
  );
}
