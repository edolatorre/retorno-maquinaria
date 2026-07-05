const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, authRequired } = require('../middleware/auth');

const router = express.Router();

router.post('/register', (req, res) => {
  const { email, password, nombre, telefono, rol, empresa, rut } = req.body;

  if (!email || !password || !nombre || !rol) {
    return res.status(400).json({ error: 'Email, contraseña, nombre y rol son obligatorios' });
  }
  if (!['cliente', 'transportista'].includes(rol)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'Este email ya está registrado' });
  }

  const password_hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, nombre, telefono, rol, empresa, rut)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(email.toLowerCase(), password_hash, nombre, telefono || null, rol, empresa || null, rut || null);

  const user = { id: result.lastInsertRowid, email: email.toLowerCase(), nombre, rol };
  const token = signToken(user);

  res.status(201).json({ token, user: { ...user, telefono, empresa, rut } });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      telefono: user.telefono,
      rol: user.rol,
      empresa: user.empresa,
      rut: user.rut
    }
  });
});

router.get('/me', authRequired, (req, res) => {
  const user = db.prepare('SELECT id, email, nombre, telefono, rol, empresa, rut, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ user });
});

module.exports = router;
