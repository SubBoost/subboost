"use client";

import { SourcesSection } from "./quick-mode/sources-section";
import { TemplatesSection, type QuickTemplateUploadEntry } from "./quick-mode/templates-section";

type Props = {
  templateUpload?: QuickTemplateUploadEntry | null;
};

export function QuickMode({ templateUpload }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <SourcesSection />
      <TemplatesSection templateUpload={templateUpload} />
    </div>
  );
}
