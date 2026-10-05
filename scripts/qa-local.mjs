// Runs only local validation. Does not deploy or access a remote D1 database.
import {spawnSync} from 'node:child_process';
function execute(args){const r=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});if(r.status!==0)process.exit(r.status||1);}
execute(['scripts/check.mjs']);
execute(['--test','tests/critical-flow.test.mjs','tests/schema.test.mjs']);
await import('./build.mjs');
execute(['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','DB','--local']);
execute(['node_modules/wrangler/bin/wrangler.js','deploy','--dry-run','--outdir','dist/cloudflare']);
if(process.env.PLAYWRIGHT_MODULE)await import('../tests/browser-smoke.mjs');
