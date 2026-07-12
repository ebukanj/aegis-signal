"use client";

import { Download, FileText, Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

/**
 * Export toolbar with placeholder actions for PDF, CSV, Print, and Share.
 * No actual export functionality — the backend Reports module will own that.
 */
export function ExportToolbar() {
  const handlePlaceholder = (action: string) => {
    toast.info(`${action} — available when the Reports module ships.`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="size-3.5" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handlePlaceholder("Export PDF")}>
          <FileText className="mr-2 size-3.5" />
          Export PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePlaceholder("Export CSV")}>
          <Download className="mr-2 size-3.5" />
          Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePlaceholder("Print Report")}>
          <Printer className="mr-2 size-3.5" />
          Print Report
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handlePlaceholder("Share Report")}>
          <Share2 className="mr-2 size-3.5" />
          Share Report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
