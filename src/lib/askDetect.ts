/**
 * Ask detection from raw tmux pane captures — pure functions.
 *
 * Parses the visible tail of an agent pane (Claude Code / codex TUIs) for
 * blocked-prompt shapes: permission dialogs, plan approvals, question
 * widgets, y/n prompts. Runs client-side on the `previews` WebSocket
 * stream (15-line raw captures) — this deployment has no Claude Code
 * hooks wired, so pane content is the only reliable ask signal.
 *
 * Trust rules (why the guards look paranoid):
 *  - A numbered list is only a dialog when exactly one row carries the
 *    ❯/› highlight marker — plain numbered lists in agent output must
 *    never become one-click approve buttons.
 *  - "esc to interrupt" on screen means the agent is streaming, not
 *    blocked; everything is suppressed while it shows.
 */
import { stripAnsi } from "./ansi";
import type { AskType, AskOption } from "./types";

export interface DetectedAsk {
  type: AskType;
  question: string;
  /** Dialog header/body above the question (e.g. the command to approve) */
  context: string;
  options: AskOption[];
  /** Stable key of this prompt — dedupe + answer-time staleness check */
  promptKey: string;
  /** "keys" = arrows+Enter (TUI dialog); "text" = type key, server appends Enter */
  respondMode: "keys" | "text";
}

/** djb2 → base36, stable across renders */
function hashKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const BORDER_RE = /^[\s─━═╌┄│┃╭╮╰╯┌┐└┘]+$/;
const FOOTER_RE = /·|^(enter|esc|tab|ctrl\+|press )/i;
const BUSY_RE = /esc to interrupt/i;
const OPTION_RE = /^\s*(❯|›)?\s*(\d{1,2})[.)]\s*(\S.*)$/;
const MAX_SCAN_LINES = 20;

function cleanLine(line: string): string {
  return line.replace(/[│┃]/g, " ").replace(/\s+$/g, "");
}

export function detectAskFromPane(rawCapture: string): DetectedAsk | null {
  const text = stripAnsi(rawCapture);
  const allLines = text.split("\n").map(cleanLine);
  let end = allLines.length;
  while (end > 0 && !allLines[end - 1].trim()) end--;
  const lines = allLines.slice(Math.max(0, end - MAX_SCAN_LINES), end);
  if (lines.length === 0) return null;

  if (lines.some((l) => BUSY_RE.test(l))) return null;

  // --- Numbered dialog (Claude Code permission / plan / question) ---
  const options: AskOption[] = [];
  let firstOptLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(OPTION_RE);
    if (m) {
      const idx = parseInt(m[2], 10);
      if (options.length === 0) {
        if (idx !== 1) continue; // a dialog's options start at 1
        firstOptLine = i;
        options.push({ index: 1, label: m[3].trim(), selected: !!m[1] });
      } else if (idx === options[options.length - 1].index + 1) {
        options.push({ index: idx, label: m[3].trim(), selected: !!m[1] });
      } else if (idx === 1) {
        // a fresh numbered list further down wins (closer to the cursor)
        options.length = 0;
        firstOptLine = i;
        options.push({ index: 1, label: m[3].trim(), selected: !!m[1] });
      }
    } else if (options.length > 0) {
      const t = lines[i].trim();
      if (!t) { if (options.length >= 2) break; else continue; }
      if (FOOTER_RE.test(t)) break;
      // wrapped continuation of the previous option label
      options[options.length - 1].label += ` ${t}`;
    }
  }

  // Exactly one highlighted row = a live dialog. Anything else is output.
  if (options.length >= 2 && options.length <= 9 && options.filter((o) => o.selected).length === 1) {
    let question = "";
    let qLine = -1;
    for (let i = firstOptLine - 1; i >= Math.max(0, firstOptLine - 6); i--) {
      const t = lines[i].trim();
      if (!t || BORDER_RE.test(lines[i])) continue;
      if (/\?\s*$/.test(t) || /^(do you want|would you like|choose|select|how would)/i.test(t)) {
        question = t; qLine = i; break;
      }
      if (!question) { question = t; qLine = i; } // fallback: nearest text line
    }
    const ctxLines: string[] = [];
    for (let i = (qLine === -1 ? firstOptLine : qLine) - 1; i >= 0 && ctxLines.length < 4; i--) {
      const t = lines[i].trim();
      if (!t || BORDER_RE.test(lines[i])) continue;
      ctxLines.unshift(t);
    }
    const labels = options.map((o) => o.label).join(" | ");
    const blob = `${question} ${labels}`.toLowerCase();
    let type: AskType = "input";
    if (
      /always allow|don't ask again|allow access|trust this folder|yes, and/i.test(labels) ||
      /do you want to (proceed|run|make|create|allow)|permission/.test(blob)
    ) type = "permission";
    if (/plan|auto-accept/.test(blob)) type = "plan";
    return {
      type,
      question: question || "Choose an option",
      context: ctxLines.join("\n"),
      options,
      promptKey: hashKey(`${question}|${labels}`),
      respondMode: "keys",
    };
  }

  // --- Bare y/n prompt (shell tools, codex confirmations) ---
  const last = lines[lines.length - 1].trim();
  if (last.length <= 100) {
    const yn = last.match(/[[(](y\/n|y\/N|Y\/n|yes\/no)[\])]\s*[:?]?\s*$/i);
    if (yn) {
      return {
        type: "permission",
        question: last,
        context: lines.slice(-4, -1).map((l) => l.trim()).filter(Boolean).join("\n"),
        options: [
          { index: 1, label: "Yes", selected: false, key: "y" },
          { index: 2, label: "No", selected: false, key: "n" },
        ],
        promptKey: hashKey(last),
        respondMode: "text",
      };
    }
  }

  return null;
}
