const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { generateNumeroDocument } = require('./numeroService');
const DOCUMENTS_DIR = path.join(__dirname, '../documents');
// ========================================
// CONFIGURATION PROFESSIONNELLE
// ========================================

const COLORS = {
  primary: '#1e40af',
  primaryLight: '#3b82f6',
  secondary: '#64748b',
  success: '#059669',
  warning: '#d97706',
  danger: '#dc2626',
  dark: '#0f172a',
  light: '#f8fafc',
  border: '#e2e8f0',
  bgGray: '#f1f5f9'
};

const FONTS = {
  bold: 'Helvetica-Bold',
  regular: 'Helvetica',
  italic: 'Helvetica-Oblique'
};

const ensureDocumentsFolder = () => {
  const dir = path.join(__dirname, '../documents');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const generateReference = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'REF-';
  for (let i = 0; i < 12; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const formatDate = (date) => {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
};

const formatMoney = (amount) => {
  return Number(amount || 0).toLocaleString('fr-FR').replace(/\s/g, ' ');
};

// ========================================
// COMPOSANTS DE DESIGN
// ========================================

// En-tête élégant avec dégradé
const drawHeader = (doc, title, numero) => {
  const w = doc.page.width;
  
  // Dégradé bleu élégant
  for (let i = 0; i < 70; i++) {
    doc.save()
       .opacity(0.9 - (i / 100))
       .rect(0, i * 1.3, w, 1.3)
       .fill(COLORS.primary)
       .restore();
  }
  
  // Carte logo blanche
  doc.save()
     .roundedRect(35, 22, 170, 68, 8)
     .fill('#ffffff')
     .restore();
  
  // Logo VOSCLES
  doc.fillColor(COLORS.primary)
     .fontSize(24)
     .font(FONTS.bold)
     .text('VOSCLES', 45, 32);
  
  doc.fontSize(8)
     .font(FONTS.regular)
     .fillColor(COLORS.secondary)
     .text('Gestion Immobiliere Professionnelle', 45, 58)
     .fontSize(7)
     .text('59 Cite Claudel, Dakar', 45, 70)
     .text('Tel: 771284274', 45, 80);
  
  // Badge numéro document
  doc.save()
     .roundedRect(w - 220, 28, 185, 48, 8)
     .fill('#ffffff')
     .restore();
  
  doc.fontSize(10)
     .font(FONTS.regular)
     .fillColor(COLORS.secondary)
     .text(title, w - 220, 38, { width: 185, align: 'center' });
  
  doc.fontSize(15)
     .font(FONTS.bold)
     .fillColor(COLORS.primary)
     .text(numero, w - 220, 55, { width: 185, align: 'center' });
  
  return 110;
};

// Ligne de séparation élégante
const drawSeparator = (doc, y, withDots = false) => {
  if (withDots) {
    doc.save()
       .moveTo(35, y)
       .lineTo(doc.page.width - 35, y)
       .dash(3, 3)
       .strokeColor(COLORS.border)
       .stroke()
       .restore();
  } else {
    doc.save()
       .rect(35, y, doc.page.width - 70, 2)
       .fill(COLORS.primary)
       .restore();
  }
  return y + 10;
};

// Section titre
const drawSectionTitle = (doc, title, y) => {
  doc.fontSize(11)
     .font(FONTS.bold)
     .fillColor(COLORS.primary)
     .text(title, 35, y);
  
  return y + 20;
};

// Carte info élégante en ligne
const drawInfoRow = (doc, label, value, y, highlight = false) => {
  doc.fontSize(8)
     .font(FONTS.regular)
     .fillColor(COLORS.secondary)
     .text(label, 45, y);
  
  doc.font(highlight ? FONTS.bold : FONTS.bold)
     .fillColor(highlight ? COLORS.primary : COLORS.dark)
     .text(value, 150, y, { width: 400 });
  
  return y + 16;
};

// Tableau moderne
const drawTable = (doc, headers, rows, y, totals = null) => {
  const startY = y;
  const colWidths = [350, 180];
  const rowHeight = 24;
  const x = 35;
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  
  // En-tête
  doc.save()
     .rect(x, y, tableWidth, 28)
     .fill(COLORS.primary)
     .restore();
  
  doc.fontSize(9)
     .font(FONTS.bold)
     .fillColor('#ffffff');
  
  doc.text(headers[0], x + 10, y + 9);
  doc.text(headers[1], x + colWidths[0], y + 9, { width: colWidths[1], align: 'right' });
  
  y += 28;
  
  // Lignes
  rows.forEach((row, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : COLORS.light;
    
    doc.save()
       .rect(x, y, tableWidth, rowHeight)
       .fill(bg)
       .restore();
    
    doc.fontSize(9)
       .font(row.bold ? FONTS.bold : FONTS.regular)
       .fillColor(row.color || COLORS.dark);
    
    doc.text(row.label, x + 10, y + 7);
    doc.text(formatMoney(row.amount), x + colWidths[0], y + 7, { 
      width: colWidths[1] - 10, 
      align: 'right' 
    });
    
    y += rowHeight;
  });
  
  // Total
  if (totals) {
    doc.save()
       .rect(x, y, tableWidth, 32)
       .fill(COLORS.primary)
       .restore();
    
    doc.fontSize(10)
       .font(FONTS.bold)
       .fillColor('#ffffff');
    
    doc.text(totals.label, x + 10, y + 10);
    doc.text(formatMoney(totals.amount), x + colWidths[0], y + 10, { 
      width: colWidths[1] - 10, 
      align: 'right' 
    });
    
    y += 32;
  }
  
  // Bordure
  doc.save()
     .rect(x, startY, tableWidth, y - startY)
     .strokeColor(COLORS.border)
     .lineWidth(1)
     .stroke()
     .restore();
  
  return y + 12;
};

// Badge statut
const drawBadge = (doc, text, color, x, y) => {
  const padding = 12;
  const w = doc.widthOfString(text) + padding * 2;
  
  doc.save()
     .roundedRect(x, y, w, 26, 6)
     .fill(color)
     .restore();
  
  doc.fontSize(9)
     .font(FONTS.bold)
     .fillColor('#ffffff')
     .text(text, x + padding, y + 8);
  
  return w;
};

// Alerte
const drawAlert = (doc, text, type, y) => {
  const colors = {
    success: { bg: '#d1fae5', border: '#10b981' },
    warning: { bg: '#fef3c7', border: '#f59e0b' },
    danger: { bg: '#fee2e2', border: '#ef4444' },
    info: { bg: '#dbeafe', border: '#3b82f6' }
  };
  
  const c = colors[type] || colors.info;
  const w = doc.page.width - 70;
  
  doc.save()
     .rect(35, y, 5, 32)
     .fill(c.border)
     .restore();
  
  doc.save()
     .rect(40, y, w - 5, 32)
     .fill(c.bg)
     .restore();
  
  doc.fontSize(7)
     .font(FONTS.bold)
     .fillColor(COLORS.dark)
     .text(text, 50, y + 10, { width: w - 25 });
  
  return y + 40;
};

// Pied de page
const drawFooter = (doc) => {
  const y = doc.page.height - 35;
  
  doc.save()
     .moveTo(35, y)
     .lineTo(doc.page.width - 35, y)
     .strokeColor(COLORS.border)
     .lineWidth(1)
     .stroke()
     .restore();
  
  doc.fontSize(7)
     .font(FONTS.italic)
     .fillColor(COLORS.secondary)
     .text(
       `Document officiel genere le ${formatDate(new Date())} par VOSCLES`,
       0,
       y + 10,
       { width: doc.page.width, align: 'center' }
     );
};

// ========================================
// QUITTANCE DE LOYER
// ========================================
// Créer le dossier documents s'il n'existe pas
if (!fs.existsSync(DOCUMENTS_DIR)) {
  fs.mkdirSync(DOCUMENTS_DIR, { recursive: true });
}

// ✅ FONCTION UTILITAIRE: Enregistrer un document dans la base de données
const enregistrerDocument = async (type, nomFichier, url, contratId, paiementId = null, moisConcerne = null, montant = null) => {
  try {
    const query = `
      INSERT INTO documents (type, nom_fichier, url, contrat_id, paiement_id, mois_concerne, montant, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id
    `;

    const result = await pool.query(query, [
      type,
      nomFichier,
      url,
      contratId,
      paiementId,
      moisConcerne,
      montant
    ]);

    console.log('✅ Document enregistré en BDD:', result.rows[0].id);
    return result.rows[0].id;
  } catch (error) {
    console.error('❌ Erreur enregistrement document:', error);
    throw error;
  }
};
exports.generateQuittance = async (paiement) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 0, size: 'A4' });
      
      const numeroQuittance = await generateNumeroDocument('QL');
      const codeReference = generateReference();
      
      const dir = ensureDocumentsFolder();
      const fileName = `quittance_${numeroQuittance}.pdf`;
      const filePath = path.join(dir, fileName);

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      let y = drawHeader(doc, 'QUITTANCE DE LOYER', numeroQuittance);
      
      // Informations principales
      y = drawSectionTitle(doc, 'INFORMATIONS GENERALES', y);
      
      const dateDebut = new Date(paiement.mois_concerne);
      const dateFin = new Date(dateDebut.getFullYear(), dateDebut.getMonth() + 1, 0);
      
      y = drawInfoRow(doc, 'Periode', `Du ${formatDate(dateDebut)} au ${formatDate(dateFin)}`, y, true);
      y = drawInfoRow(doc, 'Bien loue', paiement.bien_adresse || '', y);
      y = drawInfoRow(doc, 'Locataire', paiement.locataire_nom || '', y);
      
      y += 8;
      y = drawSeparator(doc, y, true);
      
      // Détail paiement
      y = drawSectionTitle(doc, 'DETAIL DU PAIEMENT', y);
      
      const montantLoyer = Number(paiement.montant_loyer) || 0;
      const chargesStruct = Number(paiement.charges_structurelles) || 0;
      const charges = Number(paiement.charges) || 0;
      const eau = Number(paiement.montant_eau) || 0;
      const internet = Number(paiement.montant_internet) || 0;
      const tva = Number(paiement.tva) || 0;
      
      const rows = [
        { label: 'Loyer mensuel', amount: montantLoyer },
        { label: 'Charges structurelles', amount: chargesStruct },
        { label: 'Provisions pour charges', amount: charges },
        { label: 'Eau', amount: eau },
        { label: 'Internet', amount: internet },
        { label: 'TVA', amount: tva }
      ];
      
      const montantDu = montantLoyer + chargesStruct + charges + eau + internet + tva;
      const montantPaye = Number(paiement.montant_paye);
      const resteAPayer = Math.max(0, montantDu - montantPaye);
      const estComplet = montantPaye >= montantDu;
      
      const datePaiement = new Date(paiement.date_paiement);
      const dateEcheance = new Date(paiement.mois_concerne);
      dateEcheance.setDate(10);
      const joursRetard = Math.floor((datePaiement - dateEcheance) / (1000 * 60 * 60 * 24));
      
      y = drawTable(doc, ['DESIGNATION', 'MONTANT (FCFA)'], rows, y);
      
      // Montant payé
      y = drawTable(doc, ['', ''], [
        { label: 'MONTANT PAYE', amount: montantPaye, bold: true, color: COLORS.success }
      ], y);
      
      if (resteAPayer > 0) {
        y = drawTable(doc, ['', ''], [
          { label: 'RESTE A PAYER', amount: resteAPayer, bold: true, color: COLORS.danger }
        ], y);
      }
      
      y = drawSeparator(doc, y, true);
      
      // Informations paiement et statut
      y = drawSectionTitle(doc, 'INFORMATIONS ET STATUT', y);
      
      const retardTxt = joursRetard > 0 ? ` (${joursRetard}j retard)` : '';
      
      const col1 = 45;
      const col2 = 320;
      
      doc.fontSize(8)
         .font(FONTS.regular)
         .fillColor(COLORS.secondary)
         .text('Date paiement', col1, y)
         .text('Mode paiement', col1, y + 16)
         .text('Reference', col1, y + 32);
      
      doc.font(FONTS.bold)
         .fillColor(COLORS.dark)
         .text(formatDate(paiement.date_paiement) + retardTxt, 150, y)
         .text(paiement.mode_paiement || '', 150, y + 16)
         .text(codeReference, 150, y + 32);
      
      // Statut
      doc.fontSize(8)
         .font(FONTS.regular)
         .fillColor(COLORS.secondary)
         .text('Statut', col2, y);
      
      let statusText = 'PAYE';
      let statusColor = COLORS.success;
      
      if (!estComplet && montantPaye > 0) {
        statusText = 'PARTIEL';
        statusColor = COLORS.warning;
      } else if (estComplet && joursRetard > 0) {
        statusText = 'PAYE (RETARD)';
        statusColor = COLORS.warning;
      } else if (montantPaye === 0) {
        statusText = 'NON PAYE';
        statusColor = COLORS.danger;
      }
      
      drawBadge(doc, statusText, statusColor, col2, y + 14);
      
      y += 56;
      
      // Index eau
      if (paiement.ancien_index_eau || paiement.nouvel_index_eau) {
        doc.fontSize(8)
           .font(FONTS.regular)
           .fillColor(COLORS.secondary)
           .text('Compteur eau', col1, y)
           .font(FONTS.bold)
           .fillColor(COLORS.dark)
           .text(`Ancien: ${paiement.ancien_index_eau || 0} m3  |  Nouveau: ${paiement.nouvel_index_eau || 0} m3`, 150, y);
        y += 20;
      }
      
      y = drawSeparator(doc, y, true);
      
      // Alertes
      if (joursRetard > 0) {
        y = drawAlert(doc, `Paiement effectue avec ${joursRetard} jour${joursRetard > 1 ? 's' : ''} de retard.`, 'warning', y);
      }
      
      if (resteAPayer > 0) {
        y = drawAlert(doc, `Solde restant a payer: ${formatMoney(resteAPayer)} FCFA`, 'danger', y);
      }
      
      // Mentions
      doc.fontSize(7)
         .font(FONTS.italic)
         .fillColor(COLORS.secondary)
         .text(
           estComplet ? 'Quittance complete. A conserver 3 ans.' : 'Recu partiel.',
           35,
           y,
           { width: doc.page.width - 70 }
         );
      
      drawFooter(doc);
      doc.end();

      stream.on('finish', () => {
        resolve({ fileName, filePath, numeroQuittance: numeroQuittance.toString(), codeReference });
      });

      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
};

