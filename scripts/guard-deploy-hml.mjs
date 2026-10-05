import {readFileSync} from 'node:fs';

const c=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
const h=c.env?.hml;
const prodD1=c.d1_databases?.[0];
const prodR2=c.r2_buckets?.[0];
const hmlD1=h?.d1_databases?.[0];
const hmlR2=h?.r2_buckets?.[0];

if(c.name!=='rsvp-plataforma') throw Error('Projeto comercial obrigatório.');
if(prodD1?.database_name!=='rsvp-plataforma-db'||prodD1?.database_id!=='0856c666-5e49-4728-b78c-f22cacf9436d'||prodR2?.bucket_name!=='rsvp-plataforma-media') throw Error('Configuração de produção comercial foi alterada.');
if(!h) throw Error('Ambiente hml não configurado.');
if(hmlD1?.database_name!=='rsvp-plataforma-hml-db'||hmlD1?.database_id!=='b0191527-8fdc-4021-bd51-6c7f205044dc') throw Error('D1 de homologação inválido.');
if(hmlR2?.bucket_name!=='rsvp-plataforma-hml-media') throw Error('R2 de homologação inválido.');
if(hmlD1.database_id===prodD1.database_id||hmlR2.bucket_name===prodR2.bucket_name) throw Error('Homologação não pode usar recursos de produção.');
if(JSON.stringify(h).includes('libri-rsvp')||JSON.stringify(h).includes('83b4f425-48ae-4b08-b286-83abdae277ed')||JSON.stringify(h).includes('libri-videos')) throw Error('Recurso libri-rsvp proibido.');
if(h.vars?.APP_ORIGIN!=='https://rsvp-plataforma-hml.jbrito-artesdigital.workers.dev'||h.vars?.RP_ID!=='rsvp-plataforma-hml.jbrito-artesdigital.workers.dev') throw Error('Origem/RP ID de homologação inválidos.');
if(new URL(h.vars.APP_ORIGIN).hostname!==h.vars.RP_ID) throw Error('RP_ID de homologação deve corresponder ao domínio.');
for(const n of [1,5,10]) if(!Number.isInteger(Number(h.vars[`CREDIT_${n}_CENTS`]))||Number(h.vars[`CREDIT_${n}_CENTS`])<=0) throw Error(`Configure preço HML do pacote de ${n} créditos.`);
if(!Number.isInteger(Number(h.vars.MONTHLY_CENTS))||Number(h.vars.MONTHLY_CENTS)<=0) throw Error('Configure preço mensal HML.');
if('MP_ACCESS_TOKEN' in h.vars||'MP_WEBHOOK_SECRET' in h.vars) throw Error('Segredos Mercado Pago não podem ficar no wrangler.jsonc.');

console.log('Homologação comercial isolada validada.');
