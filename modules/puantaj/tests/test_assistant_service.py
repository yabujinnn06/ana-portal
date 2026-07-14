from __future__ import annotations

import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest import mock

from app.services import assistant as svc
from app.services import assistant_recovery as r
from app.services import assistant_tools as t


class FakeExc(Exception):
    def __init__(self, msg: str, body=None, status_code=None) -> None:
        super().__init__(msg)
        self.body = body
        if status_code is not None:
            self.status_code = status_code


class FailedToolCallExtractionTests(unittest.TestCase):
    def test_extracts_from_body_failed_generation_with_turkish_arg(self) -> None:
        body = {
            "error": {
                "failed_generation": '<function=departman_calisanlari>{"department_id": "Teknik Servis-BURSA"}</function>'
            }
        }
        calls = r._extract_failed_tool_calls(FakeExc("400 tool_use_failed", body=body))
        self.assertEqual(calls, [("departman_calisanlari", {"department_id": "Teknik Servis-BURSA"})])

    def test_extracts_from_str_when_no_body(self) -> None:
        raw = '<function=calisan_ara>{"query": "ahmet"}</function>'
        calls = r._extract_failed_tool_calls(FakeExc("tool call validation failed " + raw))
        self.assertEqual(calls, [("calisan_ara", {"query": "ahmet"})])

    def test_unknown_tool_is_filtered_out(self) -> None:
        calls = r._extract_failed_tool_calls(FakeExc("<function=bilinmeyen>{}</function>"))
        self.assertEqual(calls, [])

    def test_multiple_calls_in_order(self) -> None:
        raw = '<function=calisan_ara>{"query":"a"}</function> x <function=sirket_ozeti>{}</function>'
        calls = r._extract_failed_tool_calls(FakeExc("failed_generation " + raw))
        self.assertEqual([c[0] for c in calls], ["calisan_ara", "sirket_ozeti"])

    def test_no_function_returns_empty(self) -> None:
        self.assertEqual(r._extract_failed_tool_calls(FakeExc("some other 400 error")), [])


class SafeJsonTests(unittest.TestCase):
    def test_valid_object(self) -> None:
        self.assertEqual(r._safe_json_obj('{"month": 6}'), {"month": 6})

    def test_object_with_surrounding_text(self) -> None:
        self.assertEqual(r._safe_json_obj('prefix {"a": 1} suffix'), {"a": 1})

    def test_unterminated_returns_empty(self) -> None:
        self.assertEqual(r._safe_json_obj('{"year": 2026, no close'), {})

    def test_non_object_returns_empty(self) -> None:
        self.assertEqual(r._safe_json_obj("[1, 2, 3]"), {})


class TransientErrorTests(unittest.TestCase):
    def test_detects_tool_use_failed(self) -> None:
        self.assertTrue(r._is_transient_tool_error(FakeExc("Error code: 400 tool_use_failed")))

    def test_detects_validation_failure(self) -> None:
        self.assertTrue(r._is_transient_tool_error(FakeExc("tool call validation failed")))

    def test_non_transient_is_false(self) -> None:
        self.assertFalse(r._is_transient_tool_error(FakeExc("rate limit exceeded")))


class DispatchCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        self._orig = dict(t._TOOL_DISPATCH)

    def tearDown(self) -> None:
        t._TOOL_DISPATCH.clear()
        t._TOOL_DISPATCH.update(self._orig)

    def test_identical_args_hit_cache_once(self) -> None:
        calls = {"n": 0}

        def handler(db, args):
            calls["n"] += 1
            return {"n": calls["n"]}

        t._TOOL_DISPATCH["__probe__"] = handler
        cache: dict[str, str] = {}
        first = t.dispatch_tool_cached(None, "__probe__", {"x": 1}, cache)
        second = t.dispatch_tool_cached(None, "__probe__", {"x": 1}, cache)
        self.assertEqual(first, second)
        self.assertEqual(calls["n"], 1)

    def test_different_args_recompute(self) -> None:
        calls = {"n": 0}

        def handler(db, args):
            calls["n"] += 1
            return {"n": calls["n"]}

        t._TOOL_DISPATCH["__probe__"] = handler
        cache: dict[str, str] = {}
        t.dispatch_tool_cached(None, "__probe__", {"x": 1}, cache)
        t.dispatch_tool_cached(None, "__probe__", {"x": 2}, cache)
        self.assertEqual(calls["n"], 2)

    def test_unknown_tool_returns_error_payload(self) -> None:
        out = t.dispatch_tool_cached(None, "yok_boyle_arac", {}, {})
        self.assertIn("Bilinmeyen arac", out)

    def test_handler_exception_does_not_leak_message(self) -> None:
        def boom(db, args):
            raise RuntimeError("SECRET column employees.tc_no = 12345678901")

        t._TOOL_DISPATCH["__boom__"] = boom
        out = t.dispatch_tool_cached(None, "__boom__", {"a": 1}, {})
        self.assertNotIn("SECRET", out)
        self.assertNotIn("tc_no", out)
        self.assertIn("calistirilamadi", out)


