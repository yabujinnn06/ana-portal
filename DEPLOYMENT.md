# Rainwater Portal dağıtım rehberi

Portal Render’a bağlı değildir. Docker çalıştırabilen bir Linux sunucuda, özel bulutta veya şirket içi sunucuda aynı paketle kurulabilir.

## Mimari

İnternet/şirket ağı → Caddy (TLS) → Ana Portal + Puantaj servisi → Ayrı PostgreSQL veritabanları

- `gateway`: Alan adı, HTTPS ve ters proxy
- `frontend`: Derlenmiş sabit portal arayüzü
- `backend`: Kimlik, kiracı, abonelik, modül ve domain API’si
- `postgres`: Kalıcı şirket/platform verisi; dış ağa açılmaz
- `puantaj`: Yönetici paneli, çalışan PWA, depo, özlük, izin ve bordro servisleri
- `puantaj-postgres`: Hassas İK ve puantaj verisi; portal verisinden fiziksel olarak ayrıdır

## Gereksinimler

- Linux sunucu (öneri: 4 vCPU, 8 GB RAM)
- Docker Engine ve Docker Compose
- Sunucunun 80 ve 443 portlarına erişim
- Alan adının A/AAAA kaydının sunucuya yönlendirilmesi
- Günlük şifreli PostgreSQL yedeği için ayrı depolama

## Kurulum

1. Örnek ortam dosyasını kopyalayın:

   ```bash
   cp .env.example .env
   ```

2. `.env` içinde aşağıdaki değerleri mutlaka değiştirin:

   - `POSTGRES_PASSWORD`: En az 24 karakter rastgele parola
   - `JWT_SECRET`: En az 48 karakter rastgele anahtar
   - `MODULE_BRIDGE_SECRET`: Portal–Puantaj geçişinde kullanılan ayrı, en az 48 karakter anahtar
   - `PUANTAJ_POSTGRES_PASSWORD`: Portal veritabanı parolasından farklı parola
   - `PUANTAJ_JWT_SECRET`: Portal JWT anahtarından farklı, en az 48 karakter anahtar
   - `PORTAL_ORIGIN`, `TRUSTED_HOSTS`, `PLATFORM_HOSTS`
   - `PUANTAJ_WEBAUTHN_RP_ID`: Şemasız ana alan adı; ör. `portal.example.com`
   - İlk kurulumdaki şirket ve yönetici bilgileri

3. Servisleri başlatın:

   ```bash
   docker compose up -d --build
   ```

Ana Portal ve Puantaj açılırken kendi Alembic geçişlerini kendi veritabanlarına uygular. Şemalar üretimde uygulama tarafından otomatik oluşturulmaz.

4. Sağlığı kontrol edin:

   ```bash
   curl https://portal.example.com/health
   docker compose ps
   ```

İlk başarılı kurulumdan sonra `BOOTSTRAP_*` değerlerini ortam dosyasından kaldırın ve servisleri yeniden başlatın. Mevcut şirket veya kullanıcı silinmez.

Portalda **Uygulamalar → Puantaj → Uygulamaya git** seçildiğinde URL’de oturum anahtarı taşınmaz. Portal 60 saniyelik, tek kullanımlık bir geçiş bileti üretir; Puantaj bileti iç ağ üzerinden doğrular ve kendi HttpOnly oturumunu açar.

## Müşteri özel alan adı

1. Şirket yöneticisi portalda **Alan Adları** bölümüne adresi ekler.
2. Portalın verdiği `_rainwater-verification` TXT kaydı müşterinin DNS’ine eklenir.
3. Doğrulama çağrısı TXT değerini karşılaştırır ve alan adını şirkete bağlar.
4. İlk HTTPS isteğinde Caddy, iç ağdaki izin ucuna domaini sorar. Yalnızca veritabanında doğrulanmış domain için sertifika üretir ve TLS’i otomatik etkinleştirir.

Rastgele bir `Host` başlığı kabul edilmez. Yalnızca platform adresleri veya veritabanında doğrulanmış müşteri alan adları çalışır.

## Üretim güvenliği

- PostgreSQL portunu internete açmayın.
- `.env` dosyasını kaynak kontrolüne eklemeyin.
- Yönetici parolalarını parola kasasında saklayın.
- TLS sonlandıran proxy dışında backend portunu yayınlamayın.
- `FORWARDED_ALLOW_IPS` değerini yalnızca kullandığınız proxy ağıyla sınırlandırın.
- PostgreSQL yedeklerini her gün alın ve geri yükleme testini düzenli yapın.
- Uygulama ve container imajlarını düzenli güncelleyin.
- Merkezi log/SIEM sistemine `security_audit_events` kayıtlarını aktarın.

## Ölçekleme

Portal backend’i durumsuzdur; aynı JWT anahtarı ve PostgreSQL bağlantısıyla birden fazla kopya çalıştırılabilir. Puantaj bildirim işçisi nedeniyle Puantaj servisini varsayılan pakette tek kopya çalıştırın. Büyük kurulumlarda:

- PostgreSQL’i yönetilen/yüksek erişilebilir servise taşıyın.
- Rate limit ve kısa süreli cache için Redis ekleyin.
- Bildirim işçisini ayrı worker servisine ayırmadan Puantaj web kopya sayısını artırmayın.
- Dosya/rapor çıktıları için S3 uyumlu nesne depolama kullanın.
- Caddy yerine mevcut kurumsal ingress veya load balancer kullanılabilir.

## Güncelleme

```bash
git pull
docker compose build
docker compose up -d
```

Her sürüm öncesinde iki veritabanının da yedeğini alın. Portal geçişleri `backend/migrations`, Puantaj geçişleri `modules/puantaj/app/migrations` altında sürümlenir.
