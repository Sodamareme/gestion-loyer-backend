const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

// Import des routes
const proprietaireRoutes = require('./routes/proprietaireRoutes');
const locataireRoutes = require('./routes/locataireRoutes');
const bienRoutes = require('./routes/bienRoutes');
const contratRoutes = require('./routes/contratRoutes');
const paiementRoutes = require('./routes/paiementRoutes');
const pdfRoutes = require('./routes/pdfRoutes');
const locataire = require('./routes/locataire');
const authRoutes = require('./routes/auth');
const { authenticate, isAdmin } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration CORS corrigée
const corsOptions = {
  origin: function (origin, callback) {
    // Autoriser les requêtes sans origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://gestion-loyer-frontend.vercel.app',
      /\.vercel\.app$/  // Tous les sous-domaines Vercel
    ];
    
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return allowed === origin;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.log('❌ Origin refusée:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/documents', express.static(path.join(__dirname, 'documents')));

// Routes publiques
app.use('/api/auth', authRoutes);

// Routes locataire (authentification requise mais pas admin)
app.use('/api/locataire', require('./routes/locataire'));

// Routes admin (protégées)
app.use('/api/proprietaires', authenticate, isAdmin, require('./routes/proprietaireRoutes'));
app.use('/api/locataires', authenticate, isAdmin, require('./routes/locataireRoutes'));
app.use('/api/biens', authenticate, isAdmin, require('./routes/bienRoutes'));
app.use('/api/contrats', authenticate, isAdmin, require('./routes/contratRoutes'));
app.use('/api/paiements', authenticate, isAdmin, require('./routes/paiementRoutes'));
app.use('/api/pdf', pdfRoutes);

// Test route
app.get('/', (req, res) => {
  res.json({ 
    message: 'API Gestion Loyer fonctionne ✅',
    version: '1.0.0',
    database: 'PostgreSQL (Neon)',
    status: 'online'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Gestion des erreurs 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
  console.error('❌ Erreur serveur:', err);
  res.status(500).json({ 
    error: 'Erreur serveur',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Une erreur est survenue'
  });
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur le port ${PORT}`);
  console.log(`📊 API disponible sur http://localhost:${PORT}/api`);
  console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  Base de données: PostgreSQL`);
});