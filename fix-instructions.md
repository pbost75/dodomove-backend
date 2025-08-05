# 🛠️ Guide de dépannage Railway

## 📊 Résultats possibles du diagnostic

### ✅ **CAS 1: Le serveur de diagnostic fonctionne**
**➡️ Le problème vient des dépendances dans server.js**

**Solutions :**
1. **Vérifier les variables d'environnement Railway :**
   - Aller dans Railway Dashboard > Variables
   - Vérifier que ces variables existent :
     - `AIRTABLE_API_KEY`
     - `AIRTABLE_BASE_ID` 
     - `RESEND_API_KEY`
     - `NODE_ENV=production`

2. **Si des variables manquent, les ajouter :**
   ```
   AIRTABLE_API_KEY=patXXXXXXXXXXXXXX
   AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
   RESEND_API_KEY=re_XXXXXXXXXX
   NODE_ENV=production
   ```

3. **Revenir au serveur principal :**
   - Modifier `railway.toml` : `startCommand = "node server.js"`
   - Pousser les changements

### ❌ **CAS 2: Le serveur de diagnostic échoue**
**➡️ Problème de configuration Railway de base**

**Solutions :**
1. **Vérifier le port :**
   - Railway doit exposer le port 8080
   - Vérifier dans Settings > Networking

2. **Redémarrer le service Railway :**
   - Dashboard > Settings > Restart

3. **Recréer le déploiement :**
   - Parfois nécessaire après un impayé

### 🔧 **Actions d'urgence**

**Si rien ne fonctionne :**
1. **Créer un nouveau service Railway :**
   - Connect nouveau repo GitHub
   - Reconfigurer les variables d'environnement
   - Pointer les DNS vers la nouvelle URL

2. **Alternative temporaire :**
   - Déployer sur Render/Vercel
   - Changer `NEXT_PUBLIC_BACKEND_URL` dans vos frontends

## 🎯 **Commandes de test**

Une fois le serveur fonctionnel :

```bash
# Test healthcheck
curl https://web-production-7b738.up.railway.app/

# Test ping
curl https://web-production-7b738.up.railway.app/ping

# Test API DodoPartage
curl https://web-production-7b738.up.railway.app/api/partage/get-announcements
``` 