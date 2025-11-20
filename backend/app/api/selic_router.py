from fastapi import APIRouter
from app.services.selic_service import get_selic_series

router = APIRouter()

@router.get('/get-selic')
def get_selic():
    return {"selic": []}