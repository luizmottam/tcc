import { createClient } from 'redis'

export const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379' // 'redis' é o nome do serviço do compose
})

redisClient.on('error', (err) => console.error('Redis Client Error', err))

redisClient.connect().catch(console.error)