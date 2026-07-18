import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { Switch } from "./switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

vi.mock("@radix-ui/react-dialog", async () => {
  const React = await import("react");

  const createPrimitive = (tag: keyof React.JSX.IntrinsicElements, displayName: string) => {
    const Component = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
      ({ children, ...props }, ref) => React.createElement(tag, { ...props, ref }, children)
    );
    Component.displayName = displayName;
    return Component;
  };

  const Root = ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children);
  Root.displayName = "DialogRoot";

  return {
    Root,
    Trigger: createPrimitive("button", "DialogTrigger"),
    Portal: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
    Close: createPrimitive("button", "DialogClose"),
    Overlay: createPrimitive("div", "DialogOverlay"),
    Content: createPrimitive("div", "DialogContent"),
    Title: createPrimitive("h2", "DialogTitle"),
    Description: createPrimitive("p", "DialogDescription"),
  };
});

describe("Radix UI wrappers", () => {
  it("renders avatar, dialog, switch, and tabs wrappers with merged classes", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        "div",
        null,
        React.createElement(
          Avatar,
          { className: "avatar-extra" },
          React.createElement(AvatarImage, { src: "https://example.com/avatar.png", alt: "avatar" }),
          React.createElement(AvatarFallback, { className: "fallback-extra" }, "RY")
        ),
        React.createElement(
          Dialog,
          { open: true },
          React.createElement(DialogTrigger, null, "Open"),
          React.createElement(
            DialogContent,
            { className: "dialog-extra" },
            React.createElement(DialogHeader, { className: "header-extra" }, React.createElement(DialogTitle, null, "Title")),
            React.createElement(DialogDescription, null, "Description"),
            React.createElement(DialogFooter, { className: "footer-extra" }, "Footer")
          )
        ),
        React.createElement(Switch, { checked: true, className: "switch-extra" }),
        React.createElement(
          Tabs,
          { defaultValue: "one" },
          React.createElement(TabsList, { className: "tabs-list-extra" }, React.createElement(TabsTrigger, { value: "one" }, "One")),
          React.createElement(TabsContent, { value: "one", className: "tabs-content-extra" }, "Panel")
        )
      )
    );

    expect(html).toContain("avatar-extra");
    expect(html).toContain("fallback-extra");
    expect(html).toContain("dialog-extra");
    expect(html).toContain("关闭");
    expect(html).toContain("header-extra");
    expect(html).toContain("footer-extra");
    expect(html).toContain("switch-extra");
    expect(html).toContain("tabs-list-extra");
    expect(html).toContain("tabs-content-extra");
  });
});
