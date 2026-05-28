#!/bin/bash
# Tests curl Unipesa - Remplacez les variables avec vos valeurs réelles

PUBLIC_ID="YOUR_PUBLIC_ID"
MERCHANT_ID="YOUR_MERCHANT_ID"
SECRET_KEY="YOUR_SECRET_KEY"
CALLBACK_URL="YOUR_CALLBACK_URL"

# Test 1: Payment C2B (dépot)
echo "=== Test C2B (Dépôt) ==="
ORDER_ID=$(uuidgen)
PHONE="243XXXXXXXXX"  # Remplacer
AMOUNT=1000
PROVIDER_ID=9  # 9=Vodacom, 10=Orange, 17=Airtel, 19=Africell

# Calcul signature (en shell, simplifié - utilise plutôt le script Node pour la signature exacte)
# Pour test réel, utilisez: node scripts/unipesa-c2b-test.mjs $PHONE $AMOUNT $PROVIDER_ID

echo "Pour test C2B réel, utilisez:"
echo "  node scripts/unipesa-c2b-test.mjs $PHONE $AMOUNT $PROVIDER_ID"
echo ""

# Test 2: Payment B2C (retrait)
echo "=== Test B2C (Retrait) ==="
echo "Pour test B2C réel, utilisez:"
echo "  node scripts/unipesa-b2c-test.mjs $PHONE $AMOUNT $PROVIDER_ID"
echo ""

# Test 3: Status check
echo "=== Test Status ==="
echo "Pour vérifier un order_id, utilisez:"
echo "  node scripts/unipesa-status-test.mjs <order_id>"
echo ""

# Test 4: Diagnostic complet
echo "=== Diagnostic ==="
echo "Pour diagnostic complet:"
echo "  node scripts/unipesa-diag.mjs"