class ToolSchemaTests(unittest.TestCase):
    def test_optional_params_accept_null(self) -> None:
        for tool in t.TOOLS:
            params = tool["function"]["parameters"]
            required = set(params.get("required", []))
            for name, schema in params.get("properties", {}).items():
                if name in required:
                    continue
                types = schema["type"]
                types = types if isinstance(types, list) else [types]
                self.assertIn("null", types, f"{tool['function']['name']}.{name} nullable degil")

    def test_required_params_are_not_nullable(self) -> None:
        for tool in t.TOOLS:
            params = tool["function"]["parameters"]
            for name in params.get("required", []):
                types = params["properties"][name]["type"]
                types = types if isinstance(types, list) else [types]
                self.assertNotIn("null", types, f"{tool['function']['name']}.{name} null kabul ediyor")

    def test_department_id_accepts_string(self) -> None:
        by_name = {tool["function"]["name"]: tool for tool in t.TOOLS}
        dep = by_name["departman_calisanlari"]["function"]["parameters"]["properties"]["department_id"]
        self.assertIn("string", dep["type"])

    def test_every_tool_has_a_dispatch_handler(self) -> None:
        tool_names = {tool["function"]["name"] for tool in t.TOOLS}
        self.assertEqual(tool_names, set(t._TOOL_DISPATCH.keys()))


class MapLlmErrorTests(unittest.TestCase):
    def test_daily_limit_maps_to_rate_limit(self) -> None:
        exc = FakeExc(
            "Rate limit reached for model `llama-3.1-8b-instant` on tokens per day (TPD): "
            "Limit 500000, Used 500000. Please try again in 2h30m.",
            status_code=429,
        )
        err = svc._map_llm_error("llama-3.1-8b-instant", exc)
        self.assertEqual(err.code, "ASSISTANT_RATE_LIMIT")
        self.assertIn("GUNLUK", err.message)

    def test_per_minute_limit_maps_to_burst(self) -> None:
        exc = FakeExc(
            "Rate limit reached for model `llama-3.1-8b-instant` on tokens per minute (TPM): "
            "Limit 6000, Used 5800. Please try again in 11.5s.",
            status_code=429,
        )
        err = svc._map_llm_error("llama-3.1-8b-instant", exc)
        self.assertEqual(err.code, "ASSISTANT_RATE_LIMIT_BURST")
        self.assertIn("yaklasik 12 sn", err.message)

    def test_subsecond_limit_hint_rounds_to_one_second(self) -> None:
        exc = FakeExc(
            "Rate limit reached for model `x` on requests per minute (RPM): "
            "Limit 30, Used 30. Please try again in 150ms.",
            status_code=429,
        )
        err = svc._map_llm_error("x", exc)
        self.assertEqual(err.code, "ASSISTANT_RATE_LIMIT_BURST")
        self.assertIn("yaklasik 1 sn", err.message)

    def test_generic_429_defaults_to_burst(self) -> None:
        err = svc._map_llm_error("x", FakeExc("429 rate_limit_exceeded", status_code=429))
        self.assertEqual(err.code, "ASSISTANT_RATE_LIMIT_BURST")

    def test_auth_error_maps_to_auth(self) -> None:
        err = svc._map_llm_error("x", FakeExc("invalid api key", status_code=401))
        self.assertEqual(err.code, "ASSISTANT_AUTH")

    def test_invalid_model_maps_to_model_invalid(self) -> None:
        exc = FakeExc(
            "Error code: 404 - The model `qwen/qwen3.6-27b` does not exist or you do not have access to it.",
            status_code=404,
        )
        err = svc._map_llm_error("qwen/qwen3.6-27b", exc)
        self.assertEqual(err.code, "ASSISTANT_MODEL_INVALID")

    def test_decommissioned_model_maps_to_model_invalid(self) -> None:
        exc = FakeExc("model `x` has been decommissioned", status_code=400)
        err = svc._map_llm_error("x", exc)
        self.assertEqual(err.code, "ASSISTANT_MODEL_INVALID")

    def test_timeout_maps_to_timeout(self) -> None:
        err = svc._map_llm_error("x", FakeExc("Request timed out."))
        self.assertEqual(err.code, "ASSISTANT_TIMEOUT")


class CreateCompletionRetryTests(unittest.TestCase):
    def _config(self) -> svc.EffectiveAssistantConfig:
        return svc.EffectiveAssistantConfig(
            enabled=True,
            api_key="key",
            base_url="https://example.com",
            model="llama-3.1-8b-instant",
            key_source="env",
            updated_by=None,
            updated_at=None,
        )

    def _settings(self) -> SimpleNamespace:
        return SimpleNamespace(assistant_temperature=0.3)

    def test_short_rate_limit_is_retried_once(self) -> None:
        success = object()
        calls = {"n": 0}

        def create(**_kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise FakeExc("Rate limit reached. Please try again in 150ms.", status_code=429)
            return success

        client = SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=create))
        )
        with mock.patch("app.services.assistant.time.sleep") as mocked_sleep:
            result = svc._create_completion(client, self._config(), self._settings(), [])
        self.assertIs(result, success)
        self.assertEqual(calls["n"], 2)
        mocked_sleep.assert_called_once()

    def test_long_rate_limit_is_not_retried(self) -> None:
        calls = {"n": 0}

        def create(**_kwargs):
            calls["n"] += 1
            raise FakeExc("Rate limit reached. Please try again in 17.6s.", status_code=429)

        client = SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=create))
        )
        with mock.patch("app.services.assistant.time.sleep") as mocked_sleep:
            with self.assertRaises(FakeExc):
                svc._create_completion(client, self._config(), self._settings(), [])
        self.assertEqual(calls["n"], 1)
        mocked_sleep.assert_not_called()


