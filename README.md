# Dodomove Backend Centralisé

Backend Express centralisé pour les applications Dodomove, gérant les leads et les interactions avec Airtable et Resend.

## Description

Ce backend sert de point central pour toutes les applications frontend de Dodomove. Il gère :

- L'envoi de leads vers Airtable
- L'envoi d'emails via Resend
- La validation des données
- La génération de références uniques pour les demandes

## Points d'Entrée API

- **GET /** - Healthcheck pour Railway
- **GET /health** - Route de santé avec informations détaillées
- **GET /ping** - Simple route ping/pong
- **GET /env** - Affiche les variables d'environnement (valeurs sensibles masquées)
- **GET /test** - Route de test indépendante des variables d'environnement
- **GET /api/message** - Simple message API
- **POST /send-email** - Endpoint pour le calculateur de volume
- **POST /submit-funnel** - Endpoint pour le funnel de demande de devis

## Technologies Utilisées

- Node.js
- Express
- Airtable (stockage de données)
- Resend (emails transactionnels)
- Railway (déploiement)

## Variables d'Environnement

Les variables d'environnement suivantes sont requises:

```
NODE_ENV=development
PORT=8080
AIRTABLE_API_KEY=your_airtable_api_key
AIRTABLE_BASE_ID=your_airtable_base_id
RESEND_API_KEY=your_resend_api_key
ADMIN_EMAIL=your_admin_email
FRONTEND_URL=http://localhost:3000
```

## Installation Locale

```bash
# Cloner le dépôt
git clone https://github.com/pbost75/dodomove-backend.git
cd dodomove-backend

# Installer les dépendances
npm install

# Créer un fichier .env avec les variables requises
cp .env.example .env
# (Puis modifiez le fichier .env avec vos propres valeurs)

# Démarrer le serveur de développement
npm run dev
```

## Déploiement

Ce backend est déployé sur Railway à l'adresse https://web-production-7b738.up.railway.app/

### Réference des routes

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | / | Healthcheck pour Railway |
| GET | /health | Informations détaillées sur l'état du serveur |
| GET | /ping | Simple réponse "pong" |
| GET | /env | Variables d'environnement (masquées) |
| GET | /test | Données de test indépendantes |
| GET | /api/message | Simple message API |
| POST | /send-email | Traitement des leads du calculateur de volume |
| POST | /submit-funnel | Traitement des leads du funnel de devis | 