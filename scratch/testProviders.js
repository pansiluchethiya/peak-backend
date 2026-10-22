// scratch/testProviders.js
// Runs every registered API provider against a TMDB id and prints the
// StreamResponse each provider produced.
//
//   node -r ts-node/register scratch/testProviders.js [tmdbId] [type] [season] [episode]
//
// Examples:
//   node -r ts-node/register scratch/testProviders.js 550 movie
//   node -r ts-node/register scratch/testProviders.js 1396 tv 1 1
//
// The API sources are ESM TypeScript, so the script installs a small
// CommonJS transpile hook (the API keeps using its own ESM build).

const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

process.env.DB_PATH = process.env.DB_PATH || ':memory:';

// Load the repository .env so the local configuration (VIDAPI_BASE_URL, ...)
// is used by the providers.
try {
  const envFile = path.join(__dirname, '..', '.env');
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const key = match[1];
    const value = match[2].replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
} catch {
  // no .env file, use the environment as is
}

const tmdbId = process.argv[2] || '550';
const type = process.argv[3] === 'tv' ? 'tv' : 'movie';
const season = Number.parseInt(process.argv[4] || '1', 10);
const episode = Number.parseInt(process.argv[5] || '1', 10);

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolve(request, parent, isMain, options) {
  if (/^\.{1,2}\//.test(request) && request.endsWith('.js') && parent && parent.filename) {
    const candidate = path.resolve(path.dirname(parent.filename), `${request.slice(0, -3)}.ts`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  });
  module._compile(output.outputText, filename);
};

const { defaultProviders } = require('../api/src/providers/registry.js');

const media = {
  tmdbId,
  type,
  ...(type === 'tv' ? { season, episode } : {}),
};

function summarize(sources) {
  return sources.map((source) => ({
    quality: source.quality,
    codec: source.codec,
    adaptive: source.adaptive === true,
    url: source.rawUrl.length > 140 ? `${source.rawUrl.slice(0, 140)}…` : source.rawUrl,
  }));
}

async function main() {
  const providers = defaultProviders();
  const failures = [];

  console.log(`Testing ${providers.length} providers for ${type} ${tmdbId}\n`);

  for (const provider of providers) {
    const started = Date.now();
    try {
      const result = await provider.getSources(media);
      const response = {
        id: media.tmdbId,
        type: media.type,
        title: `tmdb:${media.tmdbId}`,
        year: null,
        sources: summarize(result.sources),
        subtitles: (result.subtitles || []).map((subtitle) => ({
          lang: subtitle.lang,
          label: subtitle.label,
        })),
        diagnostics: result.diagnostics || [],
      };

      const ok = response.sources.length > 0 && response.sources.every((source) => source.url);
      if (!ok) failures.push(provider.id);

      console.log(
        `── ${provider.id} (${provider.name}) ${ok ? 'OK' : 'NO SOURCE'} ${Date.now() - started}ms`,
      );
      console.log(JSON.stringify(response, null, 2));
      console.log('');
    } catch (error) {
      failures.push(provider.id);
      console.log(`── ${provider.id} (${provider.name}) ERROR ${Date.now() - started}ms`);
      console.log(`   ${error && error.message ? error.message : String(error)}`);
      console.log('');
    }
  }

  console.log(
    `Summary: ${providers.length - failures.length}/${providers.length} providers returned a source`,
  );
  if (failures.length > 0) console.log(`Without source: ${failures.join(', ')}`);
  process.exitCode = failures.length > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
