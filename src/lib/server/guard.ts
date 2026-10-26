// Defense in depth for untrusted LaTeX. Tectonic's --untrusted flag disables shell escape, but it
// still lets \input, \openin and friends read ABSOLUTE paths (it only prints a warning), so a
// document could read server files such as /proc/*/environ or other jobs' sources in /tmp and
// typeset them into the PDF. A static binary cannot be sandboxed from Node, so this guard rejects
// the ways a document can name a file outside its own job directory. It is a best-effort filter,
// not a sandbox: pair it with OS-level isolation where the platform offers it.

const MESSAGE =
  "This document tries to read files outside the compile sandbox (absolute or parent paths) or uses character-code tricks that can hide such paths. Remove them and try again.";

// Primitives that can only be used to conceal a file name from the checks below.
const OBFUSCATION = /\\(?:catcode|lccode|uccode|sfcode|scantokens|Ucharcat|Uchar|endlinechar|csname|pdfescapestring|expanded)\b|\^\^/;

// A file name argument that starts at the filesystem root or the home directory.
const ABSOLUTE_IN_ARGUMENT = /[{=\[,(]\s*(?:~\/|\/[A-Za-z0-9_.~-])/;

// File-reading primitives and commands whose argument may be written without braces.
const READ_COMMAND =
  /\\(?:input|include|openin|InputIfFileExists|@input|@@input|read|readline|verbatiminput|VerbatimInput|lstinputlisting|CatchFileDef|CatchFileEDef|includegraphics|includepdf|usepackage|RequirePackage|documentclass|LoadClass|bibliography|addbibresource)(?![A-Za-z])/g;

// After a read command: optional [options], optional "5 =" stream number, then the file name.
const ARGUMENT_START = /^\s*(?:\[[^\]]*\])?\s*(?:\d+\s*(?:to\s*\\[A-Za-z]+)?\s*)?=?\s*\{?\s*/;

const PARENT_SEGMENT = /(?:^|[\s{=\[,(/])\.\.(?:\/|\\|$|[\s}\],)])/;

export function findUnsafeFileAccess(source: string): string | null {
  if (OBFUSCATION.test(source) || ABSOLUTE_IN_ARGUMENT.test(source) || PARENT_SEGMENT.test(source)) {
    return MESSAGE;
  }

  for (const match of source.matchAll(READ_COMMAND)) {
    const rest = source.slice(match.index + match[0].length, match.index + match[0].length + 400);
    const start = ARGUMENT_START.exec(rest);
    const argument = rest.slice(start ? start[0].length : 0);
    // Macros in the file name could expand to anything, so only plain relative names pass.
    if (/^(?:\/|~|\\(?![A-Za-z]+\s*[}\]])|\.\.)/.test(argument) && !/^\\(?:jobname)\b/.test(argument)) {
      return MESSAGE;
    }
  }

  return null;
}
