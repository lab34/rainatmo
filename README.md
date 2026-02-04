# RainAtmo 🌧️

Application web de visualisation des données de pluviométrie depuis l'API Netatmo.

## 🎯 Fonctionnalités

- **Affichage en temps réel** : Données des 30 dernières minutes, 1h, 3h et aujourd'hui
- **Historique complet** : Données mensuelles et annuelles
- **Résilience** : Fallback automatique sur cache en cas de panne API
- **Jobs automatiques** :
  - Refresh token OAuth2 toutes les 2h30
  - Mise à jour horaire des petites périodes
  - Calcul quotidien des agrégats
- **Panel d'administration** : Mise à jour manuelle des tokens
- **Indicateurs de santé** : Statut du système en temps réel

## 📦 Stack Technique

- **Backend** : Fastify (Node.js)
- **Base de données** : SQLite (sql.js)
- **Frontend** : HTML/CSS/JavaScript vanilla
- **Jobs** : node-cron
- **OAuth2** : Netatmo API

## 🚀 Installation

### Prérequis

- Node.js 18+
- Client ID et Client Secret Netatmo ([dev.netatmo.com](https://dev.netatmo.com))

### Étapes

1. **Cloner le repository**

```bash
git clone <repository-url>
cd rainatmo
```

2. **Installer les dépendances**

```bash
npm install
```

3. **Configurer les variables d'environnement**

Copier `.env.example` vers `.env` et remplir les valeurs :

```bash
cp .env.example .env
```

Éditer `.env` :

```env
PORT=3000
NODE_ENV=development

DB_PATH=./db/rainatmo.sqlite

# Obtenir ces valeurs depuis https://dev.netatmo.com
NETATMO_CLIENT_ID=votre_client_id
NETATMO_CLIENT_SECRET=votre_client_secret
NETATMO_ACCESS_TOKEN=votre_access_token_initial
NETATMO_REFRESH_TOKEN=votre_refresh_token_initial

# Admin credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=votre_mot_de_passe_securise
```

4. **Initialiser les données historiques**

**Important :** Après le premier démarrage, vous devez initialiser la base de données avec l'historique de pluviométrie.

```bash
# Le script récupère 5 ans de données depuis l'API Netatmo
# Durée estimée : 15-30 minutes (avec throttling API)
npm run init-db
```

Le script :
- ✅ Récupère les données jour par jour depuis 5 ans
- ✅ Calcule automatiquement les agrégats mensuels et annuels
- ✅ Détecte les données déjà présentes (peut être relancé sans risque)
- ✅ S'arrête en cas d'erreur API (correction manuelle puis relance)
- ✅ Affiche la progression tous les 50 jours

**Mode test** (pour validation rapide sur 7 jours) :
```bash
TEST_DAYS=7 node src/scripts/init-historical-data.js
```

5. **Démarrer l'application**

```bash
npm start
```

L'application sera accessible sur `http://localhost:3000`

## 🔧 Commandes disponibles

```bash
npm start              # Démarrer le serveur
npm run dev            # Démarrer en mode développement (watch)
npm run init-db        # Initialiser l'historique (5 ans de données)
npm test               # Lancer les tests (à venir)
npm run lint           # Linter le code
npm run format         # Formater le code
```

### Initialisation de l'historique

La commande `npm run init-db` doit être exécutée **une seule fois** après l'installation pour récupérer l'historique de pluviométrie :

- **Données récupérées** : 5 ans de données quotidiennes depuis l'API Netatmo
- **Durée** : 15-30 minutes (~3650 requêtes API avec throttling)
- **Reprise possible** : Le script détecte automatiquement les données déjà présentes
- **Comportement** : Arrêt en cas d'erreur API pour correction manuelle

## 📊 Architecture

```
rainatmo/
├── src/
│   ├── server.js                 # Point d'entrée Fastify
│   ├── db/
│   │   └── database.js           # Gestion SQLite
│   ├── services/
│   │   └── netatmo.service.js    # Client API Netatmo
│   ├── utils/
│   │   └── token-manager.js      # Gestion des tokens OAuth2
│   ├── routes/
│   │   ├── index.js              # Router principal
│   │   ├── stations.routes.js    # Routes stations
│   │   ├── rainfall.routes.js    # Routes données pluie
│   │   ├── system.routes.js      # Routes système
│   │   └── admin.routes.js       # Routes admin
│   ├── middleware/
│   │   └── admin-auth.js         # Auth HTTP Basic
│   └── jobs/
│       ├── scheduler.js          # Orchestrateur cron
│       ├── token-refresh.job.js  # Job refresh token
│       ├── hourly-update.job.js  # Job mise à jour horaire
│       └── daily-update.job.js   # Job agrégats quotidiens
├── public/
│   ├── index.html                # Page principale
│   ├── admin.html                # Page d'administration
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── app.js                # Application principale
│       └── admin.js              # Application admin
└── db/
    └── rainatmo.sqlite           # Base de données (créée automatiquement)
```

## 🌐 Endpoints API

### Public

- `GET /` - Page principale (tableau de pluviométrie)
- `GET /api/health` - Health check
- `GET /api/stations` - Liste des stations météo
- `GET /api/rainfall/historical` - Données historiques
- `GET /api/rainfall/current/:stationId` - Données temps réel
- `GET /api/system/status` - Statut du système

### Admin (authentification requise)

- `GET /admin` - Page d'administration
- `GET /admin/status` - Statut détaillé
- `POST /admin/tokens` - Mise à jour manuelle des tokens

## 🔐 Sécurité

- ✅ Aucun token en dur dans le code
- ✅ Variables d'environnement pour les secrets
- ✅ `.gitignore` configuré pour éviter les fuites
- ✅ Authentification HTTP Basic pour l'admin
- ✅ Rotation automatique des tokens OAuth2

## 🐳 Docker

### Build et démarrage

```bash
# Build l'image (AMD64 pour production)
docker-compose build

# Démarrer le conteneur
docker-compose up -d

# Voir les logs
docker-compose logs -f

# Arrêter
docker-compose down
```

### Build multi-plateforme sur Mac Silicon

Si vous développez sur Mac Silicon (ARM) mais ciblez un serveur AMD64 :

```bash
# Build avec platform explicite
docker buildx build --platform linux/amd64 -t rainatmo:latest .

# Ou utiliser Docker Compose
docker-compose build
```

L'image utilise des bases Alpine minimales pour une taille optimisée.

## 📝 Notes

### Gestion des tokens OAuth2

Les tokens Netatmo expirent toutes les 3 heures et nécessitent une rotation :

- **Refresh automatique** : Toutes les 2h30 via cron
- **Refresh manuel** : Via la page `/admin`
- **Rotation obligatoire** : Les anciens tokens deviennent invalides immédiatement

### Stratégie de fallback

En cas d'échec API Netatmo :
1. Le frontend essaie d'abord l'API en direct
2. En cas d'échec, lit les données depuis le cache SQLite
3. Un indicateur visuel montre la fraîcheur des données

### Jobs automatiques

- **Toutes les 2h30** : Refresh token OAuth2
- **Toutes les heures** : Mise à jour des petites périodes (30min, 1h, 3h, aujourd'hui)
- **Quotidien à 01:00** : Calcul des agrégats mensuels/annuels

## 🤝 Contribution

Les contributions sont bienvenues ! Merci de :

1. Fork le projet
2. Créer une branche (`git checkout -b feature/amazing-feature`)
3. Commit les changements (`git commit -m 'Add amazing feature'`)
4. Push vers la branche (`git push origin feature/amazing-feature`)
5. Ouvrir une Pull Request

## 📄 Licence

ISC

## 🙏 Remerciements

- [Netatmo](https://www.netatmo.com) pour l'API météo
- [Fastify](https://www.fastify.io) pour le framework web