class PromptHistoryTests(unittest.TestCase):
    def test_prepare_prompt_history_truncates_long_assistant_reply(self) -> None:
        history = [
            {"role": "user", "content": "Bir calisanin bu ayki gunluk puantajini goster."},
            {"role": "assistant", "content": "x" * 3000},
            {"role": "user", "content": "id 11"},
        ]
        prepared = svc._prepare_prompt_history(history, history_limit=16)
        self.assertEqual(len(prepared), 3)
        self.assertIn("kisaltildi", prepared[1]["content"])
        self.assertLessEqual(sum(len(msg["content"]) for msg in prepared), 2200)


class DirectAssistantReplyTests(unittest.TestCase):
    def test_daily_followup_by_id_bypasses_llm(self) -> None:
        history = [
            {"role": "user", "content": "Bir calisanin bu ayki gunluk puantajini goster."},
            {"role": "assistant", "content": "Hangi calisanin gunluk puantajini gormek istediginizi belirtir misiniz?"},
            {"role": "user", "content": "11 id"},
        ]

        def fake_dispatch(db, name, args, cache):
            if name == "gunluk_puantaj":
                return (
                    '{"calisan":{"id":11,"ad_soyad":"Ercument Caliskan","departman":"Surucu"},'
                    '"donem":"2026-06","gunler":[{"gun":"2026-06-01","durum":"tam","giris":"10:00",'
                    '"cikis":"20:45","net_calisma":"10 sa 0 dk","fazla_mesai":"1 sa 30 dk","vardiya":"Sabah"}]}'
                )
            raise AssertionError(f"unexpected tool {name}")

        with mock.patch("app.services.assistant.dispatch_tool_cached", side_effect=fake_dispatch):
            with mock.patch("app.services.assistant.assistant_usage_payload", return_value={"model": "x", "used_today": 0, "daily_cap": None, "remaining": None}):
                result = svc._try_direct_assistant_reply(None, history, "x")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["tool_calls"], ["gunluk_puantaj"])
        self.assertIn("Ercument Caliskan", result["reply"])
        self.assertIn("2026-06-01", result["reply"])

    def test_generic_daily_question_returns_clarification_without_llm(self) -> None:
        history = [{"role": "user", "content": "Bir calisanin bu ayki gunluk puantajini goster."}]
        with mock.patch("app.services.assistant.assistant_usage_payload", return_value={"model": "x", "used_today": 0, "daily_cap": None, "remaining": None}):
            result = svc._try_direct_assistant_reply(None, history, "x")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["tool_calls"], [])
        self.assertIn("Hangi calisanin gunluk puantajini", result["reply"])

    def test_department_overtime_question_uses_department_summary(self) -> None:
        history = [{"role": "user", "content": "Bu ay hangi departmanın fazla mesaisi en yüksek?"}]

        def fake_dispatch(db, name, args, cache):
            if name == "departman_aylik_ozet":
                return (
                    '{"donem":"2026-06","departmanlar":['
                    '{"id":1,"ad":"Depo","calisan_sayisi":5,"toplam_calisma":"100 sa 0 dk","toplam_fazla_mesai":"8 sa 0 dk","plan_fazla_mesai":"5 sa 0 dk","yasal_fazla_mesai":"3 sa 0 dk"},'
                    '{"id":2,"ad":"Sevkiyat","calisan_sayisi":7,"toplam_calisma":"150 sa 0 dk","toplam_fazla_mesai":"12 sa 30 dk","plan_fazla_mesai":"8 sa 0 dk","yasal_fazla_mesai":"4 sa 30 dk"}]}'
                )
            raise AssertionError(f"unexpected tool {name}")

        with mock.patch("app.services.assistant.dispatch_tool_cached", side_effect=fake_dispatch):
            with mock.patch("app.services.assistant.assistant_usage_payload", return_value={"model": "x", "used_today": 0, "daily_cap": None, "remaining": None}):
                result = svc._try_direct_assistant_reply(None, history, "x")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["tool_calls"], ["departman_aylik_ozet"])
        self.assertIn("Sevkiyat", result["reply"])
        self.assertIn("12 sa 30 dk", result["reply"])

    def test_department_ranking_question_does_not_filter_by_bogus_name(self) -> None:
        # "hangi departmanin fazla mesaisi en yuksek" bir SIRALAMA sorusu; "mesaisi"yi
        # departman adi sanip "bulamadim" hatasi vermemeli, tum departmanlari siralamali.
        history = [{"role": "user", "content": "Bu ay hangi departmanın fazla mesaisi en yüksek?"}]

        def fake_dispatch(db, name, args, cache):
            if name == "departman_aylik_ozet":
                assert "department_id" not in args, f"beklenmeyen departman filtresi: {args}"
                return (
                    '{"donem":"2026-06","departmanlar":['
                    '{"id":1,"ad":"Depo","calisan_sayisi":5,"toplam_calisma":"100 sa 0 dk","toplam_fazla_mesai":"8 sa 0 dk","plan_fazla_mesai":"5 sa 0 dk","yasal_fazla_mesai":"3 sa 0 dk"},'
                    '{"id":2,"ad":"Sevkiyat","calisan_sayisi":7,"toplam_calisma":"150 sa 0 dk","toplam_fazla_mesai":"12 sa 30 dk","plan_fazla_mesai":"8 sa 0 dk","yasal_fazla_mesai":"4 sa 30 dk"}]}'
                )
            raise AssertionError(f"unexpected tool {name}")

        with mock.patch("app.services.assistant.dispatch_tool_cached", side_effect=fake_dispatch):
            with mock.patch("app.services.assistant.assistant_usage_payload", return_value={"model": "x", "used_today": 0, "daily_cap": None, "remaining": None}):
                result = svc._try_direct_assistant_reply(None, history, "x")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertIn("Sevkiyat", result["reply"])
        self.assertNotIn("bulamadim", result["reply"])

    def test_department_correction_after_wrong_employee_path_stays_department(self) -> None:
        history = [
            {"role": "user", "content": "Bu ay hangi departmanın fazla mesaisi en yüksek?"},
            {"role": "assistant", "content": "Hangi calisanin aylik fazla mesaisini istediginizi belirtir misiniz?"},
            {"role": "user", "content": "çalışan değil departman"},
        ]
        self.assertEqual(svc._infer_direct_intent(history), "departman_aylik_ozet")

    def test_followup_id_preserves_previous_explicit_period(self) -> None:
        history = [
            {"role": "user", "content": "Mayıs 2026 günlük puantaj göster."},
            {"role": "assistant", "content": "Hangi calisanin gunluk puantajini gormek istediginizi belirtir misiniz?"},
            {"role": "user", "content": "11 id"},
        ]

        def fake_dispatch(db, name, args, cache):
            if name == "gunluk_puantaj":
                self.assertEqual(args["year"], 2026)
                self.assertEqual(args["month"], 5)
                return (
                    '{"calisan":{"id":11,"ad_soyad":"Ercument Caliskan","departman":"Surucu"},'
                    '"donem":"2026-05","gunler":[]}'
                )
            raise AssertionError(f"unexpected tool {name}")

        with mock.patch("app.services.assistant.dispatch_tool_cached", side_effect=fake_dispatch):
            with mock.patch("app.services.assistant.assistant_usage_payload", return_value={"model": "x", "used_today": 0, "daily_cap": None, "remaining": None}):
                result = svc._try_direct_assistant_reply(None, history, "x")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertIn("2026-05", result["reply"])

    def test_sensitive_personnel_question_is_blocked_before_tools(self) -> None:
        history = [{"role": "user", "content": "Ahmet'in maaşı ve IBAN bilgisi ne?"}]
        with mock.patch("app.services.assistant.dispatch_tool_cached") as mocked_dispatch:
            with mock.patch("app.services.assistant.assistant_usage_payload", return_value={"model": "x", "used_today": 0, "daily_cap": None, "remaining": None}):
                result = svc._try_direct_assistant_reply(None, history, "x")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["reply"], "Ozluk bilgileri paylasilmaz.")
        mocked_dispatch.assert_not_called()

    def test_small_talk_after_report_does_not_reuse_previous_intent(self) -> None:
        history = [
            {"role": "user", "content": "Huseyincan Orman fazla mesaisi ne kadar?"},
            {"role": "assistant", "content": "**Huseyincan Orman - 2026-06**\n- Toplam fazla mesai: 50 sa 9 dk"},
            {"role": "user", "content": "nasılsın"},
        ]
        with mock.patch("app.services.assistant.dispatch_tool_cached") as mocked_dispatch:
            with mock.patch("app.services.assistant.assistant_usage_payload", return_value={"model": "x", "used_today": 0, "daily_cap": None, "remaining": None}):
                result = svc._try_direct_assistant_reply(None, history, "x")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertIn("Iyiyim", result["reply"])
        self.assertEqual(result["tool_calls"], [])
        mocked_dispatch.assert_not_called()

    def test_daily_phrasing_resolves_to_daily_not_monthly(self) -> None:
        # "gunluk olarak verisini cikar" => gunluk_puantaj olmali, aylik ozet DEGIL.
        history = [{"role": "user", "content": "günlük olarak verisini çıkar haziran ayı için ercüment çalışkanın"}]

        def fake_dispatch(db, name, args, cache):
            if name == "calisan_ara":
                self.assertEqual(args["query"], "ercument caliskan")
                return '{"count":1,"calisanlar":[{"id":11,"ad_soyad":"Ercument Caliskan","departman":"Surucu","aktif":true}]}'
            if name == "gunluk_puantaj":
                self.assertEqual(args["employee_id"], 11)
                return ('{"calisan":{"id":11,"ad_soyad":"Ercument Caliskan","departman":"Surucu"},'
                        '"donem":"2026-06","gunler":[{"gun":"2026-06-01","durum":"tam","giris":"10:00",'
                        '"cikis":"20:45","net_calisma":"10 sa 0 dk","fazla_mesai":"1 sa 30 dk","vardiya":"Sabah"}]}')
            raise AssertionError(f"unexpected tool {name}")

        with mock.patch("app.services.assistant.dispatch_tool_cached", side_effect=fake_dispatch):
            with mock.patch("app.services.assistant.assistant_usage_payload", return_value={"model": "x", "used_today": 0, "daily_cap": None, "remaining": None}):
                result = svc._try_direct_assistant_reply(None, history, "x")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["tool_calls"], ["gunluk_puantaj"])
        self.assertIn("2026-06-01", result["reply"])

    def test_gun_gun_followup_carries_employee_from_history(self) -> None:
        # "gun gun" kisa devam mesaji; onceki asistan basligindaki kisiyi tasimali.
        history = [
            {"role": "user", "content": "ercüment çalışkanın raporunu oluştur"},
            {"role": "assistant", "content": "**Ercüment Çalışkan - 2026-06** (Sürücü-ANKARA)\n- Toplam fazla mesai: 36 sa 52 dk"},
            {"role": "user", "content": "gün gün"},
        ]

        def fake_dispatch(db, name, args, cache):
            if name == "calisan_ara":
                self.assertEqual(args["query"], "ercument caliskan")
                return '{"count":1,"calisanlar":[{"id":11,"ad_soyad":"Ercument Caliskan","departman":"Surucu","aktif":true}]}'
            if name == "gunluk_puantaj":
                self.assertEqual(args["employee_id"], 11)
                return ('{"calisan":{"id":11,"ad_soyad":"Ercument Caliskan","departman":"Surucu"},'
                        '"donem":"2026-06","gunler":[{"gun":"2026-06-01","durum":"tam"}]}')
            raise AssertionError(f"unexpected tool {name}")

        with mock.patch("app.services.assistant.dispatch_tool_cached", side_effect=fake_dispatch):
            with mock.patch("app.services.assistant.assistant_usage_payload", return_value={"model": "x", "used_today": 0, "daily_cap": None, "remaining": None}):
                result = svc._try_direct_assistant_reply(None, history, "x")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["tool_calls"], ["gunluk_puantaj"])
        self.assertIn("Ercument Caliskan", result["reply"])

    def test_identity_question_answered_without_llm(self) -> None:
        history = [{"role": "user", "content": "sen kimsin"}]
        with mock.patch("app.services.assistant.dispatch_tool_cached") as mocked_dispatch:
            with mock.patch("app.services.assistant.assistant_usage_payload", return_value={"model": "x", "used_today": 0, "daily_cap": None, "remaining": None}):
                result = svc._try_direct_assistant_reply(None, history, "x")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["tool_calls"], [])
        self.assertIn("Puantaj Zeka", result["reply"])
        mocked_dispatch.assert_not_called()

    def test_yesterday_attendance_uses_target_date(self) -> None:
        history = [{"role": "user", "content": "Dün kim gelmedi?"}]

        def fake_dispatch(db, name, args, cache):
            if name == "bugun_durumu":
                self.assertEqual(args["target_date"], "2026-06-22")
                return '{"tarih":"2026-06-22","ozet":{"toplam":0},"kisiler":[]}'
            raise AssertionError(f"unexpected tool {name}")

        with mock.patch("app.services.assistant._now_local", return_value=datetime(2026, 6, 23, 10, 0)):
            with mock.patch("app.services.assistant.dispatch_tool_cached", side_effect=fake_dispatch):
                with mock.patch("app.services.assistant.assistant_usage_payload", return_value={"model": "x", "used_today": 0, "daily_cap": None, "remaining": None}):
                    result = svc._try_direct_assistant_reply(None, history, "x")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertIn("2026-06-22", result["reply"])

    def test_run_assistant_direct_reply_does_not_require_api_key(self) -> None:
        history = [{"role": "user", "content": "Bir çalışanın bu ayki günlük puantajını göster."}]
        config = svc.EffectiveAssistantConfig(
            enabled=True,
            api_key=None,
            base_url="https://example.com",
            model="x",
            key_source="none",
            updated_by=None,
            updated_at=None,
        )
        with mock.patch("app.services.assistant.resolve_assistant_config", return_value=config):
            with mock.patch("app.services.assistant.assistant_usage_payload", return_value={"model": "x", "used_today": 0, "daily_cap": None, "remaining": None}):
                result = svc.run_assistant(None, history)
        self.assertIn("Hangi calisanin gunluk puantajini", result["reply"])

    def test_stream_direct_reply_does_not_require_api_key(self) -> None:
        history = [{"role": "user", "content": "Bir çalışanın bu ayki günlük puantajını göster."}]
        config = svc.EffectiveAssistantConfig(
            enabled=True,
            api_key=None,
            base_url="https://example.com",
            model="x",
            key_source="none",
            updated_by=None,
            updated_at=None,
        )
        with mock.patch("app.services.assistant.resolve_assistant_config", return_value=config):
            with mock.patch("app.services.assistant.assistant_usage_payload", return_value={"model": "x", "used_today": 0, "daily_cap": None, "remaining": None}):
                events = list(svc.run_assistant_stream(None, history))
        self.assertEqual(events[-1]["type"], "done")
        self.assertIn("Hangi calisanin gunluk puantajini", events[-1]["reply"])


