#!/usr/bin/env bash
# ============================================================
# Script de pruebas del Marketplace BFF
#
# Valida los endpoints expuestos por el BFF contra los
# microservicios reales (ms-publication, ms-product, ms-user).
# Además obtiene un producto REAL del catálogo (ms-product) y lo
# usa para crear una publicación, para poder validar después en
# las vistas de test (vistas-test/).
#
# Dependencias: curl, jq
# ============================================================

set -euo pipefail

# ------------------------------------------------------------------
# Configuración (ajustable por variables de entorno)
# ------------------------------------------------------------------
BFF_URL="${BFF_URL:-http://localhost:4000}"
PRODUCTS_URL="${PRODUCTS_URL:-http://localhost:8080/api/v1/products}"
AZURE_OID="${AZURE_OID:-2150f48f-e611-439c-83cf-37eed0c5f232}"
ROLE="${ROLE:-BUYER_SELLER}"

OUT="${OUT:-/tmp/bff-test}"
mkdir -p "$OUT"

PASS=0
FAIL=0

# ------------------------------------------------------------------
# Utilidades
# ------------------------------------------------------------------
ok()   { PASS=$((PASS + 1)); echo "  ✔ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ✘ $1"; }

check_status() {
  local expected="$1" actual="$2" label="$3"
  if [ "$actual" = "$expected" ]; then ok "$label (HTTP $actual)"; else fail "$label (esperado $expected, obtuvo $actual)"; fi
}

summary() {
  echo
  echo "==========================================="
  echo "  PASADOS: $PASS   FALLIDOS: $FAIL"
  echo "==========================================="
  [ "$FAIL" -eq 0 ]
}

# ------------------------------------------------------------------
# 1. Obtener un producto real del catálogo (ms-product)
# ------------------------------------------------------------------
echo "==> Obteniendo un producto real del catálogo (ms-product)"
PRODUCT=$(curl -s -m 8 "$PRODUCTS_URL?page=1&limit=1")
PRODUCT_ID=$(echo "$PRODUCT" | jq -r '.content[0].productId // empty')
PRODUCT_LABEL=$(echo "$PRODUCT" | jq -r '[.content[0].brand, .content[0].model] | join(" ")' 2>/dev/null)

if [ -z "$PRODUCT_ID" ] || [ "$PRODUCT_ID" = "null" ]; then
  fail "no se pudo obtener un producto del catálogo (¿está ms-product corriendo?)"
  summary; exit 1
fi
ok "producto obtenido: $PRODUCT_LABEL ($PRODUCT_ID)"
echo "PRODUCT_ID=$PRODUCT_ID"
echo "PRODUCT_LABEL=$PRODUCT_LABEL" > "$OUT/producto.txt"

# ------------------------------------------------------------------
# 2. GET /health
# ------------------------------------------------------------------
echo
echo "==> GET $BFF_URL/health"
CODE=$(curl -s -o "$OUT/health.json" -w "%{http_code}" -m 5 "$BFF_URL/health")
check_status 200 "$CODE" "GET /health"
jq -e '.status == "ok"' "$OUT/health.json" >/dev/null && ok "health.status = ok" || fail "health.status != ok"

# ------------------------------------------------------------------
# 3. GET /api/categories
# ------------------------------------------------------------------
echo
echo "==> GET $BFF_URL/api/categories"
CODE=$(curl -s -o "$OUT/categories.json" -w "%{http_code}" -m 8 "$BFF_URL/api/categories")
check_status 200 "$CODE" "GET /api/categories"
COUNT=$(jq 'length' "$OUT/categories.json" 2>/dev/null || echo 0)
[ "$COUNT" -ge 1 ] && ok "$COUNT categoría(s) cargada(s)" || fail "no se obtuvieron categorías"

# ------------------------------------------------------------------
# 4. GET /api/listings (viñetas)
# ------------------------------------------------------------------
echo
echo "==> GET $BFF_URL/api/listings?status=ACTIVE"
CODE=$(curl -s -o "$OUT/listings.json" -w "%{http_code}" -m 15 "$BFF_URL/api/listings?status=ACTIVE&page=1&limit=20")
check_status 200 "$CODE" "GET /api/listings"

TOTAL=$(jq '.totalElements' "$OUT/listings.json" 2>/dev/null || echo 0)
echo "   totalElements=$TOTAL"
FIRST_ID=$(jq -r '.content[0].publicationId // empty' "$OUT/listings.json" 2>/dev/null)
echo "PUBLICATION_ID=$FIRST_ID"
echo "PUBLICATION_ID=$FIRST_ID" > "$OUT/publicacion.txt"

