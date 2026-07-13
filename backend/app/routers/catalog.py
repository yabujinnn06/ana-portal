from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Location, Product, Warehouse
from ..schemas import LocationCreate, LocationOut, ProductCreate, ProductOut, WarehouseCreate, WarehouseOut

router = APIRouter(prefix="/catalog", tags=["catalog"])


@router.get("/products", response_model=list[ProductOut])
def list_products(search: str | None = None, db: Session = Depends(get_db)):
    stmt = select(Product).where(Product.active.is_(True)).order_by(Product.sku)
    if search:
        term = f"%{search.strip()}%"
        stmt = stmt.where(Product.sku.ilike(term) | Product.name.ilike(term) | Product.barcode.ilike(term))
    return list(db.scalars(stmt).all())


@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(payload: ProductCreate, db: Session = Depends(get_db)):
    sku = payload.sku.strip().upper()
    if db.scalar(select(Product).where(Product.sku == sku)):
        raise HTTPException(409, "Stok kodu zaten kayıtlı")
    product = Product(**payload.model_dump(exclude={"sku"}), sku=sku)
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.get("/warehouses", response_model=list[WarehouseOut])
def list_warehouses(db: Session = Depends(get_db)):
    return list(db.scalars(select(Warehouse).where(Warehouse.active.is_(True)).order_by(Warehouse.code)).all())


@router.post("/warehouses", response_model=WarehouseOut, status_code=201)
def create_warehouse(payload: WarehouseCreate, db: Session = Depends(get_db)):
    code = payload.code.strip().upper()
    if db.scalar(select(Warehouse).where(Warehouse.code == code)):
        raise HTTPException(409, "Depo kodu zaten kayıtlı")
    warehouse = Warehouse(code=code, name=payload.name.strip())
    db.add(warehouse)
    db.commit()
    db.refresh(warehouse)
    return warehouse


@router.get("/locations", response_model=list[LocationOut])
def list_locations(warehouse_id: int | None = None, db: Session = Depends(get_db)):
    stmt = select(Location).where(Location.active.is_(True)).order_by(Location.code)
    if warehouse_id:
        stmt = stmt.where(Location.warehouse_id == warehouse_id)
    return list(db.scalars(stmt).all())


@router.post("/locations", response_model=LocationOut, status_code=201)
def create_location(payload: LocationCreate, db: Session = Depends(get_db)):
    if not db.get(Warehouse, payload.warehouse_id):
        raise HTTPException(404, "Depo bulunamadı")
    location = Location(**payload.model_dump(exclude={"code", "name"}), code=payload.code.strip().upper(), name=payload.name.strip())
    db.add(location)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(409, "Lokasyon kodu bu depoda zaten kayıtlı")
    db.refresh(location)
    return location
