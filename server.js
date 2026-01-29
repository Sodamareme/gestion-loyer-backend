// server.js - Configuration corrigée

const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');  
require('dotenv').config();

// Import des routes
const proprietaireRoutes = require('./routes/proprietaireRoutes');
const locataireRoutes = require('./routes/locataireRoutes');
const bienRoutes = require('./routes/bienRoutes');
const contratRoutes = require('./routes/contratRoutes');
const paiementRoutes = require('./routes/paiementRoutes');
const pdfRoutes = require('./routes/pdfRoutes');
const locataire = require('./routes/locataire');
const proprietaireEspaceRoutes = require('./routes/proprietaire');
const inscriptionLocataireRoutes = require('./routes/inscriptionLocataire');
const inscriptionProprietaireRoutes = require('./routes/inscriptionProprietaire');
const agenceRoutes = require('./routes/agenceRoutes'); // 🆕 NOUVEAU
const demandesRoutes = require('./routes/demandes');
const authRoutes = require('./routes/auth');
const { authenticate, isAdmin } = require('./middleware/auth');
const agenceContratRoutes = require('./routes/agence_contrat_routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration CORS
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://gestion-loyer-frontend.vercel.app',
      /\.vercel\.app$/
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

// Créer les dossiers nécessaires s'ils n'existent pas
const directories = [
  'uploads/photos',
  'uploads/cni',
  'uploads/documents',
  'uploads/logos' // 🆕 NOUVEAU pour les logos des agences
];

directories.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✅ Dossier créé: ${dir}`);
  }
});

app.use(cors(corsOptions));
app.use(express.json());

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/documents', express.static(path.join(__dirname, 'documents')));

// ============================================
// ROUTES PUBLIQUES (sans authentification)
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/inscription-locataire', inscriptionLocataireRoutes);
app.use('/api/inscription-proprietaire', inscriptionProprietaireRoutes);

// ============================================
// ROUTES AGENCES (authentification requise, gérée dans le router)
// ============================================
// ✅ CORRECTION: Pas de isAdmin ici, c'est géré dans agenceRoutes.js
app.use('/api/agences', agenceContratRoutes);
app.use('/api/demandes', demandesRoutes);
app.use('/api/agences', agenceRoutes);
app.use('/api/contrats', agenceContratRoutes);
// ============================================
// ROUTES LOCATAIRE (authentification requise)
// ============================================
app.use('/api/locataire', require('./routes/locataire'));

// ============================================
// ROUTES BIENS (accessible aux admins ET agences)
// ============================================
app.use('/api/biens', require('./routes/bienRoutes'));

// ============================================
// ROUTES ADMIN (protégées par isAdmin)
// ============================================
app.use('/api/proprietaires', authenticate, isAdmin, require('./routes/proprietaireRoutes'));
app.use('/api/locataires', require('./routes/locataireRoutes'));
app.use('/api/contrats', authenticate, isAdmin, require('./routes/contratRoutes'));
app.use('/api/paiements', authenticate, isAdmin, require('./routes/paiementRoutes'));
app.use('/api/pdf', pdfRoutes);

// ============================================
// ROUTES PROPRIÉTAIRE
// ============================================
app.use('/api/proprietaire', proprietaireEspaceRoutes);
app.use('/api/agence-contrats', agenceContratRoutes);
// ============================================
// TEST ROUTES
// ============================================
app.get('/', (req, res) => {
  res.json({ 
    message: 'API Gestion Loyer fonctionne ✅',
    version: '1.0.0',
    database: 'PostgreSQL (Neon)',
    status: 'online',
    features: ['Agences', 'Propriétaires', 'Locataires', 'Biens', 'Contrats', 'Paiements']
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// GESTION DES ERREURS
// ============================================

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

// ============================================
// DÉMARRAGE DU SERVEUR
// ============================================
app.listen(PORT, () => {
  console.log('\n🚀 ================================');
  console.log(`✅ Serveur démarré sur le port ${PORT}`);
  console.log(`📊 API disponible sur http://localhost:${PORT}/api`);
  console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  Base de données: PostgreSQL (Neon)`);
  console.log(`🏢 Module Agences: Activé ✓`);
  console.log(`👥 Module Propriétaires: Activé ✓`);
  console.log(`🏠 Module Biens: Activé ✓`);
  console.log(`📄 Module Contrats: Activé ✓`);
  console.log('================================\n');
});