// ========================================
// AVIS D'ÉCHEANCE
// ========================================

exports.generateAvisEcheance = async (contrat, mois_concerne) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 0, size: 'A4' });
      
      const numeroAvis = await generateNumeroDocument('AE');
      
      const dir = ensureDocumentsFolder();
      const fileName = `avis_echeance_${numeroAvis}.pdf`;
      const filePath = path.join(dir, fileName);

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      let y = drawHeader(doc, 'AVIS D\'ECHEANCE', numeroAvis);
      
      doc.fontSize(8)
         .font(FONTS.regular)
         .fillColor(COLORS.secondary)
         .text(`Emis le ${formatDate(new Date())}`, doc.page.width - 200, y - 18, { 
           width: 165, 
           align: 'right' 
         });
      
      y = drawSectionTitle(doc, 'DESTINATAIRE', y);
      
      y = drawInfoRow(doc, 'Nom', contrat.locataire_nom || '', y);
      y = drawInfoRow(doc, 'Adresse', contrat.bien_adresse || '', y);
      y = drawInfoRow(doc, 'Telephone', contrat.locataire_tel || 'Non renseigne', y);
      
      y += 10;
      
      doc.fontSize(9)
         .font(FONTS.regular)
         .fillColor(COLORS.dark)
         .text('Madame, Monsieur,', 35, y);
      
      y += 20;
      
      doc.text(
        'Nous vous prions de bien vouloir nous faire parvenir le montant de votre loyer dans un delai de 8 jours.',
        35,
        y,
        { width: doc.page.width - 70 }
      );
      
      y += 30;
      y = drawSeparator(doc, y, true);
      
      const dateDebut = new Date(mois_concerne);
      const dateFin = new Date(dateDebut.getFullYear(), dateDebut.getMonth() + 1, 0);
      
      y = drawSectionTitle(doc, 'PERIODE CONCERNEE', y);
      y = drawInfoRow(doc, 'Du', formatDate(dateDebut), y, true);
      y = drawInfoRow(doc, 'Au', formatDate(dateFin), y, true);
      
      y += 8;
      y = drawSeparator(doc, y, true);
      
      y = drawSectionTitle(doc, 'MONTANT A PAYER', y);
      
      const montantLoyer = Number(contrat.montant_loyer) || 0;
      const chargesStruct = Number(contrat.charges_structurelles) || 0;
      const charges = Number(contrat.charges) || 0;
      const eau = Number(contrat.montant_eau) || 0;
      const internet = Number(contrat.montant_internet) || 0;
      const tva = Number(contrat.tva) || 0;
      const regulariser = Number(contrat.montant_regulariser) || 0;
      
      const rows = [
        { label: 'Loyer mensuel', amount: montantLoyer },
        { label: 'Charges structurelles', amount: chargesStruct },
        { label: 'Provisions pour charges', amount: charges },
        { label: 'Eau', amount: eau },
        { label: 'Internet', amount: internet },
        { label: 'TVA', amount: tva }
      ];
      
      if (regulariser > 0) {
        rows.push({ label: 'Montant a regulariser', amount: regulariser });
      }
      
      const total = montantLoyer + chargesStruct + charges + eau + internet + tva + regulariser;
      
      y = drawTable(doc, ['DESIGNATION', 'MONTANT (FCFA)'], rows, y, { label: 'TOTAL A PAYER', amount: total });
      
      if (contrat.ancien_index_eau || contrat.nouvel_index_eau) {
        y = drawSeparator(doc, y, true);
        doc.fontSize(8)
           .font(FONTS.regular)
           .fillColor(COLORS.secondary)
           .text('Compteur eau', 45, y)
           .font(FONTS.bold)
           .fillColor(COLORS.dark)
           .text(`Ancien: ${contrat.ancien_index_eau || 0} m3  |  Nouveau: ${contrat.nouvel_index_eau || 0} m3`, 150, y);
        y += 24;
      }
      
      y = drawAlert(doc, 'En cas de retard, des frais de relance pourront etre appliques.', 'warning', y);
      
      doc.fontSize(7)
         .font(FONTS.italic)
         .fillColor(COLORS.secondary)
         .text('Ce document ne peut tenir lieu de quittance.', 35, y);
      
      drawFooter(doc);
      doc.end();

      stream.on('finish', () => {
        resolve({ fileName, filePath, numeroAvis });
      });

      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
};

