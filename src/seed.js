const bcrypt = require('bcryptjs');
const db = require('./db');
const config = require('./config');

const TEST_USERS = [
  {
    email: 'cliente@prueba.cl',
    password: 'prueba123',
    nombre: 'Juan Constructor',
    telefono: '+56 9 8765 4321',
    rol: 'cliente',
    empresa: 'Constructora Demo SpA',
    rut: '76.543.210-K'
  },
  {
    email: 'transportista@prueba.cl',
    password: 'prueba123',
    nombre: 'Carlos Camión',
    telefono: '+56 9 1234 5678',
    rol: 'transportista',
    empresa: 'Transportes Pesados CC',
    rut: '12.345.678-9'
  }
];

const TEST_SOLICITUD = {
  email: 'cliente@prueba.cl',
  tipo_maquina: 'Excavadora',
  marca: 'Caterpillar',
  modelo: '320D',
  peso: '22 toneladas',
  dimensiones: '9.5m × 2.5m × 3.2m',
  fecha_retiro: '2026-07-15',
  origen: 'Santiago, Región Metropolitana',
  destino: 'Rancagua, Región de O\'Higgins',
  comentarios: 'Acceso por camino de tierra. Máquina operativa.'
};

function createUser({ email, password, nombre, telefono, rol, empresa, rut }) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return existing.id;

  const password_hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, nombre, telefono, rol, empresa, rut)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(email.toLowerCase(), password_hash, nombre, telefono, rol, empresa, rut);

  console.log(`[seed] Usuario creado: ${email} (${rol})`);
  return result.lastInsertRowid;
}

function seedAdmin() {
  const { email, password, nombre } = config.admin;
  createUser({ email, password, nombre, telefono: null, rol: 'admin', empresa: null, rut: null });
}

function seedTestUsers() {
  for (const user of TEST_USERS) {
    createUser(user);
  }
}

function seedTestSolicitud() {
  const cliente = db.prepare('SELECT id FROM users WHERE email = ?').get(TEST_SOLICITUD.email);
  if (!cliente) return;

  const existing = db.prepare('SELECT id FROM solicitudes WHERE user_id = ? LIMIT 1').get(cliente.id);
  if (existing) return;

  db.prepare(`
    INSERT INTO solicitudes (user_id, tipo_maquina, marca, modelo, peso, dimensiones, fecha_retiro, origen, destino, comentarios)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cliente.id,
    TEST_SOLICITUD.tipo_maquina,
    TEST_SOLICITUD.marca,
    TEST_SOLICITUD.modelo,
    TEST_SOLICITUD.peso,
    TEST_SOLICITUD.dimensiones,
    TEST_SOLICITUD.fecha_retiro,
    TEST_SOLICITUD.origen,
    TEST_SOLICITUD.destino,
    TEST_SOLICITUD.comentarios
  );

  console.log('[seed] Solicitud de prueba creada (Excavadora CAT 320D)');
}

function runSeed() {
  seedAdmin();
  seedTestUsers();
  seedTestSolicitud();
}

module.exports = { seedAdmin, seedTestUsers, seedTestSolicitud, runSeed, TEST_USERS };
