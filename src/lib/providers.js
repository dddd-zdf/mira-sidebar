'use strict';

// Curated provider catalog. Custom providers come from the config file and are
// validated with validateCustomProvider before they are ever loaded.
const CATALOG = Object.freeze([
  Object.freeze({ id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/' }),
  Object.freeze({ id: 'claude', name: 'Claude', url: 'https://claude.ai/' }),
  Object.freeze({ id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app' }),
  Object.freeze({ id: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai/' }),
]);

// Gemini ships in the catalog but not in the default set: Google sign-in is
// often rejected inside embedded browsers, so enabling it is an opt-in.
const DEFAULT_ENABLED = Object.freeze(['chatgpt']);

function allProviders(customProviders = []) {
  return [...CATALOG, ...customProviders];
}

function byId(id, customProviders = []) {
  return allProviders(customProviders).find((p) => p.id === id) ?? null;
}

// Session partitions are fixed at WebContents creation, one per provider,
// so logins never cross-contaminate.
function partitionFor(id) {
  return `persist:provider-${id}`;
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validateCustomProvider(raw, existingIds = CATALOG.map((p) => p.id)) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'provider must be an object' };
  }
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) {
    return { ok: false, reason: 'provider name must be a non empty string' };
  }
  let url;
  try {
    url = new URL(String(raw.url));
  } catch {
    return { ok: false, reason: 'provider url is not a valid URL' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'provider url must use https' };
  }
  if (!url.hostname) {
    return { ok: false, reason: 'provider url must have a host' };
  }
  const id = typeof raw.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(raw.id)
    ? raw.id
    : slugify(name);
  if (!id) {
    return { ok: false, reason: 'provider id could not be derived from the name' };
  }
  if (existingIds.includes(id)) {
    return { ok: false, reason: `provider id "${id}" is already taken` };
  }
  return { ok: true, provider: { id, name, url: url.toString() } };
}

module.exports = {
  CATALOG,
  DEFAULT_ENABLED,
  allProviders,
  byId,
  partitionFor,
  validateCustomProvider,
};
