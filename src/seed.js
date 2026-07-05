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

const TEST_SOLICITUDES = [
  {
    key: '320d-01',
    tipo_maquina: 'Excavadora',
    marca: 'Caterpillar',
    modelo: '320D',
    peso: '22 toneladas',
    dimensiones: '9.5m × 2.5m × 3.2m',
    fecha_retiro: '2026-07-15',
    origen: 'Santiago, Región Metropolitana',
    destino: 'Rancagua, Región de O\'Higgins',
    comentarios: 'Acceso por camino de tierra. Máquina operativa.'
  },
  {
    key: '320d-02',
    tipo_maquina: 'Excavadora',
    marca: 'Caterpillar',
    modelo: '320D',
    peso: '22 toneladas',
    dimensiones: '9.5m × 2.5m × 3.2m',
    fecha_retiro: '2026-07-18',
    origen: 'Valparaíso, Región de Valparaíso',
    destino: 'Santiago, Región Metropolitana',
    comentarios: 'Retiro en puerto. Requiere permiso municipal.'
  },
  {
    key: '320d-03',
    tipo_maquina: 'Excavadora',
    marca: 'Caterpillar',
    modelo: '320D',
    peso: '22 toneladas',
    dimensiones: '9.5m × 2.5m × 3.2m',
    fecha_retiro: '2026-07-20',
    origen: 'Concepción, Región del Biobío',
    destino: 'Temuco, Región de La Araucanía',
    comentarios: 'Máquina con cabina ROPS. Faena minera.'
  },
  {
    key: '320d-04',
    tipo_maquina: 'Excavadora',
    marca: 'Caterpillar',
    modelo: '320D',
    peso: '22 toneladas',
    dimensiones: '9.5m × 2.5m × 3.2m',
    fecha_retiro: '2026-07-22',
    origen: 'Antofagasta, Región de Antofagasta',
    destino: 'Calama, Región de Antofagasta',
    comentarios: 'Traslado en zona norte. Horario diurno preferente.'
  },
  {
    key: '320d-05',
    tipo_maquina: 'Excavadora',
    marca: 'Caterpillar',
    modelo: '320D',
    peso: '22 toneladas',
    dimensiones: '9.5m × 2.5m × 3.2m',
    fecha_retiro: '2026-07-25',
    origen: 'La Serena, Región de Coquimbo',
    destino: 'Ovalle, Región de Coquimbo',
    comentarios: 'Excavadora con martillo hidráulico desmontado.'
  },
  {
    key: '320d-06',
    tipo_maquina: 'Excavadora',
    marca: 'Caterpillar',
    modelo: '320D',
    peso: '22 toneladas',
    dimensiones: '9.5m × 2.5m × 3.2m',
    fecha_retiro: '2026-07-28',
    origen: 'Puerto Montt, Región de Los Lagos',
    destino: 'Osorno, Región de Los Lagos',
    comentarios: 'Ruta con ferry. Coordinar horarios con anticipación.'
  },
  {
    key: '320d-07',
    tipo_maquina: 'Excavadora',
    marca: 'Caterpillar',
    modelo: '320D',
    peso: '22 toneladas',
    dimensiones: '9.5m × 2.5m × 3.2m',
    fecha_retiro: '2026-08-01',
    origen: 'Talca, Región del Maule',
    destino: 'Chillán, Región de Ñuble',
    comentarios: 'Obra vial en construcción. Acceso restringido 8:00–18:00.'
  },
  {
    key: '320d-08',
    tipo_maquina: 'Excavadora',
    marca: 'Caterpillar',
    modelo: '320D',
    peso: '22 toneladas',
    dimensiones: '9.5m × 2.5m × 3.2m',
    fecha_retiro: '2026-08-05',
    origen: 'Iquique, Región de Tarapacá',
    destino: 'Arica, Región de Arica y Parinacota',
    comentarios: 'Traslado largo por ruta 5. Documentación al día.'
  }
];

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
  const cliente = db.prepare('SELECT id FROM users WHERE email = ?').get('cliente@prueba.cl');
  if (!cliente) return;

  let created = 0;
  const insert = db.prepare(`
    INSERT INTO solicitudes (user_id, tipo_maquina, marca, modelo, peso, dimensiones, fecha_retiro, origen, destino, comentarios)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const sol of TEST_SOLICITUDES) {
    const marker = `[seed:${sol.key}]`;
    const exists = db.prepare(`
      SELECT id FROM solicitudes WHERE user_id = ? AND comentarios LIKE ?
    `).get(cliente.id, `%${marker}%`);
    if (exists) continue;

    insert.run(
      cliente.id,
      sol.tipo_maquina,
      sol.marca,
      sol.modelo,
      sol.peso,
      sol.dimensiones,
      sol.fecha_retiro,
      sol.origen,
      sol.destino,
      `${sol.comentarios} ${marker}`.trim()
    );
    created++;
  }

  if (created > 0) {
    console.log(`[seed] ${created} solicitud(es) de prueba creada(s) (Excavadora CAT 320D)`);
  }
}

function runSeed() {
  seedAdmin();
  seedTestUsers();
  seedTestSolicitud();
}

module.exports = { seedAdmin, seedTestUsers, seedTestSolicitud, runSeed, TEST_USERS, TEST_SOLICITUDES };
