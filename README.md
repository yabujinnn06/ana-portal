# Rainwater Ana Portal

Rainwater Ana Portal; şirketlerin ihtiyaç duyduğu uygulamaları paket veya modül bazında açabildiği, çok kiracılı ve self-host destekli SaaS platformudur. Arayüz, Puantaj MVP’deki Rainwater kurumsal tasarım dili temel alınarak sabitlenmiştir; kullanıcı bazlı tema değişimi yoktur.

## Yeni temel

- Şirket, kullanıcı üyeliği ve rol tabanlı erişim
- Paketler, modül fiyatları ve şirket bazlı yetkilendirme
- Argon2 parola güvenliği ve kısa ömürlü JWT oturumları
- Başarısız giriş sınırı ve güvenlik olay kayıtları
- Doğrulanmış özel alan adının şirkete bağlanması
- PostgreSQL ve Alembic üretim veritabanı modeli
- Docker Compose ile bulut veya şirket sunucusunda kurulum
- Caddy ile otomatik TLS ve ters proxy
- Portal içinden tek tıkla açılan tam Puantaj, çalışan PWA ve depo uygulaması
- Tek kullanımlık, 60 saniyelik portal → modül geçiş bileti
- Puantaj için ayrı PostgreSQL ve ayrı servis sınırı
- Eski, kiracı izolasyonu bulunmayan depo uçları varsayılan olarak kapalı

## Yerel geliştirme

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:BOOTSTRAP_TENANT_SLUG="rainwater"
$env:BOOTSTRAP_TENANT_NAME="Rainwater"
$env:BOOTSTRAP_ADMIN_EMAIL="admin@example.com"
$env:BOOTSTRAP_ADMIN_PASSWORD="Change-This-Strong-Password"
uvicorn app.main:app --reload --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Portal: `http://localhost:5173`
API dokümanı (yalnızca geliştirme): `http://localhost:8000/api/docs`

## Kontroller

```powershell
cd backend
python -m pytest -q

cd ..\frontend
npm run build

cd ..\modules\puantaj
$env:JWT_SECRET="test-secret-at-least-thirty-two-characters-long"
python -m pytest -q
```

Üretim ve şirket sunucusu kurulumu için [DEPLOYMENT.md](DEPLOYMENT.md) dosyasını izleyin.
Ürün ve servis sınırları için [STARTUP_ARCHITECTURE.md](STARTUP_ARCHITECTURE.md) dosyasına bakın.
