import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

type CapturedToastRootProps = React.HTMLAttributes<HTMLElement> & {
  onOpenChange?: (open: boolean) => void;
};

const primitiveCaptures = vi.hoisted(() => ({
  roots: [] as CapturedToastRootProps[],
}));

vi.mock("@radix-ui/react-toast", async () => {
  const React = await import("react");

  const createPrimitive = (
    tag: keyof React.JSX.IntrinsicElements,
    displayName: string,
    capture?: (props: React.HTMLAttributes<HTMLElement> & { altText?: string }) => void,
  ) => {
    const Component = React.forwardRef<
      HTMLElement,
      React.HTMLAttributes<HTMLElement> & { altText?: string }
    >(
      ({ children, altText: _altText, ...props }, ref) => {
        capture?.(props);
        return React.createElement(tag, { ...props, ref }, children);
      }
    );
    Component.displayName = displayName;
    return Component;
  };

  return {
    Provider: createPrimitive("div", "ToastProvider"),
    Viewport: createPrimitive("div", "ToastViewport"),
    Root: createPrimitive("div", "ToastRoot", (props) => primitiveCaptures.roots.push(props as CapturedToastRootProps)),
    Action: createPrimitive("button", "ToastAction"),
    Close: createPrimitive("button", "ToastClose"),
    Title: createPrimitive("div", "ToastTitle"),
    Description: createPrimitive("div", "ToastDescription"),
  };
});

async function loadToasterModule() {
  vi.resetModules();
  return import("./toaster");
}

describe("toaster primitives", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
    primitiveCaptures.roots = [];
  });

  it("renders primitive wrappers with merged classes and close attributes", async () => {
    const {
      ToastProvider,
      ToastViewport,
      Toast,
      ToastTitle,
      ToastDescription,
      ToastClose,
      ToastAction,
    } = await loadToasterModule();

    const html = renderToStaticMarkup(
      React.createElement(
        ToastProvider,
        null,
        React.createElement(
          Toast,
          { variant: "warning", className: "toast-extra" },
          React.createElement(ToastTitle, { className: "title-extra" }, "Title"),
          React.createElement(ToastDescription, { className: "description-extra" }, "Description"),
          React.createElement(ToastAction, { className: "action-extra", altText: "Retry" }, "Retry"),
          React.createElement(ToastClose, { className: "close-extra" })
        ),
        React.createElement(ToastViewport, { className: "viewport-extra" })
      )
    );

    expect(html).toContain("toast-extra");
    expect(html).toContain("border-amber-500/30");
    expect(html).toContain("title-extra");
    expect(html).toContain("description-extra");
    expect(html).toContain("action-extra");
    expect(html).toContain("close-extra");
    expect(html).toContain('toast-close=""');
    expect(html).toContain("viewport-extra");
  });

  it("adds, limits, updates, dismisses, and renders queued toasts", async () => {
    vi.useFakeTimers();
    const { toast, Toaster } = await loadToasterModule();

    toast({ title: "Oldest", variant: "default" });
    toast({ title: "Success", variant: "success" });
    toast({ title: "Warning", variant: "warning" });
    toast({ title: "Info", description: "Details", variant: "info" });
    const destructive = toast({ title: "Before update", variant: "destructive" });
    const latest = toast({ title: "Latest", variant: "success" });
    const onOpenChange = vi.fn();

    destructive.update({
      id: "ignored-by-update",
      title: "Updated",
      description: "Changed details",
      variant: "destructive",
      open: true,
    });
    latest.dismiss();
    latest.dismiss();
    toast({ title: "Default visible" });
    toast({ title: "Closable", variant: "warning", onOpenChange });

    primitiveCaptures.roots = [];
    let html = renderToStaticMarkup(React.createElement(Toaster));
    expect(html).not.toContain("Oldest");
    expect(html).toContain("Default visible");
    expect(html).toContain("Closable");
    expect(html).toContain("Updated");
    expect(html).toContain("Changed details");
    expect(html).toContain("Latest");
    expect(html).toContain("text-red-400");
    expect(html).toContain("text-emerald-400");
    expect(html).toContain("text-amber-400");
    expect(html).toContain("text-sky-400");

    primitiveCaptures.roots[0]?.onOpenChange?.(true);
    primitiveCaptures.roots[0]?.onOpenChange?.(false);
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    vi.advanceTimersByTime(5000);
    html = renderToStaticMarkup(React.createElement(Toaster));
    expect(html).not.toContain("Closable");
    expect(html).toContain("Updated");
  });
});
