#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const workspaceRoot = process.cwd();
const requestedRoots = process.argv.slice(2);
const roots = (requestedRoots.length > 0 ? requestedRoots : ["packages", "local"])
  .map((entry) => path.resolve(workspaceRoot, entry))
  .filter((entry) => fs.existsSync(entry));

const ignoredDirectoryNames = new Set([".next", "dist", "generated", "node_modules"]);
const findings = [];

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function isIgnoredFile(filePath) {
  const normalized = normalizePath(filePath);
  return (
    /\.(test|spec)\.[jt]sx?$/.test(normalized) ||
    normalized.includes("/__tests__/") ||
    normalized.includes("/components/ui/radix-")
  );
}

function collectFiles(entry, output) {
  const stat = fs.statSync(entry);
  if (stat.isFile()) {
    if (/\.[jt]sx?$/.test(entry) && !isIgnoredFile(entry)) output.push(entry);
    return;
  }

  for (const item of fs.readdirSync(entry, { withFileTypes: true })) {
    if (item.isDirectory() && ignoredDirectoryNames.has(item.name)) continue;
    collectFiles(path.join(entry, item.name), output);
  }
}

function tagName(node) {
  return node.tagName?.getText() ?? "";
}

function attributesOf(node) {
  return node.attributes?.properties ?? [];
}

function findAttribute(node, name) {
  return attributesOf(node).find(
    (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText() === name
  );
}

function hasDescendantTag(node, prohibitedNames) {
  let found = false;
  function visit(child) {
    if (found) return;
    if ((ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child)) && prohibitedNames.has(tagName(child.openingElement ?? child))) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  }
  for (const child of node.children ?? []) visit(child);
  return found;
}

function report(sourceFile, node, message) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  findings.push({
    file: path.relative(workspaceRoot, sourceFile.fileName),
    line: position.line + 1,
    column: position.character + 1,
    message,
  });
}

function checkFile(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const normalized = normalizePath(filePath);
  const isUiWrapper = normalized.includes("/components/ui/");
  const isIconButtonWrapper = normalized.endsWith("/components/ui/icon-button.tsx");
  const isSwitchFieldWrapper = normalized.endsWith("/components/ui/switch-field.tsx");

  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const moduleName = node.moduleSpecifier.text;
      if (moduleName.startsWith("@radix-ui/react-") && !isUiWrapper) {
        report(sourceFile, node, `业务代码不得直接导入 ${moduleName}，请使用共享 UI 包装组件`);
      }
    }

    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const name = tagName(opening);

      if ((name === "Link" || name === "a") && ts.isJsxElement(node) && hasDescendantTag(node, new Set(["Button", "button"]))) {
        report(sourceFile, opening, `${name} 内不得嵌套 Button/button；请使用 Button 或 IconButton 的 asChild`);
      }

      if (name === "Button" && !isIconButtonWrapper) {
        const size = findAttribute(opening, "size");
        if (size?.initializer && ts.isStringLiteral(size.initializer) && size.initializer.text === "icon") {
          report(sourceFile, opening, '业务代码不得直接使用 Button size="icon"；请使用 IconButton');
        }
      }

      if (name === "Switch" && !isSwitchFieldWrapper) {
        const hasAccessibleName = Boolean(
          findAttribute(opening, "aria-label") || findAttribute(opening, "aria-labelledby")
        );
        if (!hasAccessibleName) {
          report(sourceFile, opening, "裸 Switch 必须提供 aria-label 或 aria-labelledby");
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

const files = [];
for (const root of roots) collectFiles(root, files);
for (const file of files) checkFile(file);

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}:${finding.column} ${finding.message}`);
  }
  console.error(`\nUI consistency check failed with ${findings.length} finding(s).`);
  process.exit(1);
}

console.log(`UI consistency check passed (${files.length} source files scanned).`);
