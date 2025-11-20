from fastapi import APIRouter

router = APIRouter()

@router.get('/get-fronteira-eficiente')
def get_fronteira():
    # no MVP, fronteira entregue pela otimização; essa rota pode chamar a otimização ou retornar cache
    return {"detail":"Chame /get-otimizacao-de-portfolio para obter fronteira junto com resultado."}
