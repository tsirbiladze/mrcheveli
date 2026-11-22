#!/usr/bin/env node
// Checks every "works in Georgia" status against its own source: fetches the page the status cites
// and looks for the quote on it. Needs the network. Nothing is written.
//
//   node catalog/sources.mjs             prints one line per service; exits 1 when a quote is gone
//   node catalog/sources.mjs --strict    also exits 1 when a page could not be read
//   node catalog/sources.mjs slack zoom  checks only the services named
//   node catalog/sources.mjs --notes f   checks a research note: a list of {id, status, source, quote}
//   node catalog/sources.mjs --reader https://r.jina.ai/
//                                        reads a page it could not read plainly a second time, through
//                                        a reader service that is given the page's public address
//
// Three outcomes: "found" (the quote is on the page), "gone" (the page was read and the quote is
// not on it: the status has to be checked again by a person), "unread" (the page refused the
// request, is a PDF, or is drawn by scripts: a person has to open it).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

export function plain(text) {
  return text
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;|&ldquo;|&rdquo;|&#8220;|&#8221;/gi, '"')
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;|&#8217;|&#8216;|&#x27;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&[a-z]+;|&#\d+;|&#x[0-9a-f]+;/gi, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[\s ​]+/g, ' ')
    .toLowerCase()
    .trim();
}

export function holds(page, quote) {
  return plain(page).includes(plain(quote));
}

async function read(url, quote) {
  let response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; catalog source check)', accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(60000),
    });
  } catch (error) {
    return { outcome: 'unread', detail: error.cause ? String(error.cause.code || error.cause) : error.name };
  }
  if (!response.ok) return { outcome: 'unread', detail: `HTTP ${response.status}` };
  const type = response.headers.get('content-type') || '';
  if (!/text|html|json|xml/.test(type)) return { outcome: 'unread', detail: type.split(';')[0] };
  const page = await response.text();
  if (holds(page, quote)) return { outcome: 'found', detail: '' };
  return { outcome: 'gone', detail: `${page.length} characters read` };
}

// A page that refuses a plain request, is a PDF or is drawn by scripts is read a second time
// through the reader, when one is given. What the reader finds is "found"; what neither finds
// keeps the outcome of the plain request.
async function check(service, reader) {
  const g = service.georgia;
  const direct = await read(g.source, g.quote);
  if (direct.outcome === 'found' || !reader) return { id: service.id, ...direct };
  const second = await read(reader + g.source, g.quote);
  if (second.outcome === 'found') return { id: service.id, outcome: 'found', detail: 'through the reader' };
  return { id: service.id, ...direct };
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  // --notes <file>: check a research note instead (a list of {id, status, source, quote}).
  const notesAt = args.indexOf('--notes');
  const notes = notesAt >= 0 ? args.splice(notesAt, 2)[1] : null;
  const readerAt = args.indexOf('--reader');
  const reader = readerAt >= 0 ? args.splice(readerAt, 2)[1] : null;
  if (reader !== null && !/^https:\/\/[a-z0-9.-]+\/$/.test(reader || '')) {
    process.stderr.write('sources: --reader takes an https address that ends in a slash\n');
    process.exit(1);
  }
  const only = args.filter((a) => !a.startsWith('--'));
  const all = notes
    ? JSON.parse(readFileSync(notes, 'utf8')).map((n) => ({ id: n.id, georgia: n }))
    : JSON.parse(readFileSync(join(HERE, 'services.json'), 'utf8')).services;
  const services = all.filter(
    (s) => s.georgia && s.georgia.status !== 'unknown' && (only.length === 0 || only.includes(s.id)),
  );
  const results = [];
  for (let i = 0; i < services.length; i += 6) {
    results.push(...(await Promise.all(services.slice(i, i + 6).map((s) => check(s, reader)))));
  }
  const count = { found: 0, gone: 0, unread: 0 };
  for (const r of results) {
    count[r.outcome] += 1;
    process.stdout.write(`${r.outcome.padEnd(7)} ${r.id}${r.detail ? `  (${r.detail})` : ''}\n`);
  }
  process.stdout.write(`\n${count.found} found, ${count.gone} gone, ${count.unread} unread, of ${results.length}\n`);
  if (count.gone > 0 || (strict && count.unread > 0)) process.exit(1);
}
