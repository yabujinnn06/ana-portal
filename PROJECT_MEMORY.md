# Rainwater Ana Portal — Proje Hafızası

Son güncelleme: 13 Temmuz 2026

Bu dosya, Rainwater Ana Portal üzerinde alınan ürün kararlarını ve çalışan yerel mimariyi sonraki geliştirme oturumlarında kaybetmemek için tutulur. Kimlik bilgileri, parolalar ve imzalama anahtarları bilinçli olarak bu dosyaya yazılmaz.

## Ürün yönü

- Ürün yerel geliştirme öncelikli ilerliyor. Kullanıcı açıkça istemeden Render veya başka bir barındırma ortamına taşınmayacak.
- Ana portal yalnızca bir yönetim panosu değil, şirket uygulamalarının tek oturumla çalıştığı masaüstü benzeri bir çalışma ortamıdır.
- Güncel kabuk adı: **Rainwater One**.
- Görsel ve etkileşim dili herhangi bir Linux dağıtımını veya Windows sürümünü taklit etmez; Puantaj MVP renklerini kullanan Rainwater'a ait kurumsal bir çalışma sistemidir.
- Arayüz profesyonel, ölçülü ve kurumsal görünmelidir. Gereksiz dekorasyon, anlamsız kart kalabalığı ve yapay görünen pazarlama metinlerinden kaçınılır.
- Portal dili Türkçedir.

## Resmi tasarım kaynaklarından alınan ilkeler

- GNOME: temel işlevler mevcut pencere içinde sunulmalı; gereksiz ikincil pencere yığınlarından kaçınılmalı.
- GNOME: Activities görünümü uygulama, pencere, çalışma alanı ve aramayı tek noktada birleştirir.
- GNOME: bildirimler yalnızca kullanıcı başka uygulamadayken anlamlı olaylar için kullanılmalı; uygulama içi durum bilgisi bildirimlere bağımlı olmamalı.
- KDE: arayüz varsayılan olarak sade, ihtiyaç olduğunda güçlü olmalı.
- KDE: masaüstünde kalıcı kenar paneli; dar ekranlarda isteğe bağlı panel kullanılmalı.
- KDE: ana içerik alanı mümkün olduğunca geniş tutulmalı; bağlamsal araçlar gerektiğinde gösterilmeli.
- KDE: çok sayıda üst düzey hedef için kenar paneli, ilişkili az sayıda görünüm için sekme kullanılmalı.

Kaynaklar:

- https://developer.gnome.org/hig/guidelines/navigation.html
- https://developer.gnome.org/hig/patterns/feedback/notifications.html
- https://help.gnome.org/gnome-help/shell-introduction.html
- https://help.gnome.org/gnome-help/shell-windows.html
- https://develop.kde.org/hig/layout_and_nav/
- https://develop.kde.org/hig/displaying_content/
- https://develop.kde.org/hig/status_changes/

## Rainwater One yetenekleri