# ------------------------------------------------------------------
# 5. GET /api/listings/{id} (detalle) — si hay alguna publicación
# ------------------------------------------------------------------
if [ -n "$FIRST_ID" ]; then
  echo
  echo "==> GET $BFF_URL/api/listings/$FIRST_ID"
  CODE=$(curl -s -o "$OUT/detalle.json" -w "%{http_code}" -m 8 "$BFF_URL/api/listings/$FIRST_ID")
  check_status 200 "$CODE" "GET /api/listings/{id}"
  SEL=$(jq -r '.seller.username // "null"' "$OUT/detalle.json" 2>/dev/null)
  PROD=$(jq -r '.product.brand // "null"' "$OUT/detalle.json" 2>/dev/null)
  echo "   vendedor=$SEL  producto=$PROD"
else
  echo
  echo "  (no hay publicaciones existentes para probar el detalle)"
fi

# ------------------------------------------------------------------
# 6. POST /api/listings (crear publicación con el producto real)
# ------------------------------------------------------------------
echo
echo "==> POST $BFF_URL/api/listings (producto: $PRODUCT_LABEL)"
BODY=$(jq -n \
  --arg pid "$PRODUCT_ID" \
  --arg title "Prueba BFF - $PRODUCT_LABEL" \
  '{productId: $pid, title: $title, price: 250000, grade: "GRADE_A"}')

