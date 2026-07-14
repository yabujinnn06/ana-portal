# Rainwater ürün mimarisi

## Ürün sınırı

Rainwater Ana Portal kontrol düzlemidir: şirket, kullanıcı, abonelik, fiyat, modül lisansı, alan adı ve güvenlik olaylarını yönetir. Puantaj ilk iş modülüdür: çalışan, vardiya, giriş-çıkış, izin, özlük, bordro, bildirim ve depo akışlarını yürütür.

Bu ayrım bilinçlidir. İK ve bordro tabloları portal veritabanına karıştırılmaz. Böylece müşteri başına ayrılmış kurulum, şirket sunucusunda çalışma, veri bölgesi seçimi ve modülün bağımsız ölçeklenmesi mümkün olur.

## Çalışan parçalar

| Parça | Sorumluluk | Veri |
|---|---|---|
| Ana Portal arayüzü | Şirket yöneticisinin ortak çalışma alanı | API üzerinden |
| Portal backend | Kimlik, tenant, RBAC, lisans, fiyat, domain, SSO bileti | Portal PostgreSQL |
| Puantaj | Yönetici paneli, çalışan PWA, depo ve İK operasyonları | Puantaj PostgreSQL |
| Caddy | TLS, özel domain ve servis yönlendirmesi | Kalıcı sertifika alanı |

## Güvenli modül açılışı

1. Yönetici portal oturumuyla Puantaj’ı açar.
2. Portal, yalnızca etkin lisans ve aktif kurulum için 60 saniyelik rastgele bilet üretir.
3. Veritabanına biletin kendisi değil SHA-256 özeti yazılır.
4. Tarayıcı bileti POST formuyla Puantaj’a verir; URL ve erişim loglarına girmez.
5. Puantaj bileti yalnızca iç ağdaki kontrol düzleminden ve ortak servis sırrıyla doğrular.
6. Bilet atomik olarak tüketilir; ikinci kullanım reddedilir.
7. Puantaj kendi kısa ömürlü erişim ve yenileme çerezlerini oluşturur.

## SaaS ve şirket sunucusu

Mevcut paket iki çalışma biçimini destekler:

- Yönetilen SaaS: Rainwater altyapısında şirket başına Puantaj servisi/veritabanı veya seçilen izolasyon politikası.
- Self-host: Aynı Docker Compose paketi müşterinin Linux sunucusunda ve kendi alan adında.

Portalın `tenant_module_deployments` kaydı, bir modülün hangi şirkete, hangi adreste ve hangi dağıtım biçiminde bağlı olduğunu tutar. Bu temel; ileride otomatik tenant provisioning, bölgesel kurulum ve ayrı müşteri kümelerine genişleyebilir.

## Üretim ilkeleri

- Modül erişimi abonelik ve rol kontrolünden geçmeden açılamaz.
- Portal ve Puantaj sırları birbirinden farklıdır.
- Veritabanları internete açılmaz.
- Her iki veritabanı ayrı yedeklenir ve geri yükleme tatbikatı yapılır.
- Puantaj bildirim işçisi ayrılana kadar servis tek kopya çalıştırılır.
- Dosya arşivleri büyüdüğünde S3 uyumlu nesne depolamaya taşınır.
- Çoklu web kopyası öncesinde rate limit ve geçici durum Redis’e taşınır.
