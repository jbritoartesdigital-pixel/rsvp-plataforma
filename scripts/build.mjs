import {build} from 'esbuild';
await build({entryPoints:['public/app.js'],bundle:true,format:'esm',platform:'browser',outfile:'public/vendor/app.js',minify:true});
await build({entryPoints:['src/index.js'],bundle:true,format:'esm',platform:'browser',conditions:['workerd','worker','browser'],external:['node:*'],outfile:'dist/worker.js'});
console.log('Frontend e Worker compilados.');