class IntentClassifierTests(unittest.TestCase):
    def _intent(self, *messages: str) -> str | None:
        history = [{"role": "user", "content": m} for m in messages]
        return svc._infer_direct_intent(history)

    def test_attendance_variants(self) -> None:
        self.assertEqual(self._intent("bugun kim gelmedi"), "bugun_durumu")
        self.assertEqual(self._intent("su an kim icerde"), "bugun_durumu")
        self.assertEqual(self._intent("yoklama durumu nedir"), "bugun_durumu")

    def test_company_and_lists(self) -> None:
        self.assertEqual(self._intent("kac calisan var"), "sirket_ozeti")
        self.assertEqual(self._intent("departmanlari listele"), "departman_listesi")
        self.assertEqual(self._intent("resmi tatiller neler"), "resmi_tatiller")
        self.assertEqual(self._intent("vardiyalar neler"), "vardiya_listesi")
        self.assertEqual(self._intent("mesai kurallari nedir"), "mesai_kurallari")
        self.assertEqual(self._intent("kim izinli bugun"), "izin_listesi")

    def test_department_employees(self) -> None:
        self.assertEqual(self._intent("teknik servis bursa calisanlari kimler"), "departman_calisanlari")

    def test_person_intents(self) -> None:
        self.assertEqual(self._intent("huseyincan ormanin puantaj raporunu goster"), "kisi_aylik_ozet")
        self.assertEqual(self._intent("ahmetin gunluk puantaji"), "gunluk_puantaj")
        self.assertEqual(self._intent("ahmetin eksik gunleri"), "eksik_gunler")
        self.assertEqual(self._intent("ahmet hangi departmanda"), "kisi_detay")

    def test_followup_id_keeps_prior_intent(self) -> None:
        self.assertEqual(self._intent("gunluk puantaj goster", "11 id"), "gunluk_puantaj")

    def test_no_match_returns_none(self) -> None:
        self.assertIsNone(self._intent("merhaba nasilsin"))