// ========================================
// QUITTANCE DE CAUTION
// ========================================

exports.generateQuittanceCaution = async (contrat, montantCaution) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 0, size: 'A4' });
      
      const numeroQuittance = await generateNumeroDocument('QC');
      
      const dir = ensureDocumentsFolder();
      const fileName = `quittance_caution_${numeroQuittance}.pdf`;
      const filePath = path.join(dir, fileName);

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      let y = drawHeader(doc, 'QUITTANCE DE CAUTION', numeroQuittance);
      
      y = drawSectionTitle(doc, 'INFORMATIONS DU BAIL', y);
      
      y = drawInfoRow(doc, 'Bien loue', contrat.bien_adresse || '', y);
      y = drawInfoRow(doc, 'Locataire', contrat.locataire_nom || '', y);
      
      y += 8;
      y = drawSeparator(doc, y, true);
      
      const nbMois = Math.round(montantCaution / contrat.montant_loyer);
      const cautionText = nbMois === 2 ? 'Deux (2) mois de caution' : `${nbMois} mois de caution`;
      
      y = drawSectionTitle(doc, 'NATURE DU DEPOT', y);
      
      y = drawInfoRow(doc, 'Type', cautionText, y, true);
      y = drawInfoRow(doc, 'Base calcul', `${formatMoney(contrat.montant_loyer)} FCFA/mois`, y);
      
      y += 8;
      y = drawSeparator(doc, y, true);
      
      y = drawSectionTitle(doc, 'MONTANT DU DEPOT', y);
      
      y = drawTable(doc, ['', ''], [
        { label: 'DEPOT DE GARANTIE VERSE', amount: montantCaution, bold: true, color: COLORS.success }
      ], y);
      
      y = drawSeparator(doc, y, true);
      
      y = drawSectionTitle(doc, 'INFORMATIONS ET STATUT', y);
      
      doc.fontSize(8)
         .font(FONTS.regular)
         .fillColor(COLORS.secondary)
         .text('Date versement', 45, y);
      
      doc.font(FONTS.bold)
         .fillColor(COLORS.dark)
         .text(formatDate(new Date()), 150, y);
      
      doc.fontSize(8)
         .font(FONTS.regular)
         .fillColor(COLORS.secondary)
         .text('Statut', 320, y);
      
      drawBadge(doc, 'RECU ET ENREGISTRE', COLORS.success, 320, y + 14);
      
      y += 50;
      
      y = drawAlert(doc, 'Ce depot sera restitue en fin de bail selon l\'etat des lieux.', 'info', y);
      
      doc.fontSize(7)
         .font(FONTS.italic)
         .fillColor(COLORS.secondary)
         .text('A conserver pendant toute la duree du bail.', 35, y);
      
      drawFooter(doc);
      doc.end();

      stream.on('finish', () => {
        resolve({ fileName, filePath, numeroQuittance: numeroQuittance.toString() });
      });

      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
};
exports.generateContrat = async (contrat) => {
  return new Promise(async (resolve, reject) => {
    try {
      const PDFDocument = require('pdfkit');
      const fs = require('fs');
      const path = require('path');
      const { generateNumeroDocument } = require('./numeroService');
      
      const doc = new PDFDocument({ margin: 0, size: 'A4' });
      
      const numeroContrat = await generateNumeroDocument('CT');
      const codeReference = generateReference();
      
      const dir = ensureDocumentsFolder();
      const fileName = `contrat_${numeroContrat}.pdf`;
      const filePath = path.join(dir, fileName);

      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      let y = drawHeader(doc, 'CONTRAT DE LOCATION', numeroContrat);
      
      // Informations générales
      y = drawSectionTitle(doc, 'INFORMATIONS GENERALES', y);
      
      y = drawInfoRow(doc, 'Date debut', formatDate(contrat.date_debut), y, true);
      y = drawInfoRow(doc, 'Date fin', formatDate(contrat.date_fin), y, true);
      y = drawInfoRow(doc, 'Reference', codeReference, y);
      
      const dureeEnMois = Math.round(
        (new Date(contrat.date_fin) - new Date(contrat.date_debut)) / (1000 * 60 * 60 * 24 * 30)
      );
      y = drawInfoRow(doc, 'Duree', `${dureeEnMois} mois`, y);
      
      y += 8;
      y = drawSeparator(doc, y, true);
      
      // Le bailleur (Propriétaire)
      y = drawSectionTitle(doc, 'LE BAILLEUR (PROPRIETAIRE)', y);
      
      y = drawInfoRow(doc, 'Nom', contrat.proprietaire_nom || '', y);
      if (contrat.proprietaire_tel) {
        y = drawInfoRow(doc, 'Telephone', contrat.proprietaire_tel, y);
      }
      if (contrat.agence_nom) {
        y = drawInfoRow(doc, 'Agence', contrat.agence_nom + (contrat.agence_code ? ` (${contrat.agence_code})` : ''), y);
      }
      
      y += 8;
      y = drawSeparator(doc, y, true);
      
      // Le locataire
      y = drawSectionTitle(doc, 'LE LOCATAIRE', y);
      
      const locataireNom = [contrat.locataire_nom, contrat.locataire_prenom].filter(Boolean).join(' ');
      y = drawInfoRow(doc, 'Nom', locataireNom || '', y);
      y = drawInfoRow(doc, 'Telephone', contrat.locataire_tel || '', y);
      if (contrat.locataire_email) {
        y = drawInfoRow(doc, 'Email', contrat.locataire_email, y);
      }
      y = drawInfoRow(doc, 'Type', (contrat.locataire_type || 'particulier').toUpperCase(), y);
      
      y += 8;
      y = drawSeparator(doc, y, true);
      
      // Le bien loué
      y = drawSectionTitle(doc, 'LE BIEN LOUE', y);
      
      y = drawInfoRow(doc, 'Adresse', contrat.bien_adresse || '', y, true);
      if (contrat.bien_numero) {
        y = drawInfoRow(doc, 'Numero bien', contrat.bien_numero, y);
      }
      if (contrat.bien_type) {
        y = drawInfoRow(doc, 'Type', contrat.bien_type.toUpperCase(), y);
      }
      
      y += 8;
      y = drawSeparator(doc, y, true);
      
      // Conditions financières
      y = drawSectionTitle(doc, 'CONDITIONS FINANCIERES', y);
      
      const montantLoyer = Number(contrat.montant_loyer) || 0;
      const chargesStruct = Number(contrat.charges_structurelles) || 0;
      const chargesPeriode = Number(contrat.charges_periode) || 0;
      const eau = Number(contrat.montant_eau) || 0;
      const internet = Number(contrat.montant_internet) || 0;
      const tva = Number(contrat.tva) || 0;
      const caution = Number(contrat.montant_caution) || 0;
      
      const rows = [
        { label: 'Loyer mensuel', amount: montantLoyer }
      ];
      
      if (chargesStruct > 0) {
        rows.push({ label: 'Charges structurelles', amount: chargesStruct });
      }
      if (chargesPeriode > 0) {
        rows.push({ label: 'Charges de periode', amount: chargesPeriode });
      }
      if (eau > 0) {
        rows.push({ label: 'Eau (forfait)', amount: eau });
      }
      if (internet > 0 && contrat.locataire_type === 'particulier') {
        rows.push({ label: 'Internet', amount: internet });
      }
      if (tva > 0 && contrat.locataire_type === 'commerce') {
        rows.push({ label: 'TVA', amount: tva });
      }
      
      const totalMensuel = montantLoyer + chargesStruct + chargesPeriode + eau + internet + tva;
      
      y = drawTable(doc, ['DESIGNATION', 'MONTANT (FCFA)'], rows, y, { 
        label: 'TOTAL MENSUEL', 
        amount: totalMensuel 
      });
      
      // Caution
      if (caution > 0) {
        y = drawSectionTitle(doc, 'DEPOT DE GARANTIE', y);
        
        y = drawTable(doc, ['', ''], [
          { label: 'CAUTION VERSEE', amount: caution, bold: true, color: COLORS.primary }
        ], y);
      }
      
      // Modalités de paiement
      y += 5;
      y = drawSeparator(doc, y, true);
      
      y = drawSectionTitle(doc, 'MODALITES DE PAIEMENT', y);
      
      y = drawInfoRow(doc, 'Jour de paiement', `Le ${contrat.jour_paiement} de chaque mois`, y, true);
      y = drawInfoRow(doc, 'Mode', 'Selon accord entre les parties', y);
      
      y += 8;
      
      // Vérifier si on a besoin d'une nouvelle page
      if (y > 650) {
        doc.addPage();
        y = 40;
      }
      
      y = drawSeparator(doc, y, true);
      
      // Clauses du contrat
      y = drawSectionTitle(doc, 'CLAUSES PRINCIPALES', y);
      
      const clauses = [
        {
          titre: 'Article 1 - Objet',
          texte: `Le bailleur loue au locataire le bien situe a l'adresse mentionnee ci-dessus, pour un usage d'${contrat.locataire_type === 'commerce' ? 'activite commerciale' : 'habitation'}.`
        },
        {
          titre: 'Article 2 - Duree',
          texte: `Le present bail est consenti pour une duree de ${dureeEnMois} mois, debutant le ${formatDate(contrat.date_debut)} et se terminant le ${formatDate(contrat.date_fin)}.`
        },
        {
          titre: 'Article 3 - Loyer',
          texte: `Le loyer mensuel est fixe a ${formatMoney(totalMensuel)} FCFA, payable le ${contrat.jour_paiement} de chaque mois.`
        },
        {
          titre: 'Article 4 - Depot de garantie',
          texte: caution > 0 
            ? `Un depot de garantie de ${formatMoney(caution)} FCFA a ete verse par le locataire. Il sera restitue en fin de bail deduction faite des eventuelles reparations.`
            : 'Aucun depot de garantie n\'est requis pour ce bail.'
        },
        {
          titre: 'Article 5 - Charges',
          texte: eau > 0 
            ? 'Les charges incluent l\'eau en forfait. Le locataire s\'engage a utiliser l\'eau de maniere raisonnable.'
            : 'Le locataire est responsable du paiement des charges selon sa consommation.'
        },
        {
          titre: 'Article 6 - Entretien',
          texte: 'Le locataire s\'engage a entretenir le bien en bon pere de famille et a effectuer les reparations locatives.'
        },
        {
          titre: 'Article 7 - Resiliation',
          texte: 'Chaque partie peut resilier le bail moyennant un preavis de trois (3) mois par lettre recommandee.'
        }
      ];
      
      clauses.forEach((clause, index) => {
        // Vérifier si on a assez d'espace
        if (y > 700) {
          doc.addPage();
          y = 40;
        }
        
        doc.fontSize(9)
           .font(FONTS.bold)
           .fillColor(COLORS.primary)
           .text(clause.titre, 35, y);
        
        y += 16;
        
        doc.fontSize(8)
           .font(FONTS.regular)
           .fillColor(COLORS.dark)
           .text(clause.texte, 35, y, { 
             width: doc.page.width - 70,
             align: 'justify'
           });
        
        y += doc.heightOfString(clause.texte, { 
          width: doc.page.width - 70,
          align: 'justify'
        }) + 12;
      });
      
      // Vérifier si on a besoin d'une nouvelle page pour les signatures
      if (y > 650) {
        doc.addPage();
        y = 40;
      }
      
      y = drawSeparator(doc, y, true);
      
      // Signatures
      y = drawSectionTitle(doc, 'SIGNATURES', y);
      
      const col1X = 50;
      const col2X = 320;
      
      doc.fontSize(8)
         .font(FONTS.bold)
         .fillColor(COLORS.dark)
         .text('LE BAILLEUR', col1X, y)
         .text('LE LOCATAIRE', col2X, y);
      
      y += 20;
      
      doc.fontSize(7)
         .font(FONTS.regular)
         .fillColor(COLORS.secondary)
         .text(`Date: ${formatDate(new Date())}`, col1X, y)
         .text(`Date: ${formatDate(new Date())}`, col2X, y);
      
      y += 15;
      
      doc.fontSize(7)
         .fillColor(COLORS.secondary)
         .text('Signature:', col1X, y)
         .text('Signature:', col2X, y);
      
      // Espace pour signature
      y += 20;
      
      doc.save()
         .moveTo(col1X, y + 40)
         .lineTo(col1X + 180, y + 40)
         .dash(2, 2)
         .strokeColor(COLORS.border)
         .stroke()
         .restore();
      
      doc.save()
         .moveTo(col2X, y + 40)
         .lineTo(col2X + 180, y + 40)
         .dash(2, 2)
         .strokeColor(COLORS.border)
         .stroke()
         .restore();
      
      y += 60;
      
      y = drawAlert(doc, 'Ce contrat engage les deux parties pour la duree mentionnee. Toute modification doit faire l\'objet d\'un avenant signe.', 'info', y);
      
      drawFooter(doc);
      doc.end();

      stream.on('finish', () => {
        resolve({ fileName, filePath, numeroContrat: numeroContrat.toString(), codeReference });
      });

      stream.on('error', reject);
    } catch (error) {
      reject(error);
    }
  });
};
module.exports = {
  generateContrat: exports.generateContrat,
  generateQuittance: exports.generateQuittance,
  generateAvisEcheance: exports.generateAvisEcheance,
  generateQuittanceCaution: exports.generateQuittanceCaution,
  enregistrerDocument
};


