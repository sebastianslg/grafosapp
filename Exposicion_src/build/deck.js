const L = require('./lib.js'); const { ALG } = require('./contenido.js'); const S = require('./algoritmos_slides.js'); const G = require('./general_slides.js');
G.portada(); G.agenda(); G.porque(); G.mapa(); G.instancia(); G.evaluacion(); G.vecindarios(); G.ejecutar();
ALG.forEach((a) => S.algoritmoCompleto(a));
G.comparacionGrafica(); G.comparacion(); G.robustez(); G.parametros(); G.decision(); G.verificacion(); G.conclusiones(); G.referencias();
const out = process.argv[2] || 'deck.pptx';
L.pres.writeFile({ fileName: out }).then(() => console.log('ok', L.getN(), out));
