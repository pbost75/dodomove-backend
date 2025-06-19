const fetch = require('node-fetch');

async function testDeleteAnnouncement() {
  console.log('🔍 Test de suppression d\'annonce...\n');
  
  try {
    // D'abord, testons la récupération des données de suppression
    const reference = 'PARTAGE-577358-8UJL8P'; // Référence de votre test
    
    console.log('1️⃣ Test récupération données pour suppression...');
    
    // Nous devons d'abord trouver le delete_token dans Airtable
    // Simulons l'appel avec un token de test
    const testToken = '5631350_rzk7f8fuxja'; // Token de votre test
    
    const getResponse = await fetch(`https://web-production-7b738.up.railway.app/api/partage/delete-form/${testToken}`);
    console.log('Status GET:', getResponse.status);
    
    if (getResponse.ok) {
      const getData = await getResponse.json();
      console.log('✅ Données récupérées:', getData);
      
      // Maintenant testons la suppression
      console.log('\n2️⃣ Test suppression avec raison...');
      
      const deleteResponse = await fetch('https://web-production-7b738.up.railway.app/api/partage/confirm-deletion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deleteToken: testToken,
          reason: 'found_solution'
        })
      });
      
      console.log('Status POST:', deleteResponse.status);
      const deleteResult = await deleteResponse.json();
      console.log('Résultat suppression:', deleteResult);
      
    } else {
      const errorData = await getResponse.json();
      console.log('❌ Erreur GET:', errorData);
    }
    
  } catch (error) {
    console.error('❌ Erreur de test:', error.message);
  }
}

testDeleteAnnouncement(); 