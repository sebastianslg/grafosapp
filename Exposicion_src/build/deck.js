const fs = require('fs');
const L = require('./lib.js'); const { ALG } = require('./contenido.js'); const S = require('./algoritmos_slides.js'); const G = require('./general_slides.js');
const ORDEN = ['nn', 'barrido', 'insercion', 'petalos', 'fj', 'split', 'dos_opt', 'oropt', 'vnd', 'tabu', 'sa', 'ils', 'vns', 'lns', 'grasp', 'ga', 'aco', 'bb'];
G.portada(); G.agenda(); G.porque(); G.mapa(); G.instancia(); G.evaluacion(); G.vecindarios(); G.ejecutar();
ORDEN.forEach((id) => S.algoritmoCompleto(ALG.find((a) => a.id === id)));
G.comparacionGrafica(); G.comparacion(); G.robustez(); G.parametros(); G.decision(); G.verificacion(); G.conclusiones(); G.referencias();
const out = process.argv[2] || 'deck.pptx';
fs.writeFileSync(out.replace(/\.pptx$/, '') + '_log.json', JSON.stringify(L.LOG));
L.pres.writeFile({ fileName: out }).then(() => { require('child_process').execSync(`python3 ${__dirname}/../ref/comprimir_pptx.py ${out}`); console.log('ok', L.getN(), out); });
