-- Migration: PIN 4 chiffres → 6 chiffres
--
-- Force tous les utilisateurs existants à créer un nouveau code à 6 chiffres
-- lors de leur prochaine connexion. Le serveur détecte pin_must_reset = true
-- avant vérification Argon2 et retourne PIN_RESET_REQUIRED (409) directement
-- (l'utilisateur n'a pas besoin de son ancien code). Le frontend redirige
-- automatiquement vers l'écran "Créez votre code secret".
--
-- Les nouveaux comptes créés après cette migration auront directement un PIN
-- à 6 chiffres — pin_must_reset restera false par défaut.

UPDATE public.users
SET    pin_must_reset = true
WHERE  pin_must_reset = false;
