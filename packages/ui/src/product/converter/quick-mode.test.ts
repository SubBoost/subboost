import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const captures = vi.hoisted(() => ({ templatesSection: undefined as any }));

vi.mock("./quick-mode/sources-section", () => ({
  SourcesSection: () => React.createElement("div", null, "sources-section"),
}));

vi.mock("./quick-mode/templates-section", () => ({
  TemplatesSection: (props: any) => {
    captures.templatesSection = props;
    return React.createElement("div", null, "templates-section");
  },
}));

import { QuickMode } from "./quick-mode";

describe("QuickMode", () => {
  it("renders sources before templates", () => {
    const html = renderToStaticMarkup(React.createElement(QuickMode));

    expect(html).toContain("sources-section");
    expect(html).toContain("templates-section");
    expect(html.indexOf("sources-section")).toBeLessThan(html.indexOf("templates-section"));
  });

  it("passes the template upload entry to the template picker", () => {
    const templateUpload = { href: "/templates?upload=1", onOpen: vi.fn() };

    renderToStaticMarkup(React.createElement(QuickMode, { templateUpload }));

    expect(captures.templatesSection).toEqual({ templateUpload });
  });
});
