import {readdirSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
for(const dir of ['src','public','scripts','tests']) for(const file of readdirSync(dir)) if(/\.(m?js)$/.test(file)) {
 const result=spawnSync(process.execPath,['--check',`${dir}/${file}`],{encoding:'utf8'});
 if(result.status) { console.error(result.stderr); process.exit(1); }
}
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
if(config.name==='libri-rsvp'||config.d1_databases.some(d=>d.database_id==='83b4f425-48ae-4b08-b286-83abdae277ed'||d.database_name==='libri-rsvp-db')||config.r2_buckets.some(b=>b.bucket_name==='libri-videos')) throw Error('Referência de produção proibida');
const yaml=readFileSync('.github/workflows/deploy.yml','utf8');
if(!yaml.includes('workflow_dispatch:')||yaml.includes('push:')||yaml.indexOf('pnpm run db:migrate:remote')>yaml.indexOf('pnpm run deploy')) throw Error('Deploy deve ser manual, com migrações antes da publicação.');
console.log('Sintaxe, isolamento da configuração e ordem de deploy verificados.');
