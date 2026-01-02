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
const locataire = require('./routes/locataire')
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/documents', express.static(path.join(__dirname, 'documents')));

const authRoutes = require('./routes/auth');
;
const { authenticate, isAdmin } = require('./middleware/auth');
// Routes
app.use('/uploads', express.static('uploads'));
app.use('/documents', express.static('documents'));
app.use('/api/auth', authRoutes);
// Routes locataire

app.use('/api/locataire', require('./routes/locataire'));

// Routes admin (protégées)
app.use('/api/proprietaires', authenticate, isAdmin, require('./routes/proprietaireRoutes'));
app.use('/api/locataires', authenticate, isAdmin, require('./routes/locataireRoutes'));
app.use('/api/biens', authenticate, isAdmin, require('./routes/bienRoutes'));
app.use('/api/contrats', authenticate, isAdmin, require('./routes/contratRoutes'));
app.use('/api/paiements', authenticate, isAdmin, require('./routes/paiementRoutes'));
app.use('/api/pdf', pdfRoutes);

// Test route
app.get('/', (req, res) => res.send('API Gestion Loyer fonctionne ✅'));

// Démarrage du serveur
app.listen(PORT, () => {
    console.log(`✅ Serveur démarré sur le port ${PORT}`);
    console.log(`📊 API disponible sur http://localhost:${PORT}/api`);
});
