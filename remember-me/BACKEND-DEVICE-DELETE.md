# Backend Spec: DELETE /api/dispositivos/{mac} — Soft-Delete Device

## Overview

Implements device removal with **soft-delete** semantics. When a user deletes a device, only their permission is removed. If they are the last owner, the device row is soft-deleted (`deleted_at` set). All historical data (telemetry, alerts, events, schedules) is preserved.

## Endpoint

```
DELETE /api/dispositivos/{mac}
Authorization: Bearer <access_token>
```

**Scope required:** `write:devices`

## Request

No request body. MAC is in the URL path.

## Success Response

```
HTTP 200
{
  "status": "deleted",
  "mac": "00:1B:44:11:3A:B7"
}
```

## Error Responses

| HTTP | Body |
|------|------|
| 401 | `{"error": "unauthorized", "message": "Token inválido o expirado"}` |
| 403 | `{"error": "forbidden", "message": "No tienes permiso para eliminar este dispositivo", "mac": "..."}` |
| 404 | `{"error": "not_found", "message": "Dispositivo no encontrado", "mac": "..."}` |
| 429 | `{"error": "rate_limited", "message": "Demasiadas solicitudes"}` |

## Backend Logic (Python Pseudocode)

```python
@app.delete("/api/dispositivos/{mac}")
async def delete_device(mac: str, request: Request, db: Session = Depends(get_db)):
    # 1. Authenticate JWT
    user = get_current_user(request, db)
    if not user:
        raise HTTPException(status_code=401, detail={"error": "unauthorized", "message": "Token inválido o expirado"})
    
    # 2. Look up device by MAC
    artefacto = db.query(Artefacto).filter(Artefacto.mac == mac).first()
    if not artefacto or artefacto.deleted_at is not None:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": "Dispositivo no encontrado", "mac": mac})
    
    # 3. Verify user permission
    permiso = db.query(PermisoUsuarioArtefacto).filter(
        PermisoUsuarioArtefacto.id_usuario == user.id,
        PermisoUsuarioArtefacto.id_artefacto == artefacto.id
    ).first()
    if not permiso:
        raise HTTPException(status_code=403, detail={"error": "forbidden", "message": "No tienes permiso para eliminar este dispositivo", "mac": mac})
    
    # 4. Delete user's permission row
    db.delete(permiso)
    
    # 5. Check remaining permissions
    remaining = db.query(PermisoUsuarioArtefacto).filter(
        PermisoUsuarioArtefacto.id_artefacto == artefacto.id
    ).count()
    
    # 6. If no users left, soft-delete the artefacto
    if remaining == 0:
        artefacto.deleted_at = datetime.utcnow()
        db.add(artefacto)
    
    # 7. Commit
    db.commit()
    
    return {"status": "deleted", "mac": mac}
```

## Database Impact

### Tables affected:
| Table | Action | Notes |
|-------|--------|-------|
| `permisos_usuario_artefacto` | DELETE row for (user, artefacto) | Primary action |
| `artefactos` | UPDATE `deleted_at = NOW()` | Only if remaining permissions = 0 |

### Tables NOT affected (preserved via soft-delete):
| Table | Preserved because |
|-------|------------------|
| `alertas_sistema` | Soft-delete avoids CASCADE |
| `telemetria` | Data retained for history |
| `eventos_usuario` | Audit trail preserved |
| `recomendaciones` | AI history preserved |
| `credenciales_mtls` | Crypto keys preserved |
| `despliegues_ota` | OTA history preserved |
| `artefactos_horarios` | Schedule data preserved |
| `artefactos_limites` | Limits data preserved |

## Re-Pairing a Soft-Deleted Device

Because `artefactos.mac` has a `UNIQUE` constraint, the existing `POST /api/dispositivos` endpoint should be updated:

1. Check if a row exists for the MAC with `deleted_at IS NOT NULL`
2. If yes → clear `deleted_at = NULL`, reset defaults (`estado_deseado = FALSE`, `override_activo = FALSE`, etc.), and create the permission row
3. If no → proceed as normal insert

```python
# In POST /api/dispositivos handler, after MAC validation:
existing = db.query(Artefacto).filter(Artefacto.mac == mac).first()
if existing and existing.deleted_at is not None:
    # Reactivate soft-deleted device
    existing.deleted_at = None
    existing.nombre_personalizado = None
    existing.nivel_prioridad = 'media'
    existing.estado_deseado = False
    existing.override_activo = False
    existing.vencimiento_lease = None
    existing.auto_kill_at = None
    existing.ai_override_until = None
    artefacto = existing
elif existing and existing.deleted_at is None:
    # Device already active — just add permission if not already present
    pass
else:
    # New device — create row
    pass
```

## Required Query Change in GET /api/dispositivos

Ensure the device list query filters out soft-deleted rows:

```sql
SELECT a.*, pua.nivel_acceso
FROM artefactos a
JOIN permisos_usuario_artefacto pua ON a.id = pua.id_artefacto
WHERE pua.id_usuario = :user_id
  AND a.deleted_at IS NULL
ORDER BY a.last_seen_at DESC
```

## Rate Limiting

Add to existing `slowapi` config:
```
DELETE /api/dispositivos/{mac}: 5 requests/minute per user
```
