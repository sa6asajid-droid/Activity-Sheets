/** Shared text helpers used by renderers, diagrams and checks. */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Approximate advance width of a string in em units for the bundled sans
 * (Atkinson Hyperlegible Next). Used for SVG label wrapping and bounds checks;
 * it is an estimate, which is why rendered layout is also measured in a browser.
 */
export function estimateTextWidth(text: string, fontSize: number): number {
  let em = 0;
  for (const ch of text) {
    if (/[ilI.,:;'|!]/.test(ch)) em += 0.3;
    else if (/[mwMW@]/.test(ch)) em += 0.86;
    else if (/[A-Z0-9]/.test(ch)) em += 0.64;
    else if (ch === " ") em += 0.28;
    else em += 0.54;
  }
  return em * fontSize;
}

export function wrapText(text: string, maxWidth: number, fontSize: number): string[] {
  if (maxWidth <= 0) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (estimateTextWidth(candidate, fontSize) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export function slug(value: string, max = 40): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max) || "item"
  );
}

/** Strip the constrained inline markup to plain text. */
export function stripInline(value: string): string {
  return value.replace(/\*\*(.+?)\*\*/g, "$1").replace(/(^|[\s(])_([^_\s](?:[^_]*[^_\s])?)_/g, "$1$2").replace(/\[\[(.+?)\]\]/g, "$1");
}

/**
 * Render the constrained inline markup to safe HTML. Input is escaped first,
 * so only the three markup forms below can ever produce tags.
 *   **bold**   _italic_   [[key term]]
 */
export function renderInline(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_([^_\s](?:[^_]*[^_\s])?)_(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>")
    .replace(/\[\[(.+?)\]\]/g, '<span class="term">$1</span>');
}

/** Render a multi-paragraph field: blank lines separate paragraphs; "- " starts a bullet. */
export function renderBlocks(value: string): string {
  const blocks = value.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
        return `<ul>${lines.map((l) => `<li>${renderInline(l.replace(/^\s*[-•]\s+/, ""))}</li>`).join("")}</ul>`;
      }
      if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
        return `<ol>${lines.map((l) => `<li>${renderInline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>`).join("")}</ol>`;
      }
      return `<p>${lines.map(renderInline).join("<br>")}</p>`;
    })
    .join("");
}

/** Rough syllable count for English readability estimates. */
function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/**
 * Flesch–Kincaid grade estimate. This is a coarse surface-feature estimate:
 * it says nothing about concept difficulty, vocabulary familiarity or layout,
 * and is reported to users as an estimate only.
 */
export function fleschKincaidGrade(text: string): number | null {
  const clean = stripInline(text);
  const sentences = clean.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().split(/\s+/).length >= 2);
  const words = clean.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  if (words.length < 30 || sentences.length < 2) return null;
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  const grade = 0.39 * (words.length / sentences.length) + 11.8 * (syl / words.length) - 15.59;
  return Math.round(grade * 10) / 10;
}
