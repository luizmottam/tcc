import { Request, Response } from "express"
import { PortfolioService } from "./portfolio.service"
import { BUY_AND_HOLD_UNIVERSE } from "./universe"

const portfolioService = new PortfolioService()

export const getUniverse = (_req: Request, res: Response) => {
  res.json(BUY_AND_HOLD_UNIVERSE)
}

export const optimizePortfolio = async (req: Request, res: Response) => {
  try {
    const { tickers, trainStart, trainEnd, testEnd, options } = req.body ?? {}
    if (!trainStart || !trainEnd) {
      res.status(400).json({ error: "Informe trainStart e trainEnd (YYYY-MM-DD)" })
      return
    }

    const result = await portfolioService.optimize({ tickers, trainStart, trainEnd, testEnd, options })
    res.json(result)
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to optimize portfolio",
    })
  }
}
