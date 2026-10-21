// Compatibility rewrites for common Overleaf and pdfTeX templates. Every rewrite keeps the
// original line count so compiler diagnostics still point at the line the user wrote.

const fontAwesomeShim = [
  String.raw`\usepackage{fontawesome}`,
  String.raw`\providecommand{\faIcon}[1]{\ensuremath{\bullet}}`,
  String.raw`\providecommand{\faPhoneAlt}{\faPhone}`,
  String.raw`\providecommand{\faMobileAlt}{\faMobile}`,
  String.raw`\providecommand{\faEnvelopeOpen}{\faEnvelope}`,
  String.raw`\providecommand{\faGlobeAmericas}{\faGlobe}`,
  String.raw`\providecommand{\faGlobeEurope}{\faGlobe}`,
  String.raw`\providecommand{\faGlobeAsia}{\faGlobe}`,
  String.raw`\providecommand{\faMapMarkerAlt}{\faMapMarker}`,
  String.raw`\providecommand{\faLinkedinIn}{\faLinkedin}`,
  String.raw`\providecommand{\faGithubAlt}{\faGithub}`,
  String.raw`\providecommand{\faExternalLinkAlt}{\faExternalLink}`,
  String.raw`\providecommand{\faBriefcase}{\faSuitcase}`,
  String.raw`\providecommand{\faUniversity}{\faInstitution}`,
  String.raw`\providecommand{\faGraduationCap}{\faMortarBoard}`,
  String.raw`\providecommand{\faCertificate}{\faCheckCircle}`,
  String.raw`\providecommand{\faTools}{\faWrench}`,
  String.raw`\providecommand{\faCodeBranch}{\faCodeFork}`,
  String.raw`\providecommand{\faDatabase}{\faHddO}`,
  String.raw`\providecommand{\faAws}{\textsf{\scriptsize AWS}}`,
  String.raw`\providecommand{\faSnowflake}{\ensuremath{\ast}}`,
].join("");

const iconAliases: Record<string, string> = {
  "address-card": "\\faAddressCard",
  aws: "\\faAws",
  briefcase: "\\faBriefcase",
  calendar: "\\faCalendar",
  certificate: "\\faCertificate",
  "code-branch": "\\faCodeBranch",
  database: "\\faDatabase",
  envelope: "\\faEnvelope",
  "envelope-open": "\\faEnvelopeOpen",
  "external-link-alt": "\\faExternalLinkAlt",
  github: "\\faGithub",
  globe: "\\faGlobe",
  "globe-americas": "\\faGlobeAmericas",
  "graduation-cap": "\\faGraduationCap",
  linkedin: "\\faLinkedin",
  "linkedin-in": "\\faLinkedinIn",
  "map-marker-alt": "\\faMapMarkerAlt",
  mobile: "\\faMobile",
  "mobile-alt": "\\faMobileAlt",
  phone: "\\faPhone",
  "phone-alt": "\\faPhoneAlt",
  snowflake: "\\faSnowflake",
  tools: "\\faTools",
  university: "\\faUniversity",
};

export function normalizeSourceForCompiler(source: string) {
  return source
    .replace(/\\faIcon\{([^}]+)}/g, (match, name: string) => iconAliases[name.trim().toLowerCase()] ?? match)
    .replace(/\\usepackage(?:\[[^\]]*])?\{fontawesome5}/g, (match) => keepLines(match, fontAwesomeShim))
    .replace(/\\usepackage(?:\[[^\]]*])?\{helvet}/g, (match) => keepLines(match, String.raw`\usepackage{tgheros}`))
    .replace(/^[ \t]*\\input\{glyphtounicode}[ \t]*$/gm, "")
    .replace(/^[ \t]*\\pdfgentounicode[ \t]*=[ \t]*1[ \t]*$/gm, "");
}

function keepLines(original: string, replacement: string) {
  const breaks = original.split("\n").length - 1;
  return replacement + "\n".repeat(breaks);
}
