import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

function mockPrimitive(tag: keyof React.JSX.IntrinsicElements, displayName: string) {
  const Component = React.forwardRef<
    HTMLElement,
    React.HTMLAttributes<HTMLElement> & { sideOffset?: number }
  >(
    ({ children, sideOffset: _sideOffset, ...props }, ref) => React.createElement(tag, { ...props, ref }, children)
  );
  Component.displayName = displayName;
  return Component;
}

vi.mock("@radix-ui/react-dropdown-menu", () => {
  const Root = ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children);
  Root.displayName = "DropdownMenuRoot";

  return {
    Root,
    Trigger: mockPrimitive("button", "DropdownMenuTrigger"),
    Group: mockPrimitive("div", "DropdownMenuGroup"),
    Portal: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
    Sub: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
    RadioGroup: mockPrimitive("div", "DropdownMenuRadioGroup"),
    SubTrigger: mockPrimitive("button", "DropdownMenuSubTrigger"),
    SubContent: mockPrimitive("div", "DropdownMenuSubContent"),
    Content: mockPrimitive("div", "DropdownMenuContent"),
    Item: mockPrimitive("div", "DropdownMenuItem"),
    CheckboxItem: mockPrimitive("div", "DropdownMenuCheckboxItem"),
    RadioItem: mockPrimitive("div", "DropdownMenuRadioItem"),
    ItemIndicator: ({ children }: React.PropsWithChildren) => React.createElement("span", null, children),
    Label: mockPrimitive("div", "DropdownMenuLabel"),
    Separator: mockPrimitive("hr", "DropdownMenuSeparator"),
  };
});

vi.mock("@radix-ui/react-select", () => {
  const Root = ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children);
  Root.displayName = "SelectRoot";

  return {
    Root,
    Group: mockPrimitive("div", "SelectGroup"),
    Value: mockPrimitive("span", "SelectValue"),
    Trigger: mockPrimitive("button", "SelectTrigger"),
    Icon: ({ children }: React.PropsWithChildren<{ asChild?: boolean }>) => React.createElement("span", null, children),
    Portal: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
    Content: mockPrimitive("div", "SelectContent"),
    Viewport: mockPrimitive("div", "SelectViewport"),
    ScrollUpButton: mockPrimitive("button", "SelectScrollUpButton"),
    ScrollDownButton: mockPrimitive("button", "SelectScrollDownButton"),
    Label: mockPrimitive("div", "SelectLabel"),
    Item: mockPrimitive("div", "SelectItem"),
    ItemIndicator: ({ children }: React.PropsWithChildren) => React.createElement("span", null, children),
    ItemText: ({ children }: React.PropsWithChildren) => React.createElement("span", null, children),
    Separator: mockPrimitive("hr", "SelectSeparator"),
  };
});

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "./select";

describe("select and dropdown wrappers", () => {
  it("renders dropdown menu wrappers with indicators, shortcuts, and merged classes", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        DropdownMenu,
        null,
        React.createElement(DropdownMenuTrigger, { className: "trigger-extra" }, "Open"),
        React.createElement(
          DropdownMenuContent,
          { className: "content-extra", sideOffset: 8 },
          React.createElement(
            DropdownMenuGroup,
            null,
            React.createElement(DropdownMenuLabel, { inset: true, className: "label-extra" }, "Group"),
            React.createElement(DropdownMenuItem, { inset: true, className: "item-extra" }, "Item"),
            React.createElement(DropdownMenuCheckboxItem, { checked: true, className: "checkbox-extra" }, "Check me"),
            React.createElement(
              DropdownMenuRadioGroup,
              null,
              React.createElement(DropdownMenuRadioItem, { value: "one", className: "radio-extra" }, "Radio")
            ),
            React.createElement(DropdownMenuSeparator, { className: "separator-extra" }),
            React.createElement(DropdownMenuShortcut, { className: "shortcut-extra" }, "Ctrl+K")
          ),
          React.createElement(
            DropdownMenuSub,
            null,
            React.createElement(DropdownMenuSubTrigger, { inset: true, className: "sub-trigger-extra" }, "More"),
            React.createElement(DropdownMenuSubContent, { className: "sub-content-extra" }, "Nested")
          )
        )
      )
    );

    expect(html).toContain("Open");
    expect(html).toContain("Group");
    expect(html).toContain("Check me");
    expect(html).toContain("Ctrl+K");
    expect(html).toContain("content-extra");
    expect(html).toContain("item-extra");
    expect(html).toContain("checkbox-extra");
    expect(html).toContain("radio-extra");
    expect(html).toContain("sub-trigger-extra");
    expect(html).toContain("sub-content-extra");
  });

  it("renders select wrappers with viewport, scroll buttons, and merged classes", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        Select,
        null,
        React.createElement(
          SelectTrigger,
          { className: "trigger-extra" },
          React.createElement(SelectValue, null, "Choose")
        ),
        React.createElement(
          SelectContent,
          { className: "content-extra", position: "popper" },
          React.createElement(
            SelectGroup,
            null,
            React.createElement(SelectLabel, { className: "label-extra" }, "Options"),
            React.createElement(SelectItem, { value: "one", className: "item-extra" }, "One"),
            React.createElement(SelectSeparator, { className: "separator-extra" })
          )
        ),
        React.createElement(SelectScrollUpButton, { className: "up-extra" }),
        React.createElement(SelectScrollDownButton, { className: "down-extra" })
      )
    );

    expect(html).toContain("Choose");
    expect(html).toContain("Options");
    expect(html).toContain("One");
    expect(html).toContain("trigger-extra");
    expect(html).toContain("content-extra");
    expect(html).toContain("label-extra");
    expect(html).toContain("item-extra");
    expect(html).toContain("up-extra");
    expect(html).toContain("down-extra");
  });
});
