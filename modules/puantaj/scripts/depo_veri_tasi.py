"""Depojin (standalone warehouse app) -> ik puantaj depo entegrasyonu veri tasima scripti.

Kaynak (eski depojin Render Postgres, DEPO_KAYNAK_DATABASE_URL env) veritabanindaki
tablolari, hedef (bu uygulamanin DATABASE_URL'i) veritabanindaki yeni depo tablolarina
ID'leri koruyarak kopyalar. SQLAlchemy core + plain table reflection kullanir; app.models
import etmez, boylece model degisiklikleri script'i bozmaz.

Tablo eslemesi (CLAUDE.md ile ayni):
  users               -> depo_users            (yeni employee_id kolonu NULL birakilir)
  audit_loglari        -> depo_audit_loglari
  login_denemeleri     -> depo_login_denemeleri
  depolar              -> depolar               (1:1)
  depo_stoklari        -> depo_stoklari         (1:1)
  sayim_oturumlari     -> sayim_oturumlari      (1:1)
  stoklar              -> stoklar               (1:1)
  seriler              -> seriler               (1:1)
  tarama_loglari       -> tarama_loglari        (1:1)

Kullanim:
    DEPO_KAYNAK_DATABASE_URL=postgresql://... DATABASE_URL=postgresql://... \
        python scripts/depo_veri_tasi.py [--force] [--dry-run]

--force: hedefte depo_users icinde satir olsa bile calistirmaya devam eder (var olan
         satirlari SILMEZ, sadece idempotency guard'ini atlar - id cakismasi olursa
         insert hata verir).
--dry-run: hicbir yazma yapmadan sadece kaynak/hedef satir sayilarini raporlar.
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass

from sqlalchemy import MetaData, Table, create_engine, insert, select, text
from sqlalchemy.engine import Engine


# Kaynak tablo adi -> hedef tablo adi. Siralama FK-guvenli kopyalama sirasidir.
TABLE_MAPPING: list[tuple[str, str]] = [
    ("users", "depo_users"),
    ("depolar", "depolar"),
    ("depo_stoklari", "depo_stoklari"),
    ("sayim_oturumlari", "sayim_oturumlari"),
    ("stoklar", "stoklar"),
    ("seriler", "seriler"),
    ("tarama_loglari", "tarama_loglari"),
    ("audit_loglari", "depo_audit_loglari"),
    ("login_denemeleri", "depo_login_denemeleri"),
]

# Bu kolonlar hedefte var ama kaynakta yok; kopyalanirken atlanir / NULL birakilir.
TARGET_ONLY_COLUMNS: dict[str, set[str]] = {
    "depo_users": {"employee_id"},
}


@dataclass
class TableCopyResult:
    source_table: str
    target_table: str
    source_rows: int
    copied_rows: int


def _get_engine(env_var: str) -> Engine:
    url = os.environ.get(env_var)
    if not url:
        print(f"HATA: {env_var} ortam degiskeni tanimli degil.", file=sys.stderr)
        sys.exit(1)
    return create_engine(url)


def _reflect_table(metadata: MetaData, engine: Engine, table_name: str) -> Table:
    return Table(table_name, metadata, autoload_with=engine)


def _check_idempotency(target_engine: Engine, *, force: bool) -> None:
    metadata = MetaData()
    try:
        depo_users = _reflect_table(metadata, target_engine, "depo_users")
    except Exception as exc:
        print(f"HATA: hedefte depo_users tablosu bulunamadi/okunamadi: {exc}", file=sys.stderr)
        sys.exit(1)

    with target_engine.connect() as conn:
        existing_count = conn.execute(select(depo_users.c.id).limit(1)).first()
    if existing_count is not None and not force:
        print(
            "HATA: hedefte depo_users icinde zaten satir var. Tekrar calistirmak icin "
            "--force kullanin (var olan satirlari SILMEZ, sadece bu kontrolu atlar).",
            file=sys.stderr,
        )
        sys.exit(1)


def _copy_table(
    source_engine: Engine,
    target_engine: Engine,
    source_table_name: str,
    target_table_name: str,
    *,
    dry_run: bool,
) -> TableCopyResult:
    source_metadata = MetaData()
    target_metadata = MetaData()
    source_table = _reflect_table(source_metadata, source_engine, source_table_name)
    target_table = _reflect_table(target_metadata, target_engine, target_table_name)

    target_only = TARGET_ONLY_COLUMNS.get(target_table_name, set())
    source_columns = [c.name for c in source_table.columns]
    target_columns = {c.name for c in target_table.columns}
    # Sadece hem kaynakta hem hedefte olan kolonlari kopyala (target_only kolonlar NULL/
    # server_default'a birakilir).
    shared_columns = [c for c in source_columns if c in target_columns and c not in target_only]

    with source_engine.connect() as source_conn:
        rows = source_conn.execute(select(*(source_table.c[name] for name in shared_columns))).mappings().all()

    if dry_run:
        return TableCopyResult(source_table_name, target_table_name, len(rows), 0)

    if not rows:
        return TableCopyResult(source_table_name, target_table_name, 0, 0)

    payload = [dict(row) for row in rows]
    with target_engine.begin() as target_conn:
        target_conn.execute(insert(target_table), payload)

    return TableCopyResult(source_table_name, target_table_name, len(rows), len(payload))


def _reset_sequence(target_engine: Engine, table_name: str, id_column: str = "id") -> None:
    if target_engine.dialect.name != "postgresql":
        return
    with target_engine.begin() as conn:
        seq_name = conn.execute(
            text("SELECT pg_get_serial_sequence(:table_name, :column_name)"),
            {"table_name": table_name, "column_name": id_column},
        ).scalar()
        if not seq_name:
            return
        conn.execute(
            text(
                f"SELECT setval(:seq_name, COALESCE((SELECT MAX({id_column}) FROM {table_name}), 1), "
                f"(SELECT MAX({id_column}) FROM {table_name}) IS NOT NULL)"
            ),
            {"seq_name": seq_name},
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="Idempotency guard'ini atla.")
    parser.add_argument("--dry-run", action="store_true", help="Yazma yapma, sadece rapor ver.")
    args = parser.parse_args()

    source_engine = _get_engine("DEPO_KAYNAK_DATABASE_URL")
    target_engine = _get_engine("DATABASE_URL")

    if not args.dry_run:
        _check_idempotency(target_engine, force=args.force)

    results: list[TableCopyResult] = []
    for source_table_name, target_table_name in TABLE_MAPPING:
        result = _copy_table(
            source_engine, target_engine, source_table_name, target_table_name, dry_run=args.dry_run
        )
        results.append(result)
        print(
            f"{source_table_name:>20} -> {target_table_name:<24} "
            f"kaynak={result.source_rows:<8} kopyalanan={result.copied_rows}"
        )

    if not args.dry_run:
        for _, target_table_name in TABLE_MAPPING:
            _reset_sequence(target_engine, target_table_name)
        print("Sequence'lar sifirlandi (setval).")

    print("Tamamlandi." if not args.dry_run else "Dry-run tamamlandi (hicbir yazma yapilmadi).")


if __name__ == "__main__":
    main()
