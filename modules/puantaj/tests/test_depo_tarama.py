from __future__ import annotations

import tempfile
import threading
import unittest
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import Base, DepoSayimStok, DepoSeri, DepoTaramaLog, DepoUser, SayimOturumu
from app.routers.depo.tarama import _islem
from app.depo_schemas import TaramaIn

_DEPO_TABLES = [
    DepoUser.__table__,
    SayimOturumu.__table__,
    DepoSayimStok.__table__,
    DepoSeri.__table__,
    DepoTaramaLog.__table__,
]


class DepoTaramaTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine, tables=_DEPO_TABLES)
        self.Session = sessionmaker(bind=self.engine, expire_on_commit=False)
        self.db = self.Session()
        self.user = DepoUser(ad="test", pin_hash="x", rol="sayan", aktif=True)
        self.oturum = SayimOturumu(ad="Test", durum="aktif")
        self.db.add_all([self.user, self.oturum])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine, tables=_DEPO_TABLES)
        self.engine.dispose()

    def stok_seri(self, kod: str, seri_no: str, sayildi: bool = False):
        stok = DepoSayimStok(
            oturum_id=self.oturum.id,
            stok_kodu=kod,
            urun_adi=f"Urun {kod}",
            portal_sayim=0,
        )
        self.db.add(stok)
        self.db.flush()
        seri = DepoSeri(
            oturum_id=self.oturum.id,
            stok_id=stok.id,
            seri_no=seri_no,
            seri_no_norm=seri_no.upper(),
            sayildi=sayildi,
        )
        self.db.add(seri)
        self.db.commit()
        return stok, seri

    def tara(self, seri: str, **secim):
        return _islem(
            self.db,
            TaramaIn(oturum_id=self.oturum.id, seri=seri, **secim),
            self.user,
        )

    def concurrent_scan(self, client_ids: list[str]):
        with tempfile.TemporaryDirectory() as td:
            db_path = Path(td) / "concurrent.db"
            engine = create_engine(
                f"sqlite:///{db_path.as_posix()}",
                connect_args={"check_same_thread": False, "timeout": 30},
            )
            Base.metadata.create_all(engine, tables=_DEPO_TABLES)
            Session = sessionmaker(bind=engine, expire_on_commit=False)
            seed = Session()
            user = DepoUser(ad="thread", pin_hash="x", rol="sayan", aktif=True)
            oturum = SayimOturumu(ad="Thread", durum="aktif")
            seed.add_all([user, oturum])
            seed.flush()
            stok = DepoSayimStok(
                oturum_id=oturum.id,
                stok_kodu="1132",
                urun_adi="Urun",
                portal_sayim=0,
            )
            seed.add(stok)
            seed.flush()
            seed.add(DepoSeri(
                oturum_id=oturum.id,
                stok_id=stok.id,
                seri_no="RW313131",
                seri_no_norm="RW313131",
                sayildi=False,
            ))
            seed.commit()
            user_id = user.id
            oturum_id = oturum.id
            seed.close()

            barrier = threading.Barrier(len(client_ids))
            results = []
            errors = []

            def worker(client_scan_id: str):
                db = Session()
                try:
                    local_user = db.get(DepoUser, user_id)
                    barrier.wait(timeout=5)
                    results.append(_islem(
                        db,
                        TaramaIn(
                            oturum_id=oturum_id,
                            seri="RW313131",
                            client_scan_id=client_scan_id,
                        ),
                        local_user,
                    ))
                except Exception as exc:
                    errors.append(exc)
                finally:
                    db.close()

            threads = [
                threading.Thread(target=worker, args=(client_scan_id,))
                for client_scan_id in client_ids
            ]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=30)

            check = Session()
            try:
                counted = check.scalar(select(func.count(DepoSeri.id)).where(DepoSeri.sayildi == True))
                log_count = check.scalar(select(func.count(DepoTaramaLog.id)))
            finally:
                check.close()
                engine.dispose()
            return results, errors, counted, log_count

    def test_plain_serial_single_stock_success_then_duplicate(self):
        self.stok_seri("1132", "RW313131")
        first = self.tara("RW313131")
        second = self.tara("RW313131")
        self.assertEqual(first.durum, "basarili")
        self.assertEqual(first.stok_kodu, "1132")
        self.assertEqual(second.durum, "mukerrer")

    def test_stock_serial_selects_matching_stock_automatically(self):
        self.stok_seri("1132", "RW313131")
        self.stok_seri("2241", "RW313131")
        result = self.tara("1132xRW313131")
        self.assertEqual(result.durum, "basarili")
        self.assertEqual(result.stok_kodu, "1132")
        self.assertEqual(result.parsed_stock_code, "1132")

    def test_plain_duplicate_returns_detailed_conflict(self):
        self.stok_seri("1132", "RW313131")
        self.stok_seri("2241", "RW313131")
        result = self.tara("RW313131")
        self.assertEqual(result.durum, "cakisma")
        self.assertEqual(len(result.cakisan_secenekler or []), 2)
        self.assertEqual(
            {x.stok_kodu for x in result.cakisan_secenekler or []},
            {"1132", "2241"},
        )

    def test_stock_mismatch_requires_selection(self):
        stok, seri = self.stok_seri("1132", "RW313131")
        result = self.tara("9999xRW313131")
        self.assertEqual(result.durum, "cakisma")
        self.assertIn("uyusmuyor", result.mesaj)
        option = (result.cakisan_secenekler or [])[0]
        self.assertFalse(option.barkod_stokuyla_uyumlu_mu)

        selected = self.tara(
            "9999xRW313131",
            secilen_seri_id=seri.id,
            secilen_stok_id=stok.id,
        )
        self.assertEqual(selected.durum, "basarili")
        self.assertEqual(selected.stok_kodu, "1132")

    def test_selected_duplicate_returns_duplicate(self):
        stok, seri = self.stok_seri("1132", "RW313131", sayildi=True)
        result = self.tara(
            "9999xRW313131",
            secilen_seri_id=seri.id,
            secilen_stok_id=stok.id,
        )
        self.assertEqual(result.durum, "mukerrer")

    def test_invalid_selection_is_rejected(self):
        stok, _ = self.stok_seri("1132", "RW313131")
        with self.assertRaises(HTTPException) as ctx:
            self.tara(
                "9999xRW313131",
                secilen_seri_id=99999,
                secilen_stok_id=stok.id,
            )
        self.assertEqual(ctx.exception.status_code, 400)

    def test_not_found(self):
        result = self.tara("YOK123")
        self.assertEqual(result.durum, "bulunamadi")

    def test_real_x_in_serial_is_not_split(self):
        self.stok_seri("1132", "RW31X3131")
        result = self.tara("RW31X3131")
        self.assertEqual(result.durum, "basarili")
        self.assertEqual(result.resolved_serial, "RW31X3131")

    def test_inactive_session_rejects_scan(self):
        self.oturum.durum = "tamamlandi"
        self.db.commit()
        with self.assertRaises(HTTPException) as ctx:
            self.tara("RW313131")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_same_client_scan_id_replays_original_result(self):
        self.stok_seri("1132", "RW313131")
        first = self.tara("RW313131", client_scan_id="scan-1")
        second = self.tara("RW313131", client_scan_id="scan-1")
        log_count = self.db.scalar(select(func.count(DepoTaramaLog.id)))

        self.assertEqual(first.durum, "basarili")
        self.assertFalse(first.idempotent_replay)
        self.assertEqual(second.durum, "basarili")
        self.assertTrue(second.idempotent_replay)
        self.assertEqual(second.client_scan_id, "scan-1")
        self.assertEqual(log_count, 1)

    def test_same_client_scan_id_with_different_payload_is_rejected(self):
        self.stok_seri("1132", "RW313131")
        self.tara("RW313131", client_scan_id="scan-1")
        with self.assertRaises(HTTPException) as ctx:
            self.tara("BASKA-SERI", client_scan_id="scan-1")
        self.assertEqual(ctx.exception.status_code, 409)

    def test_client_scan_id_is_scoped_to_user(self):
        self.stok_seri("1132", "RW313131")
        first = self.tara("RW313131", client_scan_id="shared-id")
        other = DepoUser(ad="other", pin_hash="x", rol="sayan", aktif=True)
        self.db.add(other)
        self.db.commit()
        second = _islem(
            self.db,
            TaramaIn(
                oturum_id=self.oturum.id,
                seri="RW313131",
                client_scan_id="shared-id",
            ),
            other,
        )
        self.assertEqual(first.durum, "basarili")
        self.assertEqual(second.durum, "mukerrer")
        self.assertFalse(second.idempotent_replay)

    def test_retry_replays_even_after_session_is_closed(self):
        self.stok_seri("1132", "RW313131")
        first = self.tara("RW313131", client_scan_id="scan-1")
        self.oturum.durum = "tamamlandi"
        self.db.commit()
        replay = self.tara("RW313131", client_scan_id="scan-1")
        self.assertEqual(replay.durum, first.durum)
        self.assertTrue(replay.idempotent_replay)

    def test_concurrent_same_client_scan_id_counts_once(self):
        results, errors, counted, log_count = self.concurrent_scan(
            ["parallel-1", "parallel-1"]
        )
        self.assertEqual(errors, [])
        self.assertEqual(len(results), 2)
        self.assertEqual([r.durum for r in results], ["basarili", "basarili"])
        self.assertEqual(sum(1 for r in results if r.idempotent_replay), 1)
        self.assertEqual(counted, 1)
        self.assertEqual(log_count, 1)

    def test_concurrent_different_devices_count_once(self):
        results, errors, counted, log_count = self.concurrent_scan(
            ["device-a", "device-b"]
        )
        self.assertEqual(errors, [])
        self.assertEqual(len(results), 2)
        self.assertEqual(
            sorted(r.durum for r in results),
            ["basarili", "mukerrer"],
        )
        self.assertEqual(counted, 1)
        self.assertEqual(log_count, 2)


if __name__ == "__main__":
    unittest.main()
