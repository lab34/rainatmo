# 🚀 Guide de Déploiement - RainAtmo

## 📋 Vue d'ensemble

Cette procédure met à jour l'application RainAtmo avec :
- ✅ Correction des données "Aujourd'hui"
- ✅ Script d'initialisation historique (5 ans)
- ✅ Job quotidien amélioré

**Durée estimée** : 5-10 minutes (+ 15-30 min pour l'init historique optionnelle)

---

## 🚀 Déploiement Rapide

```bash
# 1. Connexion au serveur
ssh user@votre-serveur.com
cd /path/to/rainatmo

# 2. Récupérer les mises à jour
git pull origin main

# 3. Redéployer
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# 4. Vérifier
docker-compose logs -f --tail=30
curl http://localhost:3000/api/health
```

---

## 📝 Procédure Détaillée

### 1️⃣ Connexion et récupération des modifications

```bash
ssh user@votre-serveur.com
cd /path/to/rainatmo

# Vérifier l'état actuel
git status
git log --oneline -3

# Récupérer les mises à jour depuis GitHub
git pull origin main
```

### 2️⃣ Vérifier la configuration

```bash
# S'assurer que le fichier .env existe
ls -la .env

# Vérifier les variables critiques
grep -E "NETATMO_|ADMIN_" .env
```

### 3️⃣ Redéployer l'application

**Pour docker-compose.yml standard :**
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

**Pour docker-compose.prod.yml (avec Traefik) :**
```bash
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d
```

### 4️⃣ Vérifier le démarrage

```bash
# Statut du container
docker-compose ps

# Suivre les logs
docker-compose logs -f --tail=50
```

**Logs attendus :**
```
[Database] Loaded existing database
[TokenManager] Tokens loaded from database
[Scheduler] Starting cron jobs...
[Server] Running on http://0.0.0.0:3000
```

### 5️⃣ Tests de validation

```bash
# Test API Health
curl http://localhost:3000/api/health

# Vérifier les données "Aujourd'hui" (nouveauté importante)
curl http://localhost:3000/api/rainfall/current/1 | jq '.data.periods'
```

**Résultat attendu :**
```json
{
  "30min": 0.0,
  "1hour": 0.0,
  "3hours": 0.0,
  "today": 7.8    ← DOIT ÊTRE PRÉSENT
}
```

### 6️⃣ [OPTIONNEL] Initialisation historique

Pour récupérer 5 ans de données historiques (à faire **une seule fois**) :

```bash
# Lancer en background
docker exec rainatmo node src/scripts/init-historical-data.js > init.log 2>&1 &

# Suivre la progression
tail -f init.log

# OU
docker logs -f rainatmo
```

**Durée** : 15-30 minutes (~3650 jours × 2 stations)

Le script détecte les données déjà présentes et peut être relancé sans risque.

---

## 🔄 Rollback

Si la nouvelle version pose problème :

```bash
# Arrêter la nouvelle version
docker-compose down

# Revenir à l'ancien commit
git checkout fa79276

# Reconstruire et redémarrer
docker-compose build --no-cache
docker-compose up -d
```

---

## ✅ Checklist Post-Déploiement

- [ ] Container en état "healthy" : `docker-compose ps`
- [ ] API répond : `curl http://localhost:3000/api/health`
- [ ] Données "Aujourd'hui" présentes : vérifier `/api/rainfall/current/1`
- [ ] Frontend accessible : ouvrir dans un navigateur
- [ ] Tableau affiche les données (ligne "Aujourd'hui" remplie)
- [ ] Logs sans erreurs : `docker-compose logs --tail=100`
- [ ] Cron jobs démarrés (visible dans les logs)

---

## 🆘 Troubleshooting

### Container ne démarre pas

```bash
docker-compose logs
docker-compose config  # Vérifier la config
```

### Données "Aujourd'hui" manquantes

```bash
# Vérifier le code déployé
docker exec rainatmo cat /app/src/routes/rainfall.routes.js | grep -A 5 "setUTCHours"

# Rebuild forcé
docker-compose down
docker-compose build --no-cache --pull
docker-compose up -d
```

### Erreur API Netatmo

```bash
# Vérifier les tokens
docker exec rainatmo sqlite3 /app/db/rainatmo.sqlite "SELECT name, LENGTH(value) FROM tokens;"

# Rafraîchir via l'admin
# http://votre-serveur.com:3000/admin
```

---

## 📝 Notes Importantes

- **Données** : Volume `./db/rainatmo.sqlite` préservé lors du redéploiement
- **Config** : Fichier `.env` avec tokens Netatmo (ne pas commiter)
- **Backup** : Pensez à sauvegarder `./db/rainatmo.sqlite` régulièrement
- **Init historique** : Optionnelle mais recommandée pour avoir 5 ans de données
- **Maintenance** : Jobs cron automatiques (refresh token, updates)

---

## 📊 Commandes Utiles

```bash
# Logs en temps réel
docker-compose logs -f

# Redémarrer sans rebuild
docker-compose restart

# Shell dans le container
docker exec -it rainatmo sh

# Stats base de données
docker exec rainatmo sqlite3 /app/db/rainatmo.sqlite \
  "SELECT period_type, COUNT(*) FROM rainfall_data GROUP BY period_type;"

# Backup base de données
docker exec rainatmo cat /app/db/rainatmo.sqlite > backup_$(date +%Y%m%d).sqlite
```
