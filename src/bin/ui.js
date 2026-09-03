/**
 * Terminal widgets.
 *
 * Deliberately in the same idiom as the agent's own permission prompt: a marker
 * against the current row, arrow keys, number shortcuts, Enter to take it. The
 * kernel interrupts people mid-task, so the interruption has to feel like part
 * of the tool they were already using rather than a dialog bolted on.
 *
 * No dependencies. Every widget resolves to a value and restores the terminal,
 * including when the user hits Ctrl-C.
 */

import { emitKeypressEvents } from 'node:readline';

const ESC = '\u001b[';
export const style = {
  bold: (t) => `${ESC}1m${t}${ESC}22m`,
  dim: (t) => `${ESC}2m${t}${ESC}22m`,
  green: (t) => `${ESC}32m${t}${ESC}39m`,
  amber: (t) => `${ESC}33m${t}${ESC}39m`,
  red: (t) => `${ESC}31m${t}${ESC}39m`,
  violet: (t) => `${ESC}35m${t}${ESC}39m`,
  cyan: (t) => `${ESC}36m${t}${ESC}39m`,
  grey: (t) => `${ESC}90m${t}${ESC}39m`,
};

const hideCursor = () => process.stdout.write(`${ESC}?25l`);
const showCursor = () => process.stdout.write(`${ESC}?25h`);

/** Visible width, ignoring the escape sequences. */
const width = (text) => text.replace(/\u001b\[[0-9;]*m/g, '').length;

export function wrap(text, columns) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && width(line) + 1 + width(word) > columns) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Run an interactive widget.
 *
 * `render` returns the lines to draw; `onKey` returns a value to finish, or
 * undefined to keep going. The previous frame is erased rather than the whole
 * screen, so whatever the user was reading above the prompt stays put.
 */
function interactive({ render, onKey }) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY) {
      reject(new Error('This needs an interactive terminal.'));
      return;
    }

    emitKeypressEvents(input);
    input.setRawMode(true);
    input.resume();
    hideCursor();

    let drawn = 0;

    const paint = () => {
      if (drawn > 0) process.stdout.write(`${ESC}${drawn}A${ESC}0J`);
      const lines = render();
      process.stdout.write(`${lines.join('\n')}\n`);
      drawn = lines.length;
    };

    const finish = (value, error) => {
      input.setRawMode(false);
      input.pause();
      input.removeListener('keypress', handler);
      showCursor();
      if (error) reject(error);
      else resolve(value);
    };

    const handler = (chunk, key) => {
      if (key?.ctrl && key.name === 'c') {
        finish(undefined, new Error('cancelled'));
        return;
      }
      const outcome = onKey(key ?? {}, chunk);
      if (outcome !== undefined) {
        finish(outcome);
        return;
      }
      paint();
    };

    input.on('keypress', handler);
    paint();
  });
}

/**
 * Pick one option.
 *
 * `preview` is the reason this exists rather than a plain list: the consequence
 * of the highlighted option, and the rule it would write, update as the cursor
 * moves. The user is choosing a rule with a visible width, not a vibe.
 */
export async function select({ title, hint, options, initial = 0, preview }) {
  let cursor = Math.max(0, Math.min(initial, options.length - 1));

  const value = await interactive({
    render() {
      const lines = ['', `  ${style.bold(title)}`];
      if (hint) lines.push(`  ${style.dim(hint)}`);
      lines.push('');

      for (const [index, option] of options.entries()) {
        const active = index === cursor;
        const marker = active ? style.cyan('❯') : ' ';
        const number = style.dim(`${index + 1}.`);
        const label = active ? style.bold(option.label) : option.label;
        lines.push(`  ${marker} ${number} ${label}`);
        if (option.hint && active) lines.push(`      ${style.dim(option.hint)}`);
      }

      if (preview) {
        const panel = preview(options[cursor], cursor);
        if (panel?.length) {
          lines.push('');
          for (const line of panel) lines.push(`  ${line}`);
        }
      }

      lines.push('', style.dim('    up/down to move, number to jump, enter to take it'));
      return lines;
    },
    onKey(key, chunk) {
      if (key.name === 'up' || key.name === 'k') cursor = (cursor - 1 + options.length) % options.length;
      else if (key.name === 'down' || key.name === 'j') cursor = (cursor + 1) % options.length;
      else if (key.name === 'return') return options[cursor];
      else if (/^[1-9]$/.test(chunk ?? '')) {
        const index = Number(chunk) - 1;
        if (index < options.length) {
          cursor = index;
          return options[index];
        }
      }
      return undefined;
    },
  });

  return value;
}

/**
 * A grid of settings, one row per subject, moved through with the arrow keys.
 *
 * Ten sequential prompts for ten data types is a form, and forms are where good
 * intentions die. A preset fills this in, and the user changes only the rows
 * they care about.
 */
