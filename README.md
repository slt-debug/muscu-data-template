# Muscu : modèle de dépôt de données

Ce dépôt sert de **modèle** pour l'appli Muscu (suivi de séances de musculation, iPhone et Android) et son dashboard.
Chaque utilisateur crée **son propre dépôt privé** à partir de ce modèle : ses séances, mesures et objectifs y sont
enregistrés, et personne d'autre ne les voit.

**L'appli est réservée à un cercle privé** : avant de l'installer, envoie ton nom d'utilisateur GitHub à la personne
qui te l'a proposée, pour qu'elle t'ajoute à la liste. Sinon l'appli affichera « Appli réservée ».

Ce modèle ne contient aucune donnée : l'appli crée ses fichiers elle-même au premier enregistrement.

## 1. Créer ton dépôt (2 min, sur ordinateur)

1. Crée un compte gratuit sur [github.com](https://github.com) si tu n'en as pas.
2. En haut de cette page : **Use this template › Create a new repository**.
3. Nom : `muscu-data`. Coche **Private**. Puis **Create repository**.

## 2. Créer un jeton d'accès (3 min)

L'appli a besoin d'un jeton pour lire et écrire **uniquement** ton dépôt `muscu-data`.

1. Ta photo de profil (en haut à droite) › **Settings** › **Developer settings** (tout en bas à gauche).
2. **Personal access tokens › Fine-grained tokens › Generate new token**.
3. Remplis :
   - **Token name** : `Muscu téléphone`
   - **Expiration** : par exemple 1 an (GitHub te prévient par e-mail avant l'expiration)
   - **Repository access** : **Only select repositories** › `muscu-data`
   - **Permissions › Repository permissions › Contents** : **Read and write**
4. **Generate token**, puis **copie-le tout de suite** (il commence par `github_pat_` et ne s'affiche qu'une fois).

Ne le donne à personne. Si tu le perds, supprime-le et crée-en un autre.

## 3. Installer l'appli sur ton téléphone

Ouvre **https://slt-debug.github.io/muscu-app/** :

- **Android (Chrome)** : menu ⋮ › **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
- **iPhone (Safari)** : bouton Partager › **Sur l'écran d'accueil**.

Puis, dans l'appli : **Réglages › Synchronisation GitHub** :

| Champ | À saisir |
|---|---|
| Compte GitHub | ton nom d'utilisateur GitHub |
| Dépôt de données | `muscu-data` |
| Fichier | `data.json` |
| Jeton d'accès | le jeton copié à l'étape 2 |

La carte **« Bien démarrer »** de la page Objectifs te guide ensuite : **choix de ton programme** (modèles prêts à l'emploi,
modifiables ensuite dans le dashboard), objectifs, première séance, première pesée.

## 4. Le dashboard sur ordinateur (facultatif)

Ouvre **https://slt-debug.github.io/muscu-app/dashboard/** et connecte-toi avec les mêmes informations
(ou un deuxième jeton créé de la même façon). Rien à installer.

## 5. Notification de rappel des mensurations (facultatif)

Ton dépôt contient déjà un automate qui peut t'envoyer une notification le jour où tes mensurations sont à refaire
(réglage dans l'appli : **Réglages › Rappel mensurations**). Pour l'activer :

1. Installe l'appli **ntfy** sur ton téléphone (Play Store ou App Store) et abonne-toi à un **sujet** au nom difficile
   à deviner (par exemple une suite de mots et de chiffres) : quiconque connaît ce nom peut lire les notifications.
2. Dans ton dépôt `muscu-data` : **Settings › Secrets and variables › Actions › New repository secret**,
   nom `NTFY_TOPIC`, valeur : ton sujet.

Sans ce secret, l'automate ne fait rien. Il n'envoie rien non plus avant ta première mesure.