- Kurumsal durum çubuğu ve Rainwater One masaüstü.
- `F1` ile de açılabilen işlevsel Başlat menüsü; uygulama, dosya, ayar, günlük iş akışı ve abonelik kısayollarını içerir.
- `Ctrl + K` ile global komut ve uygulama araması.
- Genişleyip daralabilen sol uygulama paneli; tercih cihazda hatırlanır.
- Açık pencere listesi ve uygulama durum göstergeleri.
- Pencere küçültme, büyütme, kapatma ve yenileme kontrolleri.
- Üst sağ sistem alanında yalnızca bildirim merkezi ve takvim bulunur; Wi-Fi, ses, güç ve Linux benzeri hızlı ayar taklitleri kaldırılmıştır.
- Yerel servis, güvenlik ve sistem yükü göstergeleri.
- Mobil/dar ekranlarda otomatik sadeleşen uyarlanabilir düzen.
- Rainwater One kabuğu, Puantaj MVP ile aynı Rainwater tema değişkenlerini kullanır: açık yağmur mavisi zemin, `#0f6a8c` ana vurgu, koyu lacivert sistem yüzeyleri ve yarı saydam beyaz içerik panelleri.
- Uygulama pencereleri başlık çubuğundan taşınabilir, köşesinden yeniden boyutlandırılabilir, küçültülebilir ve tam ekran yapılabilir.
- Masaüstü simgeleri sürüklenebilir; yerleşimleri cihazda kalıcı olarak hatırlanır.
- Dosyalar masaüstüne sürüklenip bırakıldığında cihazda saklanan masaüstü kısayollarına dönüşür.
- Masaüstü sağ tık menüsünden klasör, hızlı not, depolama, sistem durumu ve ajanda öğeleri eklenebilir; yerleşim sıfırlanabilir.
- Yerleşik **Dosyalar** uygulaması; konumlar, klasörler, liste/ızgara görünümü, arama ve yerel depolama durumunu sunar.
- Rainwater kabuğu, kullanıcı tarafından sağlanan **Sea Blue Cursor Set** içindeki gerçek `.cur` dosyalarından mekanik olarak üretilmiş 24×24 PNG cursorları kullanır.
- Normal seçim, bağlantı, metin, el yazısı, taşıma, kullanılamaz durum ve yeniden boyutlandırma için ayrı SeaBlue cursorları ve ölçeklenmiş hotspot değerleri atanmıştır. Tarayıcının doğal cursor motoru kullanıldığı için takip şaşmaz ve iframe içinde çift cursor oluşmaz.
- Kullanıcı tarafından sağlanan **File as Folders Icon Set**, özgün görünümü değiştirilmeden ICO'dan şeffaf PNG'ye mekanik olarak dönüştürülmüştür.
- File-as-Folders ikonları Dosyalar uygulamasındaki klasör kartlarında, masaüstü klasörlerinde, uygulama panelinde ve görev çubuğunda kullanılır.
- Yeni klasörler için yalnızca 1, 2, 4 ve 8 numaralı File-as-Folders görselleri kullanılır; üzerinde `F` harfi bulunan 5 ve 6 numaralı varyantlar kullanıcı arayüzünde kullanılmaz.
- Üçüncü taraf atıfları `THIRD_PARTY_NOTICES.md` dosyasında ve uygulamadaki hızlı ayarlar → Görsel lisansları bağlantısında korunur.
- Masaüstü simgesi sürükleme işlemi, state güncellemesinden önce sürüklenen öğenin kimlik ve başlangıç konumunu kopyalar; bırakma sonrasında boş drag ref okunmaz.
- DesktopHome bir hata sınırı içindedir. Beklenmeyen masaüstü hatası tüm portalı kapatmak yerine güvenli kurtarma ekranını gösterir.
- Portal, saklanan JWT'nin son kullanma zamanını API isteğinden önce denetler. Süresi dolmuş oturum doğrudan giriş ekranına yönlendirilir; geliştirme modundaki çift effect yüklemesi de tek uçuş kilidiyle çoğaltılmaz.
- Şirket kodu HTML deseni Unicode `v` regex kurallarıyla uyumludur: `[a-z0-9]+(?:-[a-z0-9]+)*`.
- Rainwater One kimliği, Puantaj MVP `YabujinSpinner` / employee boot loader yapısından portala taşınan YABUJIN orbit motorunu kullanır. Puantaj'daki aura, dört orbit, üç uydu, gezegen halkaları, kıvılcım ve 3B çekirdek katmanları korunur; portal çekirdeğinde `RW / ONE` yazısı bulunur.
- Orbit kare ölçü kilidine sahiptir. Tiny 25 px, small 40 px, Ayarlar kartı 150 px, açılış 190 px ve masaüstü 210–320 px arasında sabit ölçek değerleri kullanır; üst bileşenlerin genel `div`/flex kuralları orbiti yatay esnetemez.
- Puantaj kaynaklı orbit animasyonlarının süreleri portal kullanımında uzatılmıştır. Küçük logolarda nebula ve uydu katmanları kapatılarak yük azaltılır; kullanıcı Ayarlar'dan orbiti kapatabilir veya tüm hareketi azaltabilir.
- Yerleşik **Ayarlar** uygulaması; Genel, Görünüm, Abonelik, Hesap, Güvenlik, Bildirimler ve Depolama bölümlerini içerir. Tema, orbit ve azaltılmış hareket tercihleri cihazda kalıcı olarak saklanır.
- Abonelik ayarlarında katalogdaki paketler gerçek platform API'si üzerinden değiştirilebilir; aynı ekranda paket dışı uygulamalar açılıp kapatılabilir ve değişiklikten sonra portal özeti yenilenir.
- Görünüm temaları `rain`, `midnight` ve `pearl` seçenekleridir.
- Eski Çalışma Merkezi, sanal çalışma alanları ve Linux'a özgü gereksiz sistem kontrolleri güncel tasarımdan kaldırılmıştır.
- Büyütülmüş bir pencere kapatılırken veya küçültülürken `maximized` durumu temizlenir; üst çubuk, sidebar/dock ve görev çubuğu her zaman normal düzene geri döner.
- Midnight masaüstü deseni tek bir kesintisiz `repeating-linear-gradient` ile çizilir; eski kesik ızgara görünümü kullanılmaz.
- Yerleşik **Sistem Günlüğü** uygulaması; tarayıcı `error`, yakalanmayan Promise hataları, `console.error`, `console.warn`, masaüstü hata sınırı ve gerçek modül başlatma sonuçlarını toplar.
- Sistem günlüğü cihazda `rainwater_one_system_logs` anahtarıyla en fazla 250 kayıt saklar. Hata/uyarı/bilgi filtreleri, arama, temizleme ve metin olarak dışa aktarma sunar; dock, Başlat ve komut aramasından açılır.

## Modül kararı

