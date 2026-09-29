import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormField } from "./form-field";

describe("FormField label actions", () => {
  it("keeps the field label associated with its input and the toggle outside that label", () => {
    const html = renderToStaticMarkup(React.createElement(FormField, {
      id: "keep-regex", label: "保留正则", description: "每行一条。", descriptionPlacement: "before-control",
      labelAction: React.createElement("button", { type: "button", role: "switch", "aria-label": "启用保留正则", "aria-checked": true }),
    }, React.createElement("textarea")));
    expect(html).toContain('for="keep-regex"');
    expect(html).toContain('id="keep-regex"');
    expect(html).toContain('aria-describedby="keep-regex-description"');
    expect(html.indexOf("</label>")).toBeLessThan(html.indexOf('<button'));
    expect(html).toContain('role="switch"');
  });
});
