const L = require('./lib.js'); const { ALG } = require('./contenido.js'); const S = require('./algoritmos_slides.js');
const only = process.argv.slice(2);
ALG.forEach((a) => { if (!only.length || only.includes(a.id)) S.algoritmoCompleto(a); });
L.pres.writeFile({ fileName: 'prueba_alg.pptx' }).then(() => console.log('ok', L.getN()));
