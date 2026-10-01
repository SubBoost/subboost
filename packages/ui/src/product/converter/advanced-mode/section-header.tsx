"use client";

import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export function SectionHeader({
  icon: Icon,
  title,
  badge,
  isExpanded,
  onToggle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-ink/5 transition-colors"
    >
      {isExpanded ? (
        <ChevronDown className="h-4 w-4 text-fg-50" />
      ) : (
        <ChevronRight className="h-4 w-4 text-fg-50" />
      )}
      <Icon className="h-4 w-4 text-indigo-400" />
      <span className="text-sm font-medium text-fg">{title}</span>
      {badge}
    </button>
  );
}

