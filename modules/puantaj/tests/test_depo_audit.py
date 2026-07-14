from __future__ import annotations

import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models import Base, DepoAuditLog
from app.services.depo_audit import audit


class DepoAuditCommitTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=[DepoAuditLog.__table__])
        self.db = Session(self.engine)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_audit_kendini_commitler(self):
        audit(self.db, "test_eylem", kaynak_tip="test", kaynak_id=1, detay={"k": "v"})
        self.db.rollback()
        kayitlar = self.db.query(DepoAuditLog).all()
        self.assertEqual(len(kayitlar), 1)
        self.assertEqual(kayitlar[0].eylem, "test_eylem")


if __name__ == "__main__":
    unittest.main()
