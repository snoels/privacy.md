/**
 * Who is on the other end of this tool call?
 *
 * A flow is appropriate or not depending on sender, recipient, data type and
 * purpose — not on the data alone. Your home address to your courier is fine;
 * the same string to a marketing SaaS is not. So the recipient is a first-class
 * input to every decision, on two axes:
 *
 *   trust   what relationship the user has with it (this is the agentic axis:
 *           "you did not pick this destination" is a strong signal on its own)
 *   sector  what kind of business it is, which is what contextual rules name
 */

/** Services the user plausibly has a relationship with, and what they are for. */
const KNOWN_SERVICES = {
  'mail.google.com': { name: 'Gmail', sector: 'communication' },
  'gmail.com': { name: 'Gmail', sector: 'communication' },
  'calendar.google.com': { name: 'Google Calendar', sector: 'productivity' },
  'drive.google.com': { name: 'Google Drive', sector: 'storage' },
  'slack.com': { name: 'Slack', sector: 'communication' },
  'notion.so': { name: 'Notion', sector: 'productivity' },
  'linear.app': { name: 'Linear', sector: 'productivity' },
  'github.com': { name: 'GitHub', sector: 'development' },
  'opentable.com': { name: 'OpenTable', sector: 'booking' },
  'booking.com': { name: 'Booking.com', sector: 'booking' },
  'doctolib.be': { name: 'Doctolib', sector: 'healthcare' },
  'doctolib.fr': { name: 'Doctolib', sector: 'healthcare' },
  'bpost.be': { name: 'bpost', sector: 'logistics' },
  'dhl.com': { name: 'DHL', sector: 'logistics' },
  'linkedin.com': { name: 'LinkedIn', sector: 'recruiting' },
  'greenhouse.io': { name: 'Greenhouse', sector: 'recruiting' },
  'google-analytics.com': { name: 'Google Analytics', sector: 'analytics' },
  'doubleclick.net': { name: 'DoubleClick', sector: 'advertising' },
  'facebook.com': { name: 'Meta', sector: 'advertising' },
};

/** MCP server name fragments mapped to a sector, for connector-shaped tool names. */
const MCP_SECTORS = [
  [/gmail|mail/i, { sector: 'communication' }],
  [/calendar/i, { sector: 'productivity' }],
  [/drive|dropbox|box/i, { sector: 'storage' }],
  [/notion|linear|asana|jira/i, { sector: 'productivity' }],
  [/slack|discord|teams/i, { sector: 'communication' }],
  [/doctolib|health|clinic|patient/i, { sector: 'healthcare' }],
  [/opentable|resy|booking|reserve/i, { sector: 'booking' }],
  [/bpost|dhl|ups|fedex|deliver/i, { sector: 'logistics' }],
  [/analytics|segment|mixpanel/i, { sector: 'analytics' }],
  [/ads?|doubleclick|adwords/i, { sector: 'advertising' }],
  [/greenhouse|lever|workday|recruit/i, { sector: 'recruiting' }],
];

/** Tools that do not leave the machine. Everything else is treated as egress. */
const LOCAL_TOOLS = /^(Read|Write|Edit|Glob|Grep|LS|NotebookEdit|TodoWrite)$/;

/** Anything sent to the model as context is a transfer to the model provider. */
const MODEL_PROVIDER_TOOLS = /^(Task|Agent)$/;

/** Loopback is this machine. A dev server on :8787 is not a third party. */
const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|::1|0\.0\.0\.0)$/i;

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function lookupHost(host, { treatLoopbackAsEgress = false } = {}) {
  if (!host) return null;
  if (LOOPBACK.test(host) && !treatLoopbackAsEgress) {
    return { host, name: 'this machine', sector: 'local', trust: 'self' };
  }
  if (KNOWN_SERVICES[host]) return { host, ...KNOWN_SERVICES[host], trust: 'known' };
  // Match a registrable-domain suffix, so mail.google.com resolves via google.com.
  for (const [domain, meta] of Object.entries(KNOWN_SERVICES)) {
    if (host === domain || host.endsWith(`.${domain}`)) return { host, ...meta, trust: 'known' };
  }
  return { host, name: host, sector: 'unknown', trust: 'agent_chosen' };
}

/** Pull the first outbound URL out of a shell command, if there is one. */
function urlInCommand(command) {
  const match = /\bhttps?:\/\/[^\s'"`|;)]+/i.exec(command ?? '');
  return match ? match[0] : null;
}

/**
 * Classify the recipient of a tool call.
 *
 * @param {{tool: string, input: Record<string, unknown>}} call
 * @param {{knownServices?: Record<string, {name: string, sector: string}>}} [context]
 * @returns {{name: string, trust: string, sector: string, host: string|null, chosenBy: string}}
 */
export function classifyRecipient(call, context = {}) {
  const tool = call.tool ?? '';
  const input = call.input ?? {};
  const options = { treatLoopbackAsEgress: context.treatLoopbackAsEgress === true };

  if (MODEL_PROVIDER_TOOLS.test(tool)) {
    return { name: 'your model provider', trust: 'model_provider', sector: 'model_provider', host: null, chosenBy: 'runtime' };
  }

  // Bash is local unless the command reaches out, which it often does.
  if (tool === 'Bash') {
    const url = urlInCommand(String(input.command ?? ''));
    if (!url) return { name: 'this machine', trust: 'self', sector: 'local', host: null, chosenBy: 'user' };
    const resolved = lookupHost(hostOf(url), options);
    if (resolved.trust === 'self') return { ...resolved, chosenBy: 'user' };
    return { ...resolved, chosenBy: 'agent' };
  }

  if (LOCAL_TOOLS.test(tool)) {
    return { name: 'this machine', trust: 'self', sector: 'local', host: null, chosenBy: 'user' };
  }

  if (tool === 'WebFetch' || tool === 'WebSearch') {
    const resolved = lookupHost(hostOf(String(input.url ?? '')), options);
    return { ...(resolved ?? { host: null, name: 'the open web', sector: 'unknown', trust: 'public' }), chosenBy: 'agent' };
  }

  // Connector-shaped tools: mcp__<server>__<tool>
  const mcp = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(tool);
  if (mcp) {
    const [, server] = mcp;
    for (const [re, meta] of MCP_SECTORS) {
      if (re.test(server)) return { name: server, trust: 'known', sector: meta.sector, host: null, chosenBy: 'user' };
    }
    return { name: server, trust: 'known', sector: 'unknown', host: null, chosenBy: 'user' };
  }

  // Anything we cannot place is treated as agent-chosen, which is the cautious
  // reading: an unrecognised destination is exactly the case worth asking about.
  return { name: tool || 'unknown', trust: 'agent_chosen', sector: 'unknown', host: null, chosenBy: 'agent' };
}

export { KNOWN_SERVICES };