export async function matrix({ title, hint, rows, scale, footer }) {
  let cursor = 0;
  const labelWidth = Math.max(...rows.map((row) => row.label.length));

  const value = await interactive({
    render() {
      const lines = ['', `  ${style.bold(title)}`];
      if (hint) lines.push(`  ${style.dim(hint)}`);
      lines.push('');

      for (const [index, row] of rows.entries()) {
        const active = index === cursor;
        const marker = active ? style.cyan('❯') : ' ';
        const label = (active ? style.bold(row.label) : row.label).padEnd(
          labelWidth + (active ? 8 : 0),
        );
        const cells = scale.map((step, stepIndex) => {
          const chosen = stepIndex === row.value;
          if (chosen) return active ? style.cyan(`[${step.short}]`) : style.green(`[${step.short}]`);
          return style.dim(` ${step.short} `);
        });
        lines.push(`  ${marker} ${label} ${cells.join('')}`);
      }

      const current = scale[rows[cursor].value];
      lines.push('', `  ${style.dim(current.describe(rows[cursor]))}`);
      if (footer) lines.push(`  ${style.dim(footer)}`);
      lines.push('', style.dim('    up/down to change row, left/right to change setting, enter when done'));
      return lines;
    },
    onKey(key) {
      const row = rows[cursor];
      if (key.name === 'up' || key.name === 'k') cursor = (cursor - 1 + rows.length) % rows.length;
      else if (key.name === 'down' || key.name === 'j') cursor = (cursor + 1) % rows.length;
      else if (key.name === 'left' || key.name === 'h') row.value = Math.max(0, row.value - 1);
      else if (key.name === 'right' || key.name === 'l') row.value = Math.min(scale.length - 1, row.value + 1);
      else if (key.name === 'return') return rows;
      return undefined;
    },
  });

  return value;
}

/** A single line of free text. Enter accepts, Escape gives up on it. */
export async function text({ title, hint, placeholder = '' }) {
  let buffer = '';

  const value = await interactive({
    render() {
      const lines = ['', `  ${style.bold(title)}`];
      if (hint) lines.push(`  ${style.dim(hint)}`);
      lines.push('');
      const shown = buffer.length > 0 ? buffer : style.dim(placeholder);
      lines.push(`  ${style.cyan('❯')} ${shown}${style.dim('█')}`);
      lines.push('', style.dim('    enter to accept, escape to skip'));
      return lines;
    },
    onKey(key, chunk) {
      if (key.name === 'return') return buffer.trim();
      if (key.name === 'escape') return '';
      if (key.name === 'backspace') {
        buffer = buffer.slice(0, -1);
        return undefined;
      }
      if (chunk && !key.ctrl && !key.meta && chunk >= ' ') buffer += chunk;
      return undefined;
    },
  });

  return value;
}

/** Struck through, for a value that did not make it out. */
export const struck = (text) => `${ESC}9m${ESC}2m${text}${ESC}22m${ESC}29m`;

/**
 * A field-by-field view of what a service actually received.
 *
 * The whole argument of this project is that the task still completes carrying
 * less, and a truncated JSON blob shows neither half of that. Every field is
 * listed, and the ones that were withheld are struck through where they stood.
 *
 * @param {object} proposed what the agent wanted to send
 * @param {object|null} sent what arrived, or null if the call never happened
 * @param {number} width columns for the value before it is trimmed
 */
export function fieldDiff(proposed, sent, width = 72) {
  const lines = [];
  const trim = (value) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.length > width ? `${text.slice(0, width - 1)}…` : text;
  };

  for (const [key, before] of Object.entries(proposed ?? {})) {
    if (before === null || before === undefined) continue;
    const after = sent?.[key];
    const label = style.dim(key.padEnd(10));

    if (sent === null) {
      lines.push(`${label} ${struck(trim(before))}`);
    } else if (after === undefined) {
      lines.push(`${label} ${struck(trim(before))}  ${style.red('removed')}`);
    } else if (after !== before) {
      // Both halves, because the removal is the thing worth seeing. One line
      // showing only the result asks the reader to guess what used to be there.
      lines.push(`${label} ${struck(trim(before))}`);
      lines.push(`${' '.repeat(10)} ${style.violet(trim(after))}  ${style.violet('sent instead')}`);
    } else {
      lines.push(`${label} ${trim(after)}`);
    }
  }
  return lines;
}

/** A framed block, for anything that needs to read as one object. */
export function panel(title, lines, colour = style.grey) {
  const inner = Math.max(width(title) + 2, ...lines.map(width)) + 2;
  const out = [colour(`┌─ ${title} ${'─'.repeat(Math.max(0, inner - width(title) - 3))}┐`)];
  for (const line of lines) {
    out.push(`${colour('│')} ${line}${' '.repeat(Math.max(0, inner - width(line) - 1))}${colour('│')}`);
  }
  out.push(colour(`└${'─'.repeat(inner)}┘`));
  return out;
}
