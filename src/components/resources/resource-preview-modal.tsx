"use client";

import { useMemo } from "react";
import { ExternalLink, FileX, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Resource } from "@/types";

export const PREVIEWABLE_TYPES: Resource["type"][] = ["pdf", "image", "video", "link"];

export function isPreviewable(resource: Resource | null): boolean {
  return !!resource && !!resource.url && PREVIEWABLE_TYPES.includes(resource.type);
}

interface ResourcePreviewModalProps {
  resource: Resource | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ResourcePreviewModal({
  resource,
  isOpen,
  onClose,
}: ResourcePreviewModalProps) {
  const viewer = useMemo(() => {
    if (!resource?.url) {
      return (
        <FallbackCard
          title="No preview URL"
          message="This resource does not have an accessible URL."
        />
      );
    }

    switch (resource.type) {
      case "pdf":
        return (
          <iframe
            src={resource.url}
            title={resource.title}
            className="w-full h-full min-h-[60vh] rounded-lg border bg-white"
          />
        );

      case "image":
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resource.url}
            alt={resource.title}
            className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm"
          />
        );

      case "video":
        return (
          <video
            src={resource.url}
            controls
            className="w-full max-h-[70vh] rounded-lg bg-black"
          >
            Your browser does not support the video tag.
          </video>
        );

      case "link":
        return (
          <ExternalLinkCard
            title={resource.title}
            url={resource.url}
            description={resource.description}
          />
        );

      default:
        return (
          <FallbackCard
            title="Preview not available"
            message={`${resource.type.toUpperCase()} files cannot be previewed inline. Open the file using the link below.`}
            url={resource.url}
          />
        );
    }
  }, [resource]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-5 border-b border-border">
          <DialogTitle className="line-clamp-1 pr-6">{resource?.title}</DialogTitle>
          {resource?.description && (
            <DialogDescription className="line-clamp-2">
              {resource.description}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="flex-1 overflow-auto p-5 bg-muted/30 flex items-center justify-center min-h-[50vh]">
          {viewer}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExternalLinkCard({
  title,
  url,
  description,
}: {
  title: string;
  url: string;
  description?: string;
}) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm space-y-4">
      <div className="mx-auto w-14 h-14 rounded-full bg-brand/10 flex items-center justify-center">
        <LinkIcon className="w-7 h-7 text-brand" />
      </div>
      <div className="space-y-1">
        <h4 className="font-bold text-foreground">{title}</h4>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {description || "This resource links to an external website."}
        </p>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex"
      >
        <Button className="bg-brand hover:bg-brand/90 text-white gap-2">
          <ExternalLink className="w-4 h-4" />
          Open External Link
        </Button>
      </a>
    </div>
  );
}

function FallbackCard({
  title,
  message,
  url,
}: {
  title: string;
  message: string;
  url?: string;
}) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm space-y-4">
      <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center">
        <FileX className="w-7 h-7 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h4 className="font-bold text-foreground">{title}</h4>
        <p className="text-xs text-muted-foreground">{message}</p>
      </div>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex">
          <Button variant="outline" className="gap-2">
            <ExternalLink className="w-4 h-4" />
            Open Link
          </Button>
        </a>
      )}
    </div>
  );
}
