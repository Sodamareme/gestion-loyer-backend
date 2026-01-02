const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
require('dotenv').config();

async function diagnostic() {
  let connection;
  
  try {
    console.log('🔍 DIAGNOSTIC DE CONNEXION\n');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    // 1. Test de connexion à la DB
    console.log('1️⃣  Test de connexion à la base de données...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'gestion_loyer'
    });
    console.log('   ✅ Connexion réussie\n');

    // 2. Vérifier la table users
    console.log('2️⃣  Vérification de la table users...');
    const [tables] = await connection.execute("SHOW TABLES LIKE 'users'");
    if (tables.length === 0) {
      console.log('   ❌ La table users n\'existe pas !');
      return;
    }
    console.log('   ✅ Table users existe\n');

    // 3. Compter les utilisateurs
    console.log('3️⃣  Comptage des utilisateurs...');
    const [[{ total }]] = await connection.execute('SELECT COUNT(*) as total FROM users');
    console.log(`   📊 Total d'utilisateurs: ${total}\n`);

    // 4. Lister les admins
    console.log('4️⃣  Liste des admins...');
    const [admins] = await connection.execute(
      'SELECT id, email, role, is_active, created_at FROM users WHERE role = "admin"'
    );
    
    if (admins.length === 0) {
      console.log('   ❌ AUCUN ADMIN TROUVÉ !');
      console.log('   💡 C\'est probablement votre problème.\n');
      
      // Créer un admin
      console.log('5️⃣  Création automatique d\'un compte admin...');
      const adminEmail = 'admin@voscles.com';
      const adminPassword = 'Admin123!';
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      
      await connection.execute(
        'INSERT INTO users (email, password, role, is_active) VALUES (?, ?, ?, ?)',
        [adminEmail, hashedPassword, 'admin', 1]
      );
      
      console.log('   ✅ Admin créé !');
      console.log('   📧 Email:', adminEmail);
      console.log('   🔑 Password:', adminPassword);
      console.log('\n   🎯 Essayez de vous connecter maintenant !\n');
      
    } else {
      console.log('   ✅ Admin(s) trouvé(s):');
      admins.forEach(admin => {
        console.log(`      - Email: ${admin.email}`);
        console.log(`        ID: ${admin.id}`);
        console.log(`        Actif: ${admin.is_active ? 'Oui' : 'Non'}`);
        console.log(`        Créé le: ${admin.created_at}`);
      });
      console.log();
      
      // 5. Tester le mot de passe
      console.log('5️⃣  Test du mot de passe pour admin@voscles.com...');
      const [users] = await connection.execute(
        'SELECT * FROM users WHERE email = ?',
        ['admin@voscles.com']
      );
      
      if (users.length === 0) {
        console.log('   ❌ admin@voscles.com n\'existe pas !');
        console.log('   💡 Créons-le...\n');
        
        const adminPassword = 'Admin123!';
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        
        await connection.execute(
          'INSERT INTO users (email, password, role, is_active) VALUES (?, ?, ?, ?)',
          ['admin@voscles.com', hashedPassword, 'admin', 1]
        );
        
        console.log('   ✅ Compte créé !');
        console.log('   📧 Email: admin@voscles.com');
        console.log('   🔑 Password: Admin123!\n');
        
      } else {
        const user = users[0];
        console.log('   ✅ Utilisateur trouvé');
        console.log('   📊 Hash actuel:', user.password.substring(0, 30) + '...');
        
        // Test du mot de passe
        const testPasswords = ['Admin123!', 'admin123', 'admin', ''];
        
        console.log('\n   🧪 Test de différents mots de passe:');
        for (const testPass of testPasswords) {
          const isValid = await bcrypt.compare(testPass, user.password);
          const status = isValid ? '✅' : '❌';
          console.log(`      ${status} "${testPass}": ${isValid ? 'VALIDE' : 'invalide'}`);
          
          if (isValid) {
            console.log('\n   🎯 MOT DE PASSE TROUVÉ:', testPass);
            break;
          }
        }
        
        // 6. Réinitialiser le mot de passe
        console.log('\n6️⃣  Voulez-vous réinitialiser le mot de passe à "Admin123!" ?');
        console.log('   Exécutez: node diagnostic.js --reset\n');
        
        if (process.argv.includes('--reset')) {
          console.log('   🔄 Réinitialisation...');
          const newPassword = 'Admin123!';
          const newHash = await bcrypt.hash(newPassword, 10);
          
          await connection.execute(
            'UPDATE users SET password = ? WHERE email = ?',
            [newHash, 'admin@voscles.com']
          );
          
          console.log('   ✅ Mot de passe réinitialisé !');
          console.log('   🔑 Nouveau mot de passe: Admin123!\n');
        }
      }
    }

    // 7. Test complet de connexion
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('7️⃣  TEST COMPLET DE CONNEXION\n');
    
    const testEmail = 'admin@voscles.com';
    const testPassword = 'Admin123!';
    
    console.log('   Tentative de connexion avec:');
    console.log('   Email:', testEmail);
    console.log('   Password:', testPassword);
    console.log();
    
    const [testUsers] = await connection.execute(
      `SELECT u.*, l.nom as locataire_nom, l.telephone as locataire_tel
       FROM users u
       LEFT JOIN locataires l ON u.locataire_id = l.id
       WHERE u.email = ? AND u.is_active = TRUE`,
      [testEmail]
    );
    
    if (testUsers.length === 0) {
      console.log('   ❌ ÉCHEC: Aucun utilisateur trouvé avec cet email');
      console.log('   💡 L\'email n\'existe pas ou is_active = FALSE\n');
    } else {
      const testUser = testUsers[0];
      console.log('   ✅ Utilisateur trouvé');
      
      const isPasswordValid = await bcrypt.compare(testPassword, testUser.password);
      
      if (isPasswordValid) {
        console.log('   ✅ MOT DE PASSE CORRECT !');
        console.log('\n   🎉 LA CONNEXION DEVRAIT FONCTIONNER !');
        console.log('\n   📋 Données utilisateur:');
        console.log('   ', {
          id: testUser.id,
          email: testUser.email,
          role: testUser.role,
          is_active: testUser.is_active
        });
      } else {
        console.log('   ❌ MOT DE PASSE INCORRECT');
        console.log('   💡 Le hash ne correspond pas au mot de passe testé');
        console.log('\n   🔧 Exécutez: node diagnostic.js --reset');
      }
    }
    
    console.log('\n═══════════════════════════════════════════════════════════\n');
    
    // 8. Vérifier l'API
    console.log('8️⃣  Configuration API:');
    console.log('   JWT_SECRET:', process.env.JWT_SECRET ? '✅ Défini' : '⚠️  Non défini (utilise le défaut)');
    console.log('   PORT:', process.env.PORT || 3000);
    console.log('\n   💡 Frontend API URL devrait être: http://localhost:' + (process.env.PORT || 3000) + '/api');
    
  } catch (error) {
    console.error('\n❌ ERREUR:', error.message);
    console.error('\n📝 Stack:', error.stack);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

diagnostic();