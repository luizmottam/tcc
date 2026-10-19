import { Router } from "express"
import * as stockController from "./stock.controller"

const router = Router()

router.get("/:ticker/info", stockController.getStockInfo)
router.get("/:ticker/price", stockController.getStockPrice)
router.get("/:ticker/history", stockController.getStockHistory)

export default router