import { MAX_YAML_EXPANDED_NODES, SubscriptionParseLimitError } from "./limits";

type BlockScalar = { parentIndent: number; indent: number | null };

function blockScalarHeader(line: string, start: number, parentIndent: number): BlockScalar | null {
  let index = start + 1;
  let digit = 0;
  let chomping = false;
  for (let count = 0; count < 2; count += 1) {
    const char = line[index];
    if (char >= "1" && char <= "9" && !digit) { digit = Number(char); index += 1; }
    else if ((char === "+" || char === "-") && !chomping) { chomping = true; index += 1; }
    else break;
  }
  while (line[index] === " " || line[index] === "\t") index += 1;
  if (index < line.length && line[index] !== "#") return null;
  return { parentIndent, indent: digit ? parentIndent + digit : null };
}

function isSpace(char: string | undefined): boolean { return char === " " || char === "\t"; }
function isSeparation(char: string | undefined): boolean {
  return char === undefined || isSpace(char) || ",[]{}".includes(char);
}
function isBlank(line: string): boolean {
  for (const char of line) if (!isSpace(char)) return false;
  return true;
}

// Bound the event stream before js-yaml allocates it, without charging scalar content.
export function checkYamlSyntaxBudget(source: string): void {
  let indicators = 0;
  const charge = () => {
    if (++indicators > MAX_YAML_EXPANDED_NODES) throw new SubscriptionParseLimitError("YAML 结构数量超过上限");
  };
  let flowDepth = 0;
  let quote = "";
  let plain = false;
  let plainIndent = 0;
  let nodeStart = true;
  let block: BlockScalar | null = null;

  for (const line of source.split(/\r\n|\r|\n/)) {
    const bom = !quote && !flowDepth && line.startsWith("\uFEFF") ? 1 : 0;
    if (bom) { block = null; plain = false; }
    let indent = 0;
    while (line[bom + indent] === " ") indent += 1;
    const rest = line.slice(bom + indent);
    if (!quote && block) {
      if (isBlank(rest)) continue;
      if (block.indent === null && indent > block.parentIndent) block.indent = indent;
      if (block.indent !== null && indent >= block.indent) continue;
      block = null;
    }
    if (!quote && !flowDepth) {
      if (isBlank(rest) || rest.startsWith("#")) continue;
      if (plain && indent > plainIndent) continue;
      plain = false;
      nodeStart = true;
    }

    charge();
    let logicalIndent = indent;
    let scalarIndent = indent;
    const documentStart = !quote && !flowDepth && indent === 0 && rest.startsWith("---") &&
      (rest.length === 3 || /[ \t]/.test(rest[3]));
    if (documentStart) charge();
    for (let index = documentStart ? bom + 3 : bom; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (quote) {
        if (quote === '"' && char === "\\") { index += 1; continue; }
        if (char === quote) {
          if (quote === "'" && next === "'") { index += 1; continue; }
          quote = "";
          nodeStart = false;
        }
        continue;
      }
      if (char === "#" && (index === 0 || isSpace(line[index - 1]))) break;
      if (plain) {
        if (char === ":" && isSeparation(next)) {
          charge(); plain = false; nodeStart = true; scalarIndent = logicalIndent;
        } else if (flowDepth && ",]}[{".includes(char)) {
          charge(); plain = false; nodeStart = char === "," || char === "[" || char === "{";
          if (char === "[" || char === "{") flowDepth += 1;
          else if (char !== ",") flowDepth -= 1;
        }
        continue;
      }
      if (isSpace(char)) continue;
      if (nodeStart && (char === '"' || char === "'")) { quote = char; continue; }
      if (nodeStart && !flowDepth && (char === "|" || char === ">")) {
        const header = blockScalarHeader(line, index, scalarIndent);
        if (header) { charge(); block = header; plain = false; break; }
      }
      if (nodeStart && (char === "&" || char === "!" || char === "*")) {
        charge();
        if (char === "!" && next === "<") {
          const end = line.indexOf(">", index + 2);
          if (end < 0) return; // The YAML parser will reject the unterminated tag.
          index = end;
        } else {
          while (index + 1 < line.length && !isSeparation(line[index + 1])) index += 1;
        }
        if (char === "*") nodeStart = false;
        continue;
      }
      if (char === "[" || char === "{") { charge(); flowDepth += 1; nodeStart = true; continue; }
      if (flowDepth && (char === "]" || char === "}")) { charge(); flowDepth -= 1; nodeStart = false; continue; }
      if (flowDepth && char === ",") { charge(); nodeStart = true; continue; }
      if (char === ":" && (isSeparation(next) || !nodeStart)) {
        charge(); nodeStart = true; scalarIndent = logicalIndent; continue;
      }
      if (nodeStart && (char === "?" || (!flowDepth && char === "-")) && isSeparation(next)) {
        charge(); scalarIndent = logicalIndent;
        if (char === "-") logicalIndent += 2;
        continue;
      }
      plain = true;
      plainIndent = scalarIndent;
      nodeStart = false;
    }
  }
}