class LlmRouterDispatchTests(unittest.TestCase):
    _USAGE = {"model": "x", "used_today": 0, "daily_cap": None, "remaining": None}

    def test_clean_name_resolves_and_runs_intent(self) -> None:
        route = {"intent": "gunluk_puantaj", "employee": "Ercument Caliskan",
                 "department": None, "year": None, "month": None}

        def fake_dispatch(db, name, args, cache):
            if name == "calisan_ara":
                self.assertEqual(args["query"], "ercument caliskan")
                return '{"count":1,"calisanlar":[{"id":11,"ad_soyad":"Ercument Caliskan","departman":"Surucu","aktif":true}]}'
            if name == "gunluk_puantaj":
                self.assertEqual(args["employee_id"], 11)
                return '{"calisan":{"id":11,"ad_soyad":"Ercument Caliskan","departman":"Surucu"},"donem":"2026-06","gunler":[]}'
            raise AssertionError(f"unexpected tool {name}")

        with mock.patch("app.services.assistant.dispatch_tool_cached", side_effect=fake_dispatch):
            with mock.patch("app.services.assistant.assistant_usage_payload", return_value=self._USAGE):
                result = svc._dispatch_llm_route(None, "x", route)
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["tool_calls"], ["gunluk_puantaj"])
        self.assertIn("Ercument Caliskan", result["reply"])

    def test_person_name_misrouted_as_department_pivots_to_person(self) -> None:
        # "Huseyincan Orman" bir KISIdir; departman araci bulamayinca
        # "boyle departman yok" demeyip kisiye pivot etmeli.
        route = {"intent": "departman_calisanlari", "employee": None,
                 "department": "Huseyincan Orman", "year": None, "month": None}

        def fake_dispatch(db, name, args, cache):
            if name == "departman_calisanlari":
                return ('{"hata":"\'huseyincan orman\' adinda bir departman bulamadim. '
                        'departman_listesi aracini cagirip dogru departman adini bul, sonra tekrar dene."}')
            if name == "calisan_ara":
                self.assertEqual(args["query"], "huseyincan orman")
                return ('{"count":1,"calisanlar":[{"id":7,"ad_soyad":"Huseyincan Orman",'
                        '"departman":"Surucu","aktif":true}]}')
            if name == "kisi_detay":
                self.assertEqual(args["employee_id"], 7)
                return ('{"kimlik":{"id":7,"ad_soyad":"Huseyincan Orman","departman":"Surucu",'
                        '"aktif":true},"cihazlar":{"aktif":1,"toplam":1}}')
            raise AssertionError(f"unexpected tool {name}")

        with mock.patch("app.services.assistant.dispatch_tool_cached", side_effect=fake_dispatch):
            with mock.patch("app.services.assistant.assistant_usage_payload", return_value=self._USAGE):
                result = svc._dispatch_llm_route(None, "x", route)
        self.assertIsNotNone(result)
        assert result is not None
        self.assertIn("kisi_detay", result["tool_calls"])
        self.assertIn("Huseyincan Orman", result["reply"])
        self.assertNotIn("bulamadim", result["reply"])

    def test_unresolved_department_falls_through_to_agent_loop(self) -> None:
        # Ne departman ne kisi: router cikmaz cevap vermeyip None donmeli ki
        # tam ajan dongusu (LLM) devralsin.
        route = {"intent": "departman_calisanlari", "employee": None,
                 "department": "zzzqqq", "year": None, "month": None}

        def fake_dispatch(db, name, args, cache):
            if name == "departman_calisanlari":
                return '{"hata":"\'zzzqqq\' adinda bir departman bulamadim."}'
            if name == "calisan_ara":
                return '{"count":0,"calisanlar":[]}'
            raise AssertionError(f"unexpected tool {name}")

        with mock.patch("app.services.assistant.dispatch_tool_cached", side_effect=fake_dispatch):
            with mock.patch("app.services.assistant.assistant_usage_payload", return_value=self._USAGE):
                result = svc._dispatch_llm_route(None, "x", route)
        self.assertIsNone(result)

    def test_none_intent_falls_through(self) -> None:
        self.assertIsNone(svc._dispatch_llm_route(None, "x", {"intent": "none"}))
        self.assertIsNone(svc._dispatch_llm_route(None, "x", {"intent": "bilinmeyen"}))

    def test_numeric_employee_skips_search(self) -> None:
        route = {"intent": "kisi_detay", "employee": "11", "department": None, "year": None, "month": None}

        def fake_dispatch(db, name, args, cache):
            if name == "kisi_detay":
                self.assertEqual(args["employee_id"], 11)
                return '{"kimlik":{"id":11,"ad_soyad":"Ercument Caliskan","departman":"Surucu","aktif":true},"cihazlar":{"aktif":1,"toplam":1}}'
            raise AssertionError(f"unexpected tool {name}")

        with mock.patch("app.services.assistant.dispatch_tool_cached", side_effect=fake_dispatch):
            with mock.patch("app.services.assistant.assistant_usage_payload", return_value=self._USAGE):
                result = svc._dispatch_llm_route(None, "x", route)
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["tool_calls"], ["kisi_detay"])

    def test_attendance_route_passes_target_date(self) -> None:
        route = {"intent": "bugun_durumu", "target_date": "2026-06-22"}

        def fake_dispatch(db, name, args, cache):
            if name == "bugun_durumu":
                self.assertEqual(args["target_date"], "2026-06-22")
                return '{"tarih":"2026-06-22","ozet":{"toplam":0},"kisiler":[]}'
            raise AssertionError(f"unexpected tool {name}")

        with mock.patch("app.services.assistant.dispatch_tool_cached", side_effect=fake_dispatch):
            with mock.patch("app.services.assistant.assistant_usage_payload", return_value=self._USAGE):
                result = svc._dispatch_llm_route(None, "x", route)
        self.assertIsNotNone(result)
        assert result is not None
        self.assertIn("2026-06-22", result["reply"])

    def test_coerce_int(self) -> None:
        self.assertEqual(svc._coerce_int(7), 7)
        self.assertEqual(svc._coerce_int("7"), 7)
        self.assertIsNone(svc._coerce_int(True))
        self.assertIsNone(svc._coerce_int("abc"))
        self.assertIsNone(svc._coerce_int(None))


