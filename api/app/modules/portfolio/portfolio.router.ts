import { Router } from "express"
import * as portfolioController from "./portfolio.controller"

const router = Router()

router.get("/universe", portfolioController.getUniverse)
router.post("/optimize", portfolioController.optimizePortfolio)

export default router
