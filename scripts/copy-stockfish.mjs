import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const source = resolve('node_modules/stockfish/bin')
const destination = resolve('public/engine')
await mkdir(destination, { recursive: true })
for (const file of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  await copyFile(resolve(source, file), resolve(destination, file))
}
await copyFile(resolve('node_modules/stockfish/Copying.txt'), resolve(destination, 'Copying.txt'))
console.log('Stockfish 19 Lite Single-Threaded assets copied to public/engine.')
