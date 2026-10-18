#!/usr/bin/env bash
# ============================================================
# Prueba del flujo compra -> taller -> informe a través del BFF
#
# Requiere corriendo: BFF (4000), ms-publication, ms-product, payments (8086),
# reports (8087), RabbitMQ y, para ver los correos, Mailpit (http://localhost:8025).
# El BFF debe estar en modo dev (ALLOW_DEV_AUTH_HEADERS=true) porque se usan headers X-User-*.
#
# Uso:
#   ./script/test-orders.sh                     # toma la primera publicación ACTIVE del catálogo
#   PUB_ID=<id> ./script/test-orders.sh         # o una concreta
#   BUYER_EMAIL=tu@correo.com ./script/test-orders.sh
#
# Dependencias: curl, jq
# ============================================================

set -euo pipefail

BFF_URL="${BFF_URL:-http://localhost:4000}"
BUYER_ID="${BUYER_ID:-buyer-test-1}"
BUYER_EMAIL="${BUYER_EMAIL:-comprador@correo.cl}"
ADMIN_ID="${ADMIN_ID:-admin-test-1}"
OUT="${OUT:-/tmp/bff-test}"
mkdir -p "$OUT"

PASS=0
FAIL=0
ok()   { PASS=$((PASS + 1)); echo "  ✔ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ✘ $1"; }
check_status() {
  if [ "$2" = "$1" ]; then ok "$3 (HTTP $2)"; else fail "$3 (esperado $1, obtuvo $2)"; fi
}

BUYER=(-H "X-User-Id: $BUYER_ID" -H "X-User-Role: BUYER_SELLER")
ADMIN=(-H "X-User-Id: $ADMIN_ID" -H "X-User-Role: WORKSHOP_ADMIN")
JSON=(-H "Content-Type: application/json")

echo "== 0. Publicación a comprar"
if [ -z "${PUB_ID:-}" ]; then
  PUB_ID=$(curl -s "$BFF_URL/api/listings?status=ACTIVE&limit=20" \
    | jq -r --arg me "$BUYER_ID" '[.content[] | select(.sellerId != $me)][0].publicationId // empty')
fi
[ -n "$PUB_ID" ] || { echo "No hay publicaciones ACTIVE para comprar (pasa PUB_ID=...)"; exit 1; }
echo "  publicación: $PUB_ID"

echo "== 1. Validaciones"
check_status 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BFF_URL/api/orders" "${JSON[@]}" -d '{}')" "comprar sin sesión"
check_status 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BFF_URL/api/orders" "${BUYER[@]}" "${JSON[@]}" \
  -d "{\"publicationIds\":[\"$PUB_ID\"],\"buyerEmail\":\"no-es-correo\"}")" "correo inválido"
check_status 403 "$(curl -s -o /dev/null -w '%{http_code}' "$BFF_URL/api/inspections" "${BUYER[@]}")" "bandeja del admin sin ser admin"

echo "== 2. Comprar"
CODE=$(curl -s -o "$OUT/order.json" -w '%{http_code}' -X POST "$BFF_URL/api/orders" "${BUYER[@]}" "${JSON[@]}" \
  -d "{\"publicationIds\":[\"$PUB_ID\"],\"buyerEmail\":\"$BUYER_EMAIL\"}")
check_status 201 "$CODE" "compra"
[ "$CODE" = "201" ] || { cat "$OUT/order.json"; exit 1; }
ORDER_ID=$(jq -r '.orderId' "$OUT/order.json")
ITEM_ID=$(jq -r '.items[0].orderItemId' "$OUT/order.json")
[ "$(jq -r '.paymentStatus' "$OUT/order.json")" = "HOLD_ESCROW" ] && ok "orden pagada ($ORDER_ID)" || fail "estado de pago"

echo "== 3. La pieza ya no se puede comprar de nuevo"
check_status 409 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BFF_URL/api/orders" -H 'X-User-Id: otro-comprador' "${JSON[@]}" \
  -d "{\"publicationIds\":[\"$PUB_ID\"],\"buyerEmail\":\"otro@correo.cl\"}")" "segunda compra"

echo "== 4. Bandeja del admin (le llega sola por RabbitMQ)"
INSPECTION_ID=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  curl -s "$BFF_URL/api/inspections" "${ADMIN[@]}" > "$OUT/inbox.json"
  INSPECTION_ID=$(jq -r --arg item "$ITEM_ID" '.[] | select(.orderItemId == $item) | .id' "$OUT/inbox.json")
  [ -n "$INSPECTION_ID" ] && break
  sleep 1
done
[ -n "$INSPECTION_ID" ] && ok "inspección $INSPECTION_ID en la bandeja" || { fail "la inspección no apareció"; exit 1; }
[ "$(jq -r --arg id "$INSPECTION_ID" '.[] | select(.id == $id) | .listing.images | length' "$OUT/inbox.json")" -gt 0 ] \
  && ok "trae las fotos de la pieza" || fail "sin fotos de la pieza (listing)"

echo "== 5. Formulario del admin"
check_status 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BFF_URL/api/inspections/$INSPECTION_ID/complete" "${ADMIN[@]}" "${JSON[@]}" \
  -d '{"result":"PASSED"}')" "formulario sin mantenimiento"
check_status 404 "$(curl -s -o /dev/null -w '%{http_code}' "$BFF_URL/api/reports/$ITEM_ID" "${BUYER[@]}")" "informe aún no existe"
check_status 200 "$(curl -s -o "$OUT/completed.json" -w '%{http_code}' -X POST "$BFF_URL/api/inspections/$INSPECTION_ID/complete" "${ADMIN[@]}" "${JSON[@]}" \
  -d '{"result":"PASSED","maintenanceDone":"Limpieza general y cambio de pasta térmica","notes":"Sin observaciones"}')" "enviar formulario"
check_status 409 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BFF_URL/api/inspections/$INSPECTION_ID/complete" "${ADMIN[@]}" "${JSON[@]}" \
  -d '{"result":"PASSED","maintenanceDone":"otra vez"}')" "enviar el formulario dos veces"

echo "== 6. Informe PDF (se genera por cola, puede tardar un instante)"
CODE=000
for _ in 1 2 3 4 5 6 7 8 9 10; do
  CODE=$(curl -s -o "$OUT/informe.pdf" -w '%{http_code}' "$BFF_URL/api/reports/$ITEM_ID" "${BUYER[@]}")
  [ "$CODE" = "200" ] && break
  sleep 1
done
check_status 200 "$CODE" "descargar informe como comprador"
head -c 5 "$OUT/informe.pdf" | grep -q '%PDF' && ok "es un PDF válido ($OUT/informe.pdf)" || fail "no es un PDF"
check_status 404 "$(curl -s -o /dev/null -w '%{http_code}' "$BFF_URL/api/reports/$ITEM_ID" -H 'X-User-Id: intruso' -H 'X-User-Role: BUYER_SELLER')" "informe de otro usuario"

echo "== 7. Mis compras"
curl -s "$BFF_URL/api/orders" "${BUYER[@]}" > "$OUT/mine.json"
jq -r --arg o "$ORDER_ID" '.[] | select(.orderId == $o) | .items[] | "  \(.description) -> revisión: \(.inspection.status // "sin dato")"' "$OUT/mine.json"

echo
echo "Correos: abre http://localhost:8025 (deben haber 2 para $BUYER_EMAIL, uno con el PDF)."
echo "Resultado: $PASS ok, $FAIL fallos"
[ "$FAIL" -eq 0 ]
