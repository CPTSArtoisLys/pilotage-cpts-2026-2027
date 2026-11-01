# Suivi des indicateurs ACI – CPTS Artois Lys (année 5 : 15/09/2026 → 14/09/2027)

Formulaire de pilotage **public** : la consultation est ouverte à tous, sans connexion.

**Aucun nom de personne ni nom de fichier n'est publié.** Les justificatifs sont déposés et consultés dans Plexus (connexion Plexus Santé). La page ne contient que les indicateurs, les statuts, les résultats et des liens vers les dossiers Plexus.

| Élément | Rôle |
|---|---|
| `index.html`, `config.js` | La page (GitHub Pages) |
| `data/indicateurs.json`, `pieces.json`, `journal.json` | Données du suivi, sans nom de personne |
| `data/plexus-index.json` | Nombre de fichiers par dossier Plexus (écrit par le robot, sans noms de fichiers) |
| `config/mapping.json` | Correspondance ligne du tableau → dossier Plexus |
| `scripts/sync.mjs`, `.github/workflows/sync.yml` | Robot : lit Plexus toutes les 15 min et met à jour l'index |

## Mise en route du robot (une seule fois)
1. Plexus Cloud > Paramètres personnels > Sécurité > « Créer un nouveau mot de passe d'application ».
2. Settings > Secrets and variables > Actions : `NC_URL` = `https://cptsartoislys-cloud.plexus-sante.fr`, `NC_USER` = identifiant Plexus Cloud, `NC_APP_PASSWORD` = le mot de passe d'application.
3. Onglet Actions > « Synchronisation Plexus » > Run workflow.

## Modifier le suivi
Bouton « Mode édition » : coller un jeton GitHub personnel (fine-grained, limité à ce dépôt, « Contents : lecture et écriture »). Il reste dans le navigateur. **La page est publique : ne saisir aucun nom de personne.**

## Règle de confidentialité
Ne jamais déposer de justificatif dans ce dépôt : ils vont uniquement dans Plexus.
