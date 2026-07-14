# Güvenlik politikası

## Uygulanan kontroller

- Argon2 parola özeti
- 15 dakikalık imzalı erişim anahtarı
- Kullanıcı `token_version` ile toplu oturum iptali altyapısı
- Şirket + üyelik + özel alan adı eşleştirmesi
- IP/şirket/e-posta bazlı başarısız giriş sınırı
- Rol tabanlı yönetici işlemleri
- Modül ve domain değişiklikleri için güvenlik olay kaydı
- Portal–Puantaj arasında hash olarak saklanan, tek kullanımlık ve kısa ömürlü geçiş bileti
- Hassas Puantaj/İK verisinin portal veritabanından fiziksel ayrımı
- Portal ve Puantaj için birbirinden farklı JWT ve veritabanı sırları
- Dinamik güvenilir host kontrolü
- CSP, HSTS, frame, MIME ve referrer güvenlik başlıkları
- Üretimde SQLite, zayıf JWT, wildcard host/CORS ve otomatik şema oluşturma yasağı

## Sır yönetimi

Gerçek anahtar ve parolalar Git deposuna yazılmamalıdır. Üretimde Docker secrets, Vault veya bulut sağlayıcısının secret manager servisi kullanılmalıdır.

## Açık bildirme

Güvenlik açığını herkese açık issue olarak paylaşmayın. Şirketin belirlediği özel güvenlik iletişim kanalına; etkilenen sürüm, tekrar adımları ve olası etkiyle birlikte iletin.
