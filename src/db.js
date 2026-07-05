const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const dbPath = path.join(dataDir, 'retorno.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    nombre TEXT NOT NULL,
    telefono TEXT,
    rol TEXT NOT NULL CHECK(rol IN ('cliente', 'transportista', 'admin')),
    empresa TEXT,
    rut TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS solicitudes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    tipo_maquina TEXT NOT NULL,
    marca TEXT NOT NULL,
    modelo TEXT NOT NULL,
    peso TEXT NOT NULL,
    dimensiones TEXT NOT NULL,
    fecha_retiro TEXT NOT NULL,
    origen TEXT NOT NULL,
    destino TEXT NOT NULL,
    comentarios TEXT,
    estado TEXT NOT NULL DEFAULT 'abierta',
    oferta_id INTEGER,
    transportista_id INTEGER,
    auto_confirm_at TEXT,
    entrega_confirmada_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ofertas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    solicitud_id INTEGER NOT NULL,
    transportista_id INTEGER NOT NULL,
    valor REAL NOT NULL,
    fecha_carga TEXT NOT NULL,
    fecha_entrega TEXT NOT NULL,
    comentarios TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente', 'aceptada', 'rechazada')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id),
    FOREIGN KEY (transportista_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    solicitud_id INTEGER NOT NULL UNIQUE,
    oferta_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,
    transportista_id INTEGER NOT NULL,
    monto REAL NOT NULL,
    comision REAL NOT NULL DEFAULT 0,
    mp_preference_id TEXT,
    mp_payment_id TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente', 'aprobado', 'retenido', 'liberado', 'reembolsado')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at TEXT,
    released_at TEXT,
    FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id),
    FOREIGN KEY (oferta_id) REFERENCES ofertas(id)
  );

  CREATE TABLE IF NOT EXISTS reportes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    solicitud_id INTEGER NOT NULL,
    transportista_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('retiro', 'entrega')),
    comentarios TEXT,
    detalles TEXT,
    receptor_nombre TEXT,
    receptor_rut TEXT,
    receptor_telefono TEXT,
    receptor_email TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id),
    FOREIGN KEY (transportista_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reporte_fotos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporte_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (reporte_id) REFERENCES reportes(id)
  );

  CREATE TABLE IF NOT EXISTS facturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    solicitud_id INTEGER NOT NULL,
    pago_id INTEGER NOT NULL,
    numero TEXT NOT NULL UNIQUE,
    monto REAL NOT NULL,
    rut_cliente TEXT,
    nombre_cliente TEXT,
    estado TEXT NOT NULL DEFAULT 'emitida' CHECK(estado IN ('emitida', 'anulada')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id),
    FOREIGN KEY (pago_id) REFERENCES pagos(id)
  );
`);

function columnExists(table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
}

function migrateV2() {
  if (!columnExists('solicitudes', 'oferta_id')) {
    db.exec(`ALTER TABLE solicitudes ADD COLUMN oferta_id INTEGER`);
    db.exec(`ALTER TABLE solicitudes ADD COLUMN transportista_id INTEGER`);
    db.exec(`ALTER TABLE solicitudes ADD COLUMN auto_confirm_at TEXT`);
    db.exec(`ALTER TABLE solicitudes ADD COLUMN entrega_confirmada_at TEXT`);
  }
}

function migrateAdminRole() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (!row || row.sql.includes("'admin'")) return;
  db.exec(`
    CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nombre TEXT NOT NULL,
      telefono TEXT,
      rol TEXT NOT NULL CHECK(rol IN ('cliente', 'transportista', 'admin')),
      empresa TEXT,
      rut TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO users_new SELECT * FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
  `);
}

migrateAdminRole();
migrateV2();

module.exports = db;
