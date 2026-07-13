# Rainwater Ana Portal

Rainwater şirketinin puantaj, depo ve ileride muhasebe modüllerinin birleşeceği ana uygulama.

## İlk modül: Depo

İlk çekirdek; ürün/depo/lokasyon ana verileri, değişmez stok hareket defteri, depo transferi, müşteri sevki, fiili sayım ve rapor API'lerini içerir. Excel çalışma kaynağı değildir; yalnızca kontrollü import/export aracı olarak kullanılacaktır.

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

API dokümantasyonu: `http://localhost:8000/docs`

## İş kuralları

- Stok bakiyesi doğrudan düzenlenmez; her değişiklik hareket kaydıdır.
- Transfer; taslak, sevk edildi, transferde ve teslim alındı durumlarından geçer.
- Müşteri sevki teslim edilene kadar stok akışı ve sevk belgesiyle izlenir.
- Kapatılan fiili sayım tekrar değiştirilemez; fark ters/düzeltme hareketiyle kapanır.
- Seri/lot takibi ürün kartındaki kurallara göre zorunlu hale gelir.
