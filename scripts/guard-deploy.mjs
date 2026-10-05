import {readFileSync} from 'node:fs';
const c=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
if(c.name!=='rsvp-plataforma'||c.d1_databases[0].database_name!=='rsvp-plataforma-db'||c.r2_buckets[0].bucket_name!=='rsvp-plataforma-media') throw Error('Destino comercial obrigatório.');
if(c.d1_databases[0].database_id==='83b4f425-48ae-4b08-b286-83abdae277ed'||!/^[-a-f0-9]{36}$/.test(c.d1_databases[0].database_id)) throw Error('Configure um D1 comercial novo.');
if(!c.vars.APP_ORIGIN.startsWith('https://')||JSON.stringify(c).includes('REPLACE_')) throw Error('Configure domínio e RP ID comerciais.');
if(new URL(c.vars.APP_ORIGIN).hostname!==c.vars.RP_ID) throw Error('RP_ID deve corresponder ao domínio.');
for(const n of [1,5,10]) if(!Number.isInteger(Number(c.vars[`CREDIT_${n}_CENTS`]))||Number(c.vars[`CREDIT_${n}_CENTS`])<=0) throw Error(`Configure preço do pacote de ${n} créditos.`);
if(!c.vars.MP_COLLECTOR_ID) throw Error('Configure o ID da conta recebedora Mercado Pago.');
console.log('Destino comercial validado.');
