require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const authMiddleware = require('./middleware/auth');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'https://edg.bg',
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));

// Rate limiting: 30 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Твърде много заявки. Моля, опитайте отново след минута.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Static files (widget)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Admin panel
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Dev-only: generate test JWT token
app.get('/api/dev/token', (req, res) => {
  const jwt = require('jsonwebtoken');
  const role = req.query.role || 'director';
  const token = jwt.sign(
    {
      user_id: 'test-user-1',
      role,
      institution_id: 'test-inst-1',
      institution_name: req.query.institution || 'ДГ Тест',
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
  res.json({ token, role });
});

// Routes
app.use('/api/chat', authMiddleware, chatRoutes);
app.use('/api/admin', authMiddleware, adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint не е намерен' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Вътрешна грешка на сървъра' });
});

app.listen(PORT, () => {
  console.log(`EDG Chatbot API running on port ${PORT}`);
});

module.exports = app;
