import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

function mockPrimitive(tag: keyof React.JSX.IntrinsicElements, displayName: string) {
  const Component = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
    ({ children, ...props }, ref) => React.createElement(tag, { ...props, ref }, children)
  );
  Component.displayName = displayName;
  return Component;
}

vi.mock("@radix-ui/react-label", () => ({ Root: mockPrimitive("label", "LabelRoot") }));

import {
  artisticNavContainerClassName,
  artisticTabsIconClassName,
  artisticTabsListClassName,
  artisticTabsTriggerClassName,
  getArtisticNavButtonClassName,
  getArtisticNavIconClassName,
} from "./artistic-nav";
import { Label } from "./label";
import { ProtocolBadge, getProtocolBadgeClass } from "./protocol-badge";
import { SafeImage } from "./safe-image";
import { Textarea } from "./textarea";

describe("additional basic UI components", () => {
  it("renders label, textarea, protocol badges, and safe images", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        "div",
        null,
        React.createElement(Label, { htmlFor: "name", className: "label-extra" }, "Name"),
        React.createElement(Textarea, { placeholder: "Write", className: "textarea-extra", readOnly: true }),
        React.createElement(ProtocolBadge, { type: "VMess", className: "badge-extra" }),
        React.createElement(SafeImage, { src: "https://example.test/a.png", alt: "avatar", fallback: React.createElement("span", null, "fallback") }),
        React.createElement(SafeImage, { src: null, fallback: React.createElement("span", null, "fallback") })
      )
    );

    expect(html).toContain("label-extra");
    expect(html).toContain("Name");
    expect(html).toContain("textarea-extra");
    expect(html).toContain("placeholder=\"Write\"");
    expect(html).toContain("VMess");
    expect(html).toContain("badge-extra");
    expect(html).toContain("src=\"https://example.test/a.png\"");
    expect(html).toContain("fallback");
  });

  it("computes protocol and artistic nav classes", () => {
    expect(getProtocolBadgeClass(" vmess ")).toContain("purple");
    expect(getProtocolBadgeClass("unknown")).toContain("slate");
    expect(getArtisticNavButtonClassName({ active: true, size: "md", className: "extra" })).toContain("extra");
    expect(getArtisticNavButtonClassName({ active: true, size: "md" })).toContain("text-white");
    expect(getArtisticNavButtonClassName({ active: false })).toContain("hover:bg-white/5");
    expect(getArtisticNavIconClassName(true, "icon-extra")).toContain("icon-extra");
    expect(getArtisticNavIconClassName(false)).toContain("text-white/45");
    expect(artisticNavContainerClassName).toContain("rounded-full");
    expect(artisticTabsListClassName).toContain("h-auto");
    expect(artisticTabsTriggerClassName).toContain("data-[state=active]");
    expect(artisticTabsIconClassName).toContain("group-data-[state=active]");
  });
});
