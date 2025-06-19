require('dotenv').config();
const Airtable = require('airtable');

const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

async function updateExistingAnnouncements() {
  console.log('🔄 Mise à jour des tokens pour les annonces existantes...\n');
  
  try {
    const partageTableName = process.env.AIRTABLE_PARTAGE_TABLE_NAME || 'DodoPartage - Announcement';
    
    // Récupérer toutes les annonces sans tokens
    const records = await base(partageTableName).select({
      filterByFormula: 'AND({status} = "published", OR({edit_token} = "", {delete_token} = ""))',
      maxRecords: 50
    }).firstPage();
    
    console.log(`📋 Trouvé ${records.length} annonce(s) sans tokens\n`);
    
    if (records.length === 0) {
      console.log('✅ Toutes les annonces ont déjà leurs tokens !');
      return;
    }
    
    for (const record of records) {
      const fields = record.fields;
      
      // Générer de nouveaux tokens
      const editToken = 'edit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 15);
      const deleteToken = 'del_' + Date.now() + '_' + Math.random().toString(36).substr(2, 15);
      
      console.log(`🔧 Mise à jour de l'annonce ${fields.reference}:`);
      console.log(`   - Edit token: ${editToken}`);
      console.log(`   - Delete token: ${deleteToken}`);
      
      // Mettre à jour l'enregistrement
      await base(partageTableName).update(record.id, {
        edit_token: editToken,
        delete_token: deleteToken
      });
      
      console.log('   ✅ Tokens ajoutés\n');
      
      // Petite pause pour éviter de surcharger l'API Airtable
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('🎉 Mise à jour terminée avec succès !');
    
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour:', error.message);
  }
}

updateExistingAnnouncements(); 