CODE=$(curl -s -o "$OUT/creada.json" -w "%{http_code}" -m 10 -X POST "$BFF_URL/api/listings" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $AZURE_OID" \
  -H "X-User-Role: $ROLE" \
  -d "$BODY")
check_status 201 "$CODE" "POST /api/listings (crear)"
if [ "$CODE" = "201" ]; then
  NEW_ID=$(jq -r '.publicationId' "$OUT/creada.json")
  NEW_STATUS=$(jq -r '.status' "$OUT/creada.json")
  NEW_SELLER=$(jq -r '.sellerId' "$OUT/creada.json")
  echo "   creada: $NEW_ID | status=$NEW_STATUS | sellerId=$NEW_SELLER"

  [ "$NEW_SELLER" = "$AZURE_OID" ] && ok "sellerId resuelto del header X-User-Id" || fail "sellerId != azure_oid"
  [ "$NEW_STATUS" = "ACTIVE" ] && ok "status inicial = ACTIVE" || fail "status inicial != ACTIVE"
  echo "PUBLICATION_ID=$NEW_ID" > "$OUT/publicacion.txt"
fi

# ------------------------------------------------------------------
# 7. POST /api/listings sin headers -> 401
# ------------------------------------------------------------------
echo
echo "==> POST $BFF_URL/api/listings (sin headers auth)"
CODE=$(curl -s -o "$OUT/sin_auth.json" -w "%{http_code}" -m 10 -X POST "$BFF_URL/api/listings" \
  -H "Content-Type: application/json" \
  -d "$BODY")
check_status 401 "$CODE" "POST /api/listings sin headers -> 401"

# ------------------------------------------------------------------
# 8. POST /api/listings con price negativo -> 400
# ------------------------------------------------------------------
echo
echo "==> POST $BFF_URL/api/listings (price negativo)"
BODY_BAD=$(jq -n \
  --arg pid "$PRODUCT_ID" \
  '{productId: $pid, title: "Precio invalido", price: -500, grade: "GRADE_A"}')
CODE=$(curl -s -o "$OUT/bad.json" -w "%{http_code}" -m 10 -X POST "$BFF_URL/api/listings" \
  -H "Content-Type: application/json" \
  -H "X-User-Id: $AZURE_OID" \
  -H "X-User-Role: $ROLE" \
  -d "$BODY_BAD")
check_status 400 "$CODE" "POST /api/listings price negativo -> 400"

# ------------------------------------------------------------------
# 9. POST /api/users/sync
# ------------------------------------------------------------------
echo
echo "==> POST $BFF_URL/api/users/sync (crea o actualiza usuario)"
CODE=$(curl -s -o "$OUT/sync.json" -w "%{http_code}" -m 10 -X POST "$BFF_URL/api/users/sync" \
  -H "X-User-Id: $AZURE_OID" \
  -H "X-User-Role: $ROLE" \
  -H "X-User-Email: pansito@pcmarketbuilder.onmicrosoft.com" \
  -H "X-User-Name: pansito")
check_status 200 "$CODE" "POST /api/users/sync con headers -> 200"
if [ "$CODE" = "200" ]; then
  SYNC_USER=$(jq -r '.username // empty' "$OUT/sync.json" 2>/dev/null)
  [ -n "$SYNC_USER" ] && ok "usuario sincronizado: $SYNC_USER" || fail "sync no devolvió username"
fi

echo
echo "==> POST $BFF_URL/api/users/sync (sin headers)"
CODE=$(curl -s -o "$OUT/sync_noauth.json" -w "%{http_code}" -m 10 -X POST "$BFF_URL/api/users/sync")
check_status 401 "$CODE" "POST /api/users/sync sin headers -> 401"

# ------------------------------------------------------------------
# 10. GET /api/users/me
# ------------------------------------------------------------------
echo
echo "==> GET $BFF_URL/api/users/me"
CODE=$(curl -s -o "$OUT/me.json" -w "%{http_code}" -m 8 "$BFF_URL/api/users/me" \
  -H "X-User-Id: $AZURE_OID" -H "X-User-Role: $ROLE")
check_status 200 "$CODE" "GET /api/users/me con headers -> 200"
if [ "$CODE" = "200" ]; then
  ME_USER=$(jq -r '.username // empty' "$OUT/me.json" 2>/dev/null)
  [ "$ME_USER" = "pansito" ] && ok "me.username = pansito" || fail "me.username != pansito ($ME_USER)"
fi

echo
echo "==> GET $BFF_URL/api/users/me (sin headers)"
CODE=$(curl -s -o "$OUT/me_noauth.json" -w "%{http_code}" -m 8 "$BFF_URL/api/users/me")
check_status 401 "$CODE" "GET /api/users/me sin headers -> 401"

# ------------------------------------------------------------------
# 11. POST /api/listings/:id/images (usa la publicación creada arriba)
# ------------------------------------------------------------------
if [ -n "${NEW_ID:-}" ]; then
  echo
  echo "==> POST $BFF_URL/api/listings/$NEW_ID/images (dueño, primaria)"
  CODE=$(curl -s -o "$OUT/img.json" -w "%{http_code}" -m 10 -X POST "$BFF_URL/api/listings/$NEW_ID/images" \
    -H "Content-Type: application/json" \
    -H "X-User-Id: $AZURE_OID" \
    -H "X-User-Role: $ROLE" \
    -d '{"imageUrl":"https://img/avatar.png","isPrimary":true}')
  check_status 201 "$CODE" "POST /api/listings/:id/images dueño -> 201"
  if [ "$CODE" = "201" ]; then
    IS_PRIMARY=$(jq -r '.images[0].isPrimary // empty' "$OUT/img.json" 2>/dev/null)
    [ "$IS_PRIMARY" = "true" ] && ok "imagen queda isPrimary=true" || fail "imagen no quedó primaria"
  fi

  OTHER_OID="88888888-8888-8888-8888-888888888888"
  echo
  echo "==> POST $BFF_URL/api/listings/$NEW_ID/images (no-dueño)"
  CODE=$(curl -s -o "$OUT/img_forbidden.json" -w "%{http_code}" -m 10 -X POST "$BFF_URL/api/listings/$NEW_ID/images" \
    -H "Content-Type: application/json" \
    -H "X-User-Id: $OTHER_OID" \
    -H "X-User-Role: $ROLE" \
    -d '{"imageUrl":"https://img/otro.jpg","isPrimary":false}')
  check_status 403 "$CODE" "POST /api/listings/:id/images no-dueño -> 403"

  echo
  echo "==> POST $BFF_URL/api/listings/$NEW_ID/images (sin headers)"
  CODE=$(curl -s -o "$OUT/img_noauth.json" -w "%{http_code}" -m 10 -X POST "$BFF_URL/api/listings/$NEW_ID/images" \
    -H "Content-Type: application/json" \
    -d '{"imageUrl":"https://img/sin-auth.jpg"}')
  check_status 400 "$CODE" "POST /api/listings/:id/images sin headers -> 400"
else
  echo
  echo "  (no se pudo crear publicación para probar el endpoint de imágenes)"
fi

# ------------------------------------------------------------------
# Resumen
# ------------------------------------------------------------------
echo
if [ -f "$OUT/producto.txt" ]; then echo "Producto para la vista de test: $(cat "$OUT/producto.txt")"; fi
if [ -f "$OUT/publicacion.txt" ]; then echo "Publicación probada:            $(cat "$OUT/publicacion.txt")"; fi
summary