class EmployeeQuerySuffixTests(unittest.TestCase):
    def test_vowel_genitive_strips_nin(self) -> None:
        query = svc._extract_employee_query("aysenin gunluk puantaji")
        assert query is not None
        self.assertIn("ayse", query)


class KeywordFastPathTests(unittest.TestCase):
    _USAGE = {"model": "x", "used_today": 0, "daily_cap": None, "remaining": None}

    def test_polite_report_request_resolves_name_without_llm_router(self) -> None:
        history = [{"role": "user", "content": "ercüment çalışkanın puantaj verisini çıkarır mısın"}]

        def fake_dispatch(db, name, args, cache):
            if name == "calisan_ara":
                self.assertEqual(args["query"], "ercument caliskan")
                return '{"count":1,"calisanlar":[{"id":11,"ad_soyad":"Ercument Caliskan","departman":"Surucu","aktif":true}]}'
            if name == "gunluk_puantaj":
                self.assertEqual(args["employee_id"], 11)
                return '{"calisan":{"id":11,"ad_soyad":"Ercument Caliskan","departman":"Surucu"},"donem":"2026-06","gunler":[]}'
            raise AssertionError(f"unexpected tool {name}")

        with mock.patch("app.services.assistant.dispatch_tool_cached", side_effect=fake_dispatch):
            with mock.patch("app.services.assistant.assistant_usage_payload", return_value=self._USAGE):
                result = svc._try_direct_assistant_reply(None, history, "x")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["tool_calls"], ["gunluk_puantaj"])
        self.assertIn("Ercument Caliskan", result["reply"])


