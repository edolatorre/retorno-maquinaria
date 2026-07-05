#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
require('./db');
const { runSeed } = require('./seed');

runSeed();
console.log('');
console.log('Usuarios de prueba:');
console.log('  Cliente:       cliente@prueba.cl / prueba123');
console.log('  Transportista: transportista@prueba.cl / prueba123');
console.log('  Admin:         admin@retorno.cl / admin123');
console.log('');
console.log('Solicitudes demo: 8 Excavadoras CAT 320D (varias rutas en Chile)');
console.log('');
