"""Depo/sayim (depojin) modulunun parent router'i.

Aggregates the 9 ported depojin routers under a single ``/api/depo`` prefix. See
CLAUDE.md for the mechanical prefix mapping this package follows (each sub-router's leading
``/api`` was stripped before porting; this parent router re-adds the ``/api/depo`` prefix).

Final route table (see each sub-module's own docstring for the original depojin path):
  /api/depo/auth/...              (auth.py)
  /api/depo/sayim/...             (sayim.py + rapor.py, no path overlap)
  /api/depo/tarama                (tarama.py)
  /api/depo/ws/sayim/{oturum_id}  (tarama.py, WebSocket)
  /api/depo/import/...            (import_excel.py)
  /api/depo/export/...            (export.py)
  /api/depo/admin/...             (admin.py - depo's own audit log, distinct from
                                    /api/admin/* and /api/depo/yonetim/*)
  /api/depo/stok/..., /api/depo/seri/...  (stok_yonetim.py)
  /api/depo/depo/...              (depo.py - warehouse CRUD)
  /api/depo/zimmet-senedi/...     (zimmet_senedi.py - gunluk zimmet teslim tutanagi PDF'i,
                                    puantaj tarafinda yeni eklendi, depojin'de karsiligi yok)
"""

from __future__ import annotations

from fastapi import APIRouter

from app.routers.depo import (
    admin,
    auth,
    depo,
    export,
    import_excel,
    rapor,
    sayim,
    stok_yonetim,
    tarama,
    zimmet,
    zimmet_senedi,
)

router = APIRouter(prefix="/api/depo")

router.include_router(auth.router)
router.include_router(sayim.router)
router.include_router(tarama.router)
router.include_router(import_excel.router)
router.include_router(export.router)
router.include_router(rapor.router)
router.include_router(admin.router)
router.include_router(stok_yonetim.router)
router.include_router(depo.router)
router.include_router(zimmet.router)
router.include_router(zimmet_senedi.router)