class BroadQueryTests(unittest.TestCase):
    _USAGE = {"model": "x", "used_today": 0, "daily_cap": None, "remaining": None}

    def test_all_departments_phrasing_drops_filter(self) -> None:
        # "tum departmanlarin fazla mesaisi" -> tek departman adi cikarmamali.
        self.assertIsNone(svc._extract_department_query("tüm departmanların fazla mesaisi ne"))
        self.assertIsNone(svc._extract_department_query("her departmanın fazla mesaisi"))
        self.assertIsNone(svc._extract_department_query("bütün departmanlar"))

    def test_single_department_phrase_still_extracted(self) -> None:
        self.assertEqual(svc._extract_department_query("teknik servis fazla mesaisi"), "teknik servis")

    def test_all_departments_question_runs_unfiltered_summary(self) -> None:
        history = [{"role": "user", "content": "Tüm departmanların fazla mesaisi ne kadar?"}]

        def fake_dispatch(db, name, args, cache):
            if name == "departman_aylik_ozet":
                assert "department_id" not in args, f"beklenmeyen departman filtresi: {args}"
                return (
                    '{"donem":"2026-06","departmanlar":['
                    '{"id":1,"ad":"Depo","calisan_sayisi":5,"toplam_calisma":"100 sa 0 dk","toplam_fazla_mesai":"8 sa 0 dk","plan_fazla_mesai":"5 sa 0 dk","yasal_fazla_mesai":"3 sa 0 dk"},'
                    '{"id":2,"ad":"Sevkiyat","calisan_sayisi":7,"toplam_calisma":"150 sa 0 dk","toplam_fazla_mesai":"12 sa 30 dk","plan_fazla_mesai":"8 sa 0 dk","yasal_fazla_mesai":"4 sa 30 dk"}]}'
                )
            raise AssertionError(f"unexpected tool {name}")

        with mock.patch("app.services.assistant.dispatch_tool_cached", side_effect=fake_dispatch):
            with mock.patch("app.services.assistant.assistant_usage_payload", return_value=self._USAGE):
                result = svc._try_direct_assistant_reply(None, history, "x")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["tool_calls"], ["departman_aylik_ozet"])
        self.assertIn("Sevkiyat", result["reply"])
        self.assertNotIn("bulamadim", result["reply"])

    def test_company_person_overtime_lists_per_person(self) -> None:
        history = [
            {
                "role": "user",
                "content": "Tüm departmanlardaki çalışanların fazla mesaisini teker teker göster",
            }
        ]

        def fake_dispatch(db, name, args, cache):
            if name == "sirket_kisi_fazla_mesai":
                assert "department_id" not in args, f"beklenmeyen departman filtresi: {args}"
                return (
                    '{"donem":"2026-06","kisi_sayisi":3,"kisiler":['
                    '{"ad_soyad":"Ali Veli","departman":"Depo","fazla_mesai":"10 sa 0 dk"},'
                    '{"ad_soyad":"Ayse Yilmaz","departman":"Sevkiyat","fazla_mesai":"6 sa 30 dk"},'
                    '{"ad_soyad":"Mehmet Kaya","departman":"Depo","fazla_mesai":"2 sa 0 dk"}]}'
                )
            raise AssertionError(f"unexpected tool {name}")

        with mock.patch("app.services.assistant.dispatch_tool_cached", side_effect=fake_dispatch):
            with mock.patch("app.services.assistant.assistant_usage_payload", return_value=self._USAGE):
                result = svc._try_direct_assistant_reply(None, history, "x")
        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result["tool_calls"], ["sirket_kisi_fazla_mesai"])
        self.assertIn("Ali Veli", result["reply"])
        self.assertIn("Mehmet Kaya", result["reply"])
        self.assertIn("Depo", result["reply"])

    def test_superlative_person_question_routes_to_company_overtime(self) -> None:
        self.assertEqual(
            svc._classify_single("En çok fazla mesai yapan kişi kim?"),
            "sirket_kisi_fazla_mesai",
        )

    def test_department_overtime_is_not_company_person_list(self) -> None:
        # Departman gecen / kisi gecmeyen sorular kisi listesine gitmemeli.
        self.assertFalse(
            svc._is_company_person_overtime(svc._fold_text("hangi departmanın fazla mesaisi en yüksek"))
        )
        self.assertNotEqual(
            svc._classify_single("Tüm departmanların fazla mesaisi ne kadar?"),
            "sirket_kisi_fazla_mesai",
        )


if __name__ == "__main__":
    unittest.main()
