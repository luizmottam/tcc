import { StockService } from "./stock.service"
import { Request, Response } from "express"

const stockService = new StockService()

export const getStockInfo = async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params

    const stock = await stockService.getStockInfo(String(ticker))

    res.json(stock)
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch stock info"
    })
  }
}

export const getStockPrice = async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params

    const price = await stockService.getStockPrice(String(ticker))

    res.json(price)
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch stock price"
    })
  }
}

export const getStockHistory = async (req: Request, res: Response) => {
  try {
    const { ticker } = req.params
    const {range = "1d", interval = "5m"} = req.query

    const history = await stockService.getStockHistory(String(ticker), String(range), String(interval))

    res.json(history)
  } catch (error) {
    res.status(500).json({
      error: "Failed to fetch stock history"
    })
  }
}