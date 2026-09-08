import './App.css'
import { useState } from 'react';

function App() {
  const [stock, setStock] = useState('');
  const [error, setError] = useState('');
  const [res, setRes] = useState<(string | number)[] | null>(null)


  const searchStock = async (stock: string) => {
    if (!stock.trim()) {
      setError('Digite uma ação ou fii')
      setRes(null)
      setStock('')
      return
    }
    try {
      setError('')


      const response = await fetch(`http://localhost:3000/stock/${stock}/info`)
      if (!response.ok) {
        throw new Error()
      }
      const result = await response.json()


      setRes([
        result.symbol,
        result.name,
        result.currency,
        result.price
      ])
    }
    catch (error) {
      setRes(null)
      setStock('')
      setError('Não foi possível encontrar, verifique se o nome está correto');
    }

  }

  return (
    <section className=''>
      <header className='flex'>
        <h1 className='font-bold text-xl '>Interface do TCC</h1>
      </header>

      <main>
        <input className='bg-gray-100' type="text" name="acoes" id="stock" value={stock} onChange={(event) => setStock(event.target.value)} />
        <button className='' onClick={() => searchStock(stock)}>Pesquisar</button>

        {error && <p>{error}</p>}

        {res && res.length > 0 && (
          <div className='flex gap-5'>
            {res.map((x) => {
              return (
                <p key={x}>{x}</p>
              )
            })}
            <input type="checkbox" name="select" id="selectStock" />
          </div>
        )
        }
      </main>
    </section>

  )
}

export default App
