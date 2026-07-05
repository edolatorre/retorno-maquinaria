const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

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
    estado TEXT NOT NULL DEFAULT 'abierta' CHECK(estado IN ('abierta', 'en_oferta', 'asignada', 'completada', 'cancelada')),
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
`);

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

module.exports = db;
