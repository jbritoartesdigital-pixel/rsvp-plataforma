import {passwordHash} from '../src/auth.js';
const [email,name]=process.argv.slice(2);
if(!email||!name||!process.env.BOOTSTRAP_PASSWORD)throw Error('Informe email e nome como argumentos, e BOOTSTRAP_PASSWORD no ambiente local.');
const quote=s=>`'${String(s).replace(/'/g,"''")}'`;
const values=[crypto.randomUUID(),null,email.toLowerCase(),name,await passwordHash(process.env.BOOTSTRAP_PASSWORD),'super_admin',new Date().toISOString()];
console.log(`INSERT INTO users VALUES(${values.map(v=>v===null?'NULL':quote(v)).join(',')});`);
