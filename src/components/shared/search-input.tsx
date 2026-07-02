"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { forwardRef, type InputHTMLAttributes } from "react";

interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
}

const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, containerClassName, ...props }, ref) => {
    return (
      <div className={cn("relative", containerClassName)}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <input
          ref={ref}
          type="text"
          className={cn(
            "w-full h-10 pl-10 pr-4 rounded-xl glass-input text-sm text-foreground",
            "placeholder:text-muted-foreground/60 focus:outline-none",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);
SearchInput.displayName = "SearchInput";

export { SearchInput };