- İnsan Kaynakları, Özlük, İzin, Puantaj, Vardiya ve Bordro ayrı uygulamalar değildir.
- Bu işlevlerin tamamı tek **Puantaj MVP** uygulamasında birleşmiştir.
- Portal kataloğunda `hr` ve `payroll` modülleri pasiftir ve kullanıcıya gösterilmez.
- Güncel aktif katalog 7 öğedir: Ana Portal, Puantaj MVP, Rain Teklif, Depo ve Stok, Filo Yönetimi, Gelişmiş Analitik, API ve Entegrasyon.
- Puantaj MVP ve Rain Teklif gerçek bağımsız uygulamalardır.
- Depo, Filo, Analitik ve API alanları şimdilik portal içindeki yerel çalışma yüzeyleridir; gerçek servisleri hazır olduğunda aynı SSO modeliyle bağlanacaktır.

## Yerel servis mimarisi

- Ana portal arayüzü: `http://127.0.0.1:5173`
- Ana portal API: `http://127.0.0.1:8000`
- Puantaj MVP: `http://127.0.0.1:8001`
- Rain Teklif: `http://127.0.0.1:8012`
- Ana portal projesi: `C:\Users\yAbujin\Desktop\ana-portal`
- Rain Teklif projesi: `C:\Users\yAbujin\Desktop\teklif rain`
- Puantaj MVP kaynakları: `C:\Users\yAbujin\Desktop\ana-portal\modules\puantaj`
- Kök dizindeki `start-local.ps1`, Ana Portal arayüzü, Portal API, Puantaj MVP ve Rain Teklif servislerini birlikte başlatır. Açık portları yeniden başlatmaz, süreçleri gizli pencerelerde çalıştırır ve çıktıları `.local/*-local.*.log` dosyalarına yazar.
- Yerel başlatma komutu: `powershell -NoProfile -ExecutionPolicy Bypass -File .\start-local.ps1`.
- Puantaj yerel SQLite veritabanında geçmiş Alembic metadata uyumsuzluğu bulunduğu için başlatıcı geliştirme ortamında `SCHEMA_GUARD_STRICT=false` kullanır; üretim ayarlarını değiştirmez.

## Tek oturum bağlantısı

- Portal, uygulama açılışında kısa ömürlü ve tek kullanımlık geçiş bileti üretir.
- Puantaj tüketim adresi: `/api/portal-sso/consume` ve hedef yönetim yüzeyi `/admin-panel/`.
- Rain Teklif tüketim adresi: `/api/portal-sso/consume` ve hedef uygulama `/teklif/`.
- İki gerçek uygulama da portal hesabını devralır ve tekrar parola istemez.
- Uygulamalar Rainwater One penceresinde yüksek çözünürlüklü iframe içinde çalışır.
- Çerçeve izinleri yalnızca yapılandırılmış portal origin'i için açılır; diğer durumlarda koruyucu çerçeve politikaları devam eder.

## Önemli kaynak dosyalar

- `frontend/src/LinuxDesktop.tsx`: güncel Rainwater One çalışma sistemi kabuğu.
- `frontend/src/linux-desktop.css`: güncel kabuğun görsel sistemi ve uyarlanabilir düzeni.
- `frontend/src/App.tsx`: kimlik doğrulama, portal veri yükleme ve uygulama açılış bileti bağlantısı.
- `backend/app/platform_service.py`: modül kataloğu, paketler ve yerel uygulama dağıtım kayıtları.
- `backend/app/routers/platform.py`: modül açma bileti ve portal yönetim uçları.
- `modules/puantaj/app/routers/portal_sso.py`: Puantaj tek oturum tüketimi.
- `C:\Users\yAbujin\Desktop\teklif rain\backend\app.py`: Rain Teklif tek oturum tüketimi ve gömme izinleri.

## Doğrulanmış durum

- Portal üretim derlemesi başarılı.
- Portal backend testleri başarılı.
- Rain Teklif testleri başarılı.
- Portal, Puantaj MVP ve Rain Teklif sağlık uçları yerelde `200` döndürüyor.
- Puantaj MVP geçişi portal hesabıyla `/admin-panel/` ekranına ulaşıyor.
- Rain Teklif geçişi portal hesabıyla `/teklif/` ekranına ulaşıyor.
- Puantaj yönetici presence heartbeat hatasındaki naive/aware tarih karşılaştırması düzeltildi.

## Sonraki geliştirme ilkeleri

- Yeni gerçek uygulamalar önce ayrı servis olarak çalıştırılmalı, sonra mevcut tek kullanımlık bilet modeliyle Rainwater One'a bağlanmalı.
- Modül yüzeyleri aynı kabuk içinde açılmalı; gereksiz yeni tarayıcı sekmeleri kullanılmamalı.
- Çalışma ortamı özellikleri yalnızca görsel taklit olarak eklenmemeli; klavye, pencere ve çalışma alanı davranışları gerçekten çalışmalıdır.
- Yerel servisler doğrulanmadan barındırma aşamasına geçilmemeli.
- Kullanıcı açıkça istemedikçe mevcut yerel-first yön korunmalıdır.
