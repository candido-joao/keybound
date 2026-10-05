import { type ArgSpec, type Catalog, COMMANDS, type Command, argLabel, findCommand } from './commands';

export interface Completion {
  /** Input after Tab; equal to the input when Tab has nothing to add. */
  completed: string;
  /** Gray text drawn right after the input: the rest of the first match, or the arguments still missing. */
  ghost: string;
  /** Every match for the word being typed, when more than one fits. */
  matches: string[];
}

/** Completes the last word of `input`, the command name or one of its arguments. */
export function complete(input: string, catalog: Catalog, commands: readonly Command[] = COMMANDS): Completion {
  const words = input.trimStart().toLowerCase().split(/ +/);
  const word = words[words.length - 1];
  const head = input.slice(0, input.length - word.length);
  const none: Completion = { completed: input, ghost: '', matches: [] };

  if (words.length === 1) return completeWord(head, word, commands.map((c) => c.name).sort(), '');

  const command = findCommand(words[0], commands);
  if (!command) return none;
  const argIndex = words.length - 2;
  const arg = command.args[argIndex];
  if (!arg) return none;

  const pending = command.args.slice(argIndex).map(argLabel).join(' ');
  return completeWord(head, word, candidatesFor(arg, catalog), pending);
}

function candidatesFor(arg: ArgSpec, catalog: Catalog): string[] {
  if (arg.kind === 'int' || arg.kind === 'number') return [];
  return [...catalog[arg.kind]].sort();
}

/** While the word is empty the ghost shows `pending`, the arguments still missing, instead of a guess. */
function completeWord(head: string, word: string, candidates: string[], pending: string): Completion {
  const matches = candidates.filter((c) => c.toLowerCase().startsWith(word));
  const ghost = word ? (matches[0]?.slice(word.length) ?? '') : pending;
  if (matches.length === 0) return { completed: head + word, ghost, matches: [] };

  // A sole match is finished with a space so the next argument can start right away.
  if (matches.length === 1) return { completed: `${head}${matches[0]} `, ghost, matches: [] };

  return { completed: head + commonPrefix(matches), ghost, matches };
}

/** Longest prefix shared by every word, or `''` when there are none. */
export function commonPrefix(words: readonly string[]): string {
  if (words.length === 0) return '';
  return words.reduce(sharedPrefix);
}

/** Longest prefix shared by two words. */
function sharedPrefix(a: string, b: string): string {
  let n = 0;
  while (n < a.length && a[n] === b[n]) n++;
  return a.slice(0, n);
}
