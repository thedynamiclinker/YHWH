import { LanguageSupport, StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { tags } from '@lezer/highlight';

const directive = /^(?:-?include|sinclude|ifeq|ifneq|ifdef|ifndef|else|endif|define|endef|export|unexport|override|private|vpath|undefine)(?=\s|$)/;
const assignmentOperator = /^(?::{1,3}|[+?!])?=/;
const assignmentAfterName = /^\s*(?::{1,3}|[+?!])?=/;
const specialTarget = /^\.[A-Z][A-Z_]+(?=\s*:)/;
const shellContinues = /(?:^|[^\\])(?:\\\\)*\\$/;

const language = StreamLanguage.define({
  name: 'makefile',
  startState: () => ({ shell: shell.startState(), recipe: false, continued: false, target: false }),
  copyState: state => ({ ...state, shell: { tokens: [...state.shell.tokens] } }),
  blankLine(state) { state.continued = false; },
  token(stream, state) {
    if (stream.sol()) {
      const continued = state.continued;
      state.recipe = stream.string.startsWith('\t') || (continued && state.recipe);
      state.continued = shellContinues.test(stream.string);
      state.target = !continued && /^\s*[^#]+?\s*:(?!=|::?=)/.test(stream.string);
      if (state.recipe && !continued) state.shell = shell.startState();
    }
    if (state.recipe) {
      if (stream.sol() && stream.match(/^\t[@+\-]*/)) return 'operator';
      return shell.token(stream, state.shell);
    }
    if (stream.eatSpace()) return null;
    if (stream.eat('#')) { stream.skipToEnd(); return 'comment'; }
    if (stream.match(/^\\./)) return null;
    if (stream.match(assignmentOperator)) { state.target = false; return 'operator'; }
    if (stream.match(/^:{1,2}|^\|/)) { state.target = false; return 'operator'; }
    if (stream.match(directive)) return 'keyword';
    if (stream.match(specialTarget)) return 'atom';
    if (stream.match(/^\$(?:\([^)]*\)|\{[^}]*\}|[^\s])/)) return 'makeVariable';
    if (stream.match(/^[\w./%-]+/)) {
      if (state.target) return 'makeTarget';
      if (stream.match(assignmentAfterName, false)) return 'propertyName';
      return null;
    }
    stream.next();
    return null;
  },
  tokenTable: { makeTarget: tags.labelName, makeVariable: tags.special(tags.variableName) },
  languageData: { commentTokens: { line: '#' } },
});

export const makefile = () => new LanguageSupport(language